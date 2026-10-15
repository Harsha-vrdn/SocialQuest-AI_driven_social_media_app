const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function load(file, imports = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX},
  }).outputText;
  const context = {exports: {}, require: name => {
    assert.ok(name in imports, 'Mock supplied for ' + name);
    return imports[name];
  }};
  vm.runInNewContext(source, context);
  return context.exports;
}

function hooks() {
  const slots = [];
  let cursor = 0, updates = 0;
  const effects = [];
  const memo = (factory, deps) => {
    const index = cursor++, previous = slots[index];
    if (!previous || !deps || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
      slots[index] = {value: factory(), deps};
    }
    return slots[index].value;
  };
  const effect = (callback, deps) => memo(() => {effects.push(callback);}, deps);
  const react = {
    memo: (component, compare) => {component.compare = compare; return component;},
    useMemo: memo, useCallback: (callback, deps) => memo(() => callback, deps),
    useLayoutEffect: effect, useEffect: effect,
    useImperativeHandle: (ref, factory) => effect(() => {if (ref) ref.current = factory();}),
    useRef: initial => memo(() => ({current: initial}), []),
    useState: initial => {
      const state = memo(() => {
        const slot = {value: typeof initial === 'function' ? initial() : initial};
        slot.set = value => {
          const next = typeof value === 'function' ? value(slot.value) : value;
          if (!Object.is(next, slot.value)) {slot.value = next; updates++;}
        };
        return slot;
      }, []);
      return [state.value, state.set];
    },
  };
  return {react, render: callback => {
    cursor = 0;
    const value = callback();
    effects.splice(0).forEach(run => run());
    return value;
  }, updates: () => updates};
}

const reconciliation = load('utils/reconcile.ts');

test('session-scoped modals have unique stable keys and reset when the session changes', () => {
  const source = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
  const tree = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = ['EventEditorModal', 'PostComposerModal', 'CommentsSheet'];
  const keyExpressions = new Map();
  const visit = node => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && names.includes(node.tagName.getText(tree))) {
      const key = node.attributes.properties.find(prop => prop.name?.getText(tree) === 'key');
      assert.ok(key?.initializer && ts.isJsxExpression(key.initializer) && key.initializer.expression,
        node.tagName.getText(tree) + ' has a session-scoped key');
      keyExpressions.set(node.tagName.getText(tree), key.initializer.expression.getText(tree));
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.equal(keyExpressions.size, names.length);
  const keysFor = token => names.map(name => vm.runInNewContext(keyExpressions.get(name), {token}));
  for (const session of [null, 'session-one']) {
    const keys = keysFor(session);
    assert.equal(new Set(keys).size, names.length, 'Sibling modals must have distinct keys');
    assert.deepEqual(keysFor(session), keys, 'Ordinary renders retain modal state');
    keysFor('session-two').forEach((key, index) => {
      assert.notEqual(key, keys[index], names[index] + ' resets state on session changes');
    });
  }
});

test('unchanged polls preserve state, row identity, and memoized list props', () => {
  const {reconcileData} = reconciliation;
  const previous = [{id: 1, unread_count: 1, participants: [{id: 2, is_online: true}]}, {id: 3, unread_count: 0}];
  const duplicate = JSON.parse(JSON.stringify(previous));
  assert.equal(reconcileData(previous, duplicate), previous);
  const changed = JSON.parse(JSON.stringify(previous));
  changed[0].participants[0].is_online = false;
  const next = reconcileData(previous, changed);
  assert.notEqual(next, previous);
  assert.notEqual(next[0], previous[0]);
  assert.equal(next[1], previous[1]);
  assert.equal(previous[0].participants[0].is_online, true);
  const reordered = reconcileData(next, [changed[1], changed[0]]);
  assert.equal(reordered[0], next[1]); assert.equal(reordered[1], next[0]);
  assert.equal(reconcileData(next, []).length, 0);
  assert.equal(reconcileData(next[0], {...next[0]}), next[0]);
  assert.notEqual(reconcileData(next[0], {...next[0], unread_count: 9}), next[0]);
});

test('poll setters skip duplicate renders and retain functional update semantics', () => {
  const h = hooks();
  const {useReconciledState} = load('hooks/useReconciledState.ts', {react: h.react, '../utils/reconcile': reconciliation});
  const initial = [{id: 1, body: 'Hello'}];
  let [value, update] = h.render(() => useReconciledState(initial));
  update([{id: 1, body: 'Hello'}]);
  assert.equal(h.updates(), 0);
  update(items => [...items, {id: 2, body: 'New message'}]);
  assert.equal(h.updates(), 1);
  const originalUpdate = update;
  [value, update] = h.render(() => useReconciledState(initial));
  assert.equal(update, originalUpdate); assert.equal(value[0], initial[0]); assert.equal(value.length, 2);
  update(items => items.map(item => ({...item})));
  assert.equal(h.updates(), 1);
});

test('stable event props always call the latest committed session and selection', () => {
  const h = hooks(), calls = [];
  const {useStableActions} = load('hooks/useStableActions.ts', {react: h.react});
  const first = h.render(() => useStableActions({send: body => calls.push(['old-session', 1, body])}));
  first.send('one');
  const second = h.render(() => useStableActions({send: body => calls.push(['new-session', 2, body])}));
  assert.equal(first, second); assert.equal(first.send, second.send);
  first.send('two');
  assert.deepEqual(calls, [['old-session', 1, 'one'], ['new-session', 2, 'two']]);
});

test('memo comparisons include callbacks, changed counts, media, presence, and removed props', () => {
  const {shallowEqualProps} = load('utils/memo.ts');
  for (const key of ['post', 'item']) {
    const item = {id: 1, like_count: 2, media: '/image', participants: [{id: 2, is_online: true}]};
    const onPress = () => {}, previous = {[key]: item, onPress};
    assert.equal(shallowEqualProps(previous, {...previous}), true);
    assert.equal(shallowEqualProps(previous, {...previous, onPress: () => {}}), false);
    for (const patch of [{like_count: 3}, {media: '/new-image'}, {participants: [{id: 2, is_online: false}]}]) {
      assert.equal(shallowEqualProps(previous, {...previous, [key]: {...item, ...patch}}), false);
    }
    assert.equal(shallowEqualProps(previous, {[key]: item}), false);
  }
  for (const file of ['PostCard', 'EventCard', 'ReelItem', 'ConversationRow']) {
    assert.match(fs.readFileSync(path.join(root, 'components', file + '.tsx'), 'utf8'), /memo\([\s\S]*shallowEqualProps\)/);
  }
});

function chatComposerHarness(cache = {current: {}}) {
  const h = hooks();
  const jsx = (type, props) => ({type, props});
  const styles = new Proxy({}, {get: () => ({})});
  const {ChatComposer} = load('components/ChatComposer.tsx', {
    react: h.react, 'react/jsx-runtime': {jsx, jsxs: jsx},
    'react-native': {TextInput: 'TextInput', View: 'View'}, '@expo/vector-icons': {Ionicons: 'Icon'},
    '../appStyles': {getAppStyles: () => styles, getGlassStyles: () => styles},
    '../ChatAttachments': {ChatAttachmentButton: 'AttachmentButton'},
    '../GlassBackdrop': {GlassBackdrop: 'GlassBackdrop', useLiquidGlass: () => false},
    '../Motion': {SoftPressable: 'Pressable'}, '../ThemeProvider': {useTheme: () => ({theme: {colors: {}}})},
  });
  let tree, accepted = true;
  const sent = [], props = {activeChat: {id: 7}, activeChatId: {current: 7}, chatDraftCache: cache,
    outbox: {enqueue: (...args) => {if (accepted) sent.push(args); return accepted;}},
    chatSending: false, attachmentClient: null, me: {id: 1}, sessionToken: {current: 'session'}, token: 'session',
    setMessages: assert.fail, loadMessages: assert.fail, loadChats: assert.fail, setChatComposerHeight: () => {}};
  const render = () => tree = h.render(() => ChatComposer(props));
  const byLabel = label => {
    let result;
    const visit = node => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(visit);
      if (node.props?.accessibilityLabel === label) result = node.props;
      visit(node.props?.children);
    };
    visit(tree); assert.ok(result, label); return result;
  };
  render();
  return {props, render, byLabel, sent, cache, busy: value => {accepted = !value;}};
}

test('composer typing stays local, survives navigation, and never crosses conversations', () => {
  const composer = chatComposerHarness();
  composer.byLabel('Message').onChangeText('Maya draft'); composer.render();
  assert.equal(composer.cache.current[7], 'Maya draft');
  composer.props.activeChat = {id: 8}; composer.props.activeChatId.current = 8; composer.render();
  assert.equal(composer.byLabel('Message').value, '');
  composer.byLabel('Message').onChangeText('Group draft'); composer.render();
  composer.props.activeChat = {id: 7}; composer.props.activeChatId.current = 7; composer.render();
  assert.equal(composer.byLabel('Message').value, 'Maya draft');
  const reopened = chatComposerHarness(composer.cache);
  assert.equal(reopened.byLabel('Message').value, 'Maya draft');
  reopened.busy(true); reopened.byLabel('Send message').onPress(); reopened.render();
  assert.equal(reopened.byLabel('Message').value, 'Maya draft');
  reopened.busy(false); reopened.byLabel('Send message').onPress(); reopened.render();
  assert.equal(reopened.byLabel('Message').value, '');
  assert.deepEqual(reopened.sent, [[7, 'Maya draft']]);
  assert.equal(reopened.cache.current[8], 'Group draft');
});

test('extracted controls retain button/tab roles and explicit accessible names', () => {
  const files = ['App.tsx', 'DiscoverSearch.tsx'];
  for (const folder of ['screens', 'components']) {
    files.push(...fs.readdirSync(path.join(root, folder), {recursive: true}).filter(file => file.endsWith('.tsx')).map(file => path.join(folder, file)));
  }
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = node => {
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(tree) === 'Pressable') {
        const attributes = node.attributes.properties;
        const gestureOnly = attributes.some(prop => prop.name?.getText(tree) === 'accessible' && prop.initializer?.expression?.kind === ts.SyntaxKind.FalseKeyword);
        if (!gestureOnly) {
        const role = attributes.find(prop => prop.name?.getText(tree) === 'accessibilityRole');
        const label = attributes.find(prop => prop.name?.getText(tree) === 'accessibilityLabel');
        assert.ok(['button', 'tab'].includes(role?.initializer?.text), file + ' has a semantic control role');
        assert.ok(label?.initializer, file + ' has a named control');
        assert.notEqual(label.initializer.text, '');
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }
});

test('search typing updates the local query and navigation cache without calling parent setters', () => {
  const h = hooks(), parentWrites = [];
  const jsx = (type, props) => ({type, props});
  const {ExploreScreen} = load('screens/ExploreScreen.tsx', {
    react: h.react, 'react/jsx-runtime': {jsx, jsxs: jsx},
    '@expo/vector-icons': {Ionicons: 'Icon'}, 'react-native': {Text: 'Text', View: 'View'},
    '../appStyles': {getAppStyles: () => ({}), getSocialStyles: () => ({})},
    '../components/Avatar': {Avatar: 'Avatar'}, '../components/EventCard': {EventCard: 'EventCard'},
    '../DiscoverSearch': {DiscoverSearch: 'DiscoverSearch'}, '../Motion': {SoftPressable: 'Pressable'},
    '../ThemeProvider': {useTheme: () => ({theme: {colors: {}}})}, '../utils/social': {nameOf: user => user.username},
  });
  const props = {exploreDraft: {current: ''}, searchResetRequest: 0, nearbyActive: false,
    setNearbyActive: value => parentWrites.push(value), searchKind: 'events', setSearchKind: assert.fail,
    searchFocusRequest: 0, events: [], bottomContentInset: 0};
  let tree = h.render(() => ExploreScreen(props));
  tree.props.onQuery('coffee'); tree = h.render(() => ExploreScreen(props));
  assert.equal(tree.props.query, 'coffee'); assert.equal(props.exploreDraft.current, 'coffee');
  tree.props.onQuery('coffee walk'); tree = h.render(() => ExploreScreen(props));
  assert.equal(tree.props.query, 'coffee walk'); assert.deepEqual(parentWrites, []);
  props.exploreDraft.current = ''; props.searchResetRequest++;
  h.render(() => ExploreScreen(props)); tree = h.render(() => ExploreScreen(props));
  assert.equal(tree.props.query, '');
});

test('comment typing stays inside its sheet while opening and closing still notify the shell', async () => {
  const h = hooks(), writes = [], ref = {current: null};
  const jsx = (type, props) => ({type, props});
  const {CommentsSheet} = load('components/modals/CommentsSheet.tsx', {
    react: h.react, 'react/jsx-runtime': {jsx, jsxs: jsx}, '@expo/vector-icons': {Ionicons: 'Icon'},
    'react-native': {Alert: {alert: assert.fail}, Keyboard: {dismiss() {}}, Platform: {OS: 'android'},
      KeyboardAvoidingView: 'KeyboardAvoidingView', ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput', View: 'View'},
    '../../appStyles': {getAppStyles: () => ({})}, '../../components/Avatar': {Avatar: 'Avatar'},
    '../../Motion': {MotionModal: 'Modal', SoftPressable: 'Pressable'},
    '../../ThemeProvider': {useTheme: () => ({theme: {colors: {}}})},
    '../../utils/social': {rows: value => value, dateOf: () => '', nameOf: user => user.username},
  });
  const props = {ref, api: async () => [], me: {id: 1}, commentPost: null,
    setCommentPost: post => {writes.push(post); props.commentPost = post;},
    setSelectedUser: assert.fail, updateCommentCount: assert.fail, loadNotifications: assert.fail};
  h.render(() => CommentsSheet(props));
  await ref.current.openComments({id: 7, author: {username: 'Maya'}, body: 'A walk', recent_comments: []});
  let tree = h.render(() => CommentsSheet(props));
  const findInput = node => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.map(findInput).find(Boolean);
    return node.type === 'TextInput' ? node.props : findInput(node.props?.children);
  };
  findInput(tree).onChangeText('A thoughtful reply'); tree = h.render(() => CommentsSheet(props));
  assert.equal(findInput(tree).value, 'A thoughtful reply'); assert.equal(writes.length, 1);
  ref.current.closeComments(); h.render(() => CommentsSheet(props));
  assert.equal(writes.length, 2); assert.equal(writes[1], null);
});
