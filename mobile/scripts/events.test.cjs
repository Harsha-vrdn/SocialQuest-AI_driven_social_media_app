const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const jsx = (type, props) => ({type, props});
function load(file, imports = {}, globals = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX},
  }).outputText;
  const context = {...globals, exports: {}, require: name => {
    if (name === 'react/jsx-runtime') return {jsx, jsxs: jsx, Fragment: 'Fragment'};
    assert.ok(name in imports, 'Mock supplied for ' + name); return imports[name];
  }};
  vm.runInNewContext(source, context); return context.exports;
}
const themes = load('theme.ts');
const styles = load('appStyles.ts', {'./theme': themes, './themedStyles': {createThemedStyles: factory => factory}});
const flatten = value => Object.assign({}, ...[value].flat(Infinity).filter(Boolean));
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree,
  ...nodes(tree.props?.children), ...nodes(tree.props?.ListHeaderComponent), ...nodes(tree.props?.ListEmptyComponent), ...nodes(tree.props?.ListFooterComponent)] : [];
const texts = tree => nodes(tree).filter(node => node.type === 'Text').map(node => node.props.children).flat().filter(text => typeof text === 'string').join(' ');
const deferred = () => {let resolve, reject; const promise = new Promise((a, b) => {resolve = a; reject = b;}); return {resolve, reject, promise};};

function searchHarness() {
  const slots = [], effects = [], timers = new Map(), requests = [];
  let cursor = 0, dirty = true, nextTimer = 0, tree, handler = async () => [];
  const memo = (create, deps) => {
    const index = cursor++, old = slots[index];
    if (!old || deps.some((dep, i) => !Object.is(dep, old.deps[i]))) slots[index] = {value: create(), deps};
    return slots[index].value;
  };
  const react = {
    useRef: initial => memo(() => ({current: initial}), []),
    useState: initial => {
      const slot = memo(() => ({value: typeof initial === 'function' ? initial() : initial}), []);
      return [slot.value, next => {const value = typeof next === 'function' ? next(slot.value) : next; if (!Object.is(slot.value, value)) {slot.value = value; dirty = true;}}];
    },
    useEffect: (run, deps) => {
      const index = cursor++, old = slots[index];
      if (!old || deps.some((dep, i) => !Object.is(dep, old.deps[i]))) {
        const slot = slots[index] = {deps}; effects.push(() => {old?.cleanup?.(); slot.cleanup = run();});
      }
    },
  };
  const props = {api: (route, options) => {requests.push({route, options}); return handler(route, options);}, query: '', kind: 'events',
    focusRequest: 0, refreshKey: null, eventRevision: 0, nearbyEvents: null, bottomInset: 24,
    onQuery: value => {props.query = value; dirty = true;}, onKind: kind => {props.kind = kind; dirty = true;},
    onExplore: () => {props.nearbyEvents = null;}, onNearby: () => {}, onHost: () => {}, renderEvent: event => event, renderPerson: person => person};
  const {DiscoverSearch} = load('DiscoverSearch.tsx', {
    react, 'react-native': {View: 'View', Text: 'Text', TextInput: 'Input', FlatList: 'List', ActivityIndicator: 'Spinner', Keyboard: {dismiss() {}}, useWindowDimensions: () => ({width: 320})},
    '@expo/vector-icons': {Ionicons: 'Icon'}, './Motion': {SoftPressable: 'Pressable', makeRevealCell: () => 'Cell'},
    './ThemeProvider': {useTheme: () => ({theme: themes.themes.dark})}, './themedStyles': {createThemedStyles: factory => factory}, './theme': themes,
  }, {AbortController, setTimeout: fn => {timers.set(++nextTimer, fn); return nextTimer;}, clearTimeout: id => timers.delete(id)});
  const render = () => {
    let count = 0;
    do {assert.ok(++count < 20); cursor = 0; dirty = false; tree = DiscoverSearch(props); effects.splice(0).forEach(run => run());} while (dirty);
    return tree;
  };
  const settle = async () => {
    const pending = [...timers.values()]; timers.clear(); pending.forEach(run => run());
    for (let i = 0; i < 6; i++) await Promise.resolve(); render();
  };
  const press = (label, role) => {
    const button = nodes(tree).find(node => node.props?.accessibilityLabel === label && (!role || node.props.accessibilityRole === role));
    assert.ok(button, label); button.props.onPress(); render();
  };
  render();
  return {requests, settle, press, handler: next => {handler = next;}, change: updates => {Object.assign(props, updates); render();},
    tree: () => tree, list: () => nodes(tree).find(node => node.type === 'List'),
    cleanup: () => slots.forEach(slot => slot?.cleanup?.())};
}

test('My Events fetches the authenticated scope with search and pagination instead of recommendations', async () => {
  const app = searchHarness();
  app.handler(async route => route.includes('attending=true') ? {results: [{id: 2, my_attendance_status: 'ACCEPTED'}], count: 2, next: 'page2'} : [{id: 1}]);
  await app.settle(); assert.equal(app.requests[0].route, '/events/recommended/');
  app.press('My Events', 'tab'); assert.equal(app.list().props.data.length, 0, 'Hide Explore results immediately');
  await app.settle(); assert.match(app.requests.at(-1).route, /attending=true/);
  assert.equal(app.requests.at(-1).options.singlePage, true);
  assert.equal(app.list().props.data[0].my_attendance_status, 'ACCEPTED');
  app.handler(async () => ({results: [{id: 3, my_attendance_status: 'PENDING'}], count: 2, next: null}));
  app.press('Load more'); await app.settle();
  assert.match(app.requests.at(-1).route, /page=2/);
  assert.deepEqual(Array.from(app.list().props.data, event => event.id), [2, 3]);
  app.change({query: 'café walk'}); await app.settle();
  assert.match(app.requests.at(-1).route, /q=caf%C3%A9%20walk&page=1&attending=true/);
  assert.match(texts(app.list().props.ListHeaderComponent), /Soonest first/); app.cleanup();
});

test('RSVP invalidation hides canceled results immediately and the empty state returns to Explore', async () => {
  const app = searchHarness(); app.press('My Events', 'tab');
  app.handler(async () => ({results: [{id: 2, my_attendance_status: 'ACCEPTED'}], count: 1, next: null}));
  await app.settle(); assert.equal(app.list().props.data.length, 1);
  app.handler(async () => ({results: [], count: 0, next: null}));
  app.change({eventRevision: 1}); assert.equal(app.list().props.data.length, 0, 'Canceled attendance must not remain visible while refreshing');
  await app.settle(); assert.match(texts(app.list().props.ListEmptyComponent), /No upcoming events yet/);
  app.press('Explore events', 'button'); await app.settle();
  assert.equal(app.requests.at(-1).route, '/events/recommended/'); app.cleanup();
});

test('a late My Events response cannot replace Explore results after switching filters', async () => {
  const old = deferred(), current = deferred(), app = searchHarness();
  app.handler(route => route.includes('attending=true') ? old.promise : current.promise);
  app.press('My Events', 'tab'); await app.settle(); const signal = app.requests.at(-1).options.signal;
  app.press('Explore events', 'tab'); await app.settle(); assert.equal(signal.aborted, true);
  current.resolve([{id: 9}]); await app.settle(); old.resolve({results: [{id: 2}], next: null}); await app.settle();
  assert.deepEqual(Array.from(app.list().props.data, event => event.id), [9]); app.cleanup();
});

test('My Events ignores cached nearby events while People search has no RSVP filter', async () => {
  const app = searchHarness(); app.change({nearbyEvents: [{id: 20}]}); await app.settle();
  assert.equal(app.list().props.data[0].id, 20); assert.equal(app.requests.length, 0);
  app.press('My Events', 'tab'); app.handler(async () => ({results: [{id: 7}], count: 1, next: null})); await app.settle();
  assert.match(app.requests.at(-1).route, /attending=true/); assert.equal(app.list().props.data[0].id, 7);
  app.press('People', 'tab'); await app.settle(); assert.match(app.requests.at(-1).route, /^\/people\//);
  assert.equal(nodes(app.tree()).some(node => node.props?.accessibilityLabel === 'My Events'), false);
  app.press('Events', 'tab'); await app.settle();
  assert.match(app.requests.at(-1).route, /attending=true/, 'Switching categories preserves the selected event filter');
  app.press('Near me'); await app.settle(); assert.equal(app.list().props.data[0].id, 20); app.cleanup();
});

test('My Events errors remain retryable instead of showing a false empty state', async () => {
  const app = searchHarness(); app.press('My Events', 'tab'); app.handler(async () => {throw Error('Offline');});
  await app.settle(); assert.match(texts(app.list().props.ListEmptyComponent), /Could not load results/);
  assert.doesNotMatch(texts(app.list().props.ListEmptyComponent), /No upcoming events yet/);
  app.handler(async () => ({results: [{id: 8}], count: 1, next: null})); app.press('Try again'); await app.settle();
  assert.equal(app.list().props.data[0].id, 8); app.cleanup();
});

test('event cards highlight Going in both themes and keep Requested/Invited badges and both actions accessible', () => {
  for (const scheme of ['light', 'dark']) {
    const {EventCard} = load('components/EventCard.tsx', {
      react: {memo: component => component}, 'react-native': {View: 'View', Text: 'Text'}, '../appStyles': styles,
      '../EventArtwork': {EventArtwork: 'Artwork'}, '../Motion': {SoftPressable: 'Pressable'},
      '../ThemeProvider': {useTheme: () => ({theme: themes.themes[scheme]})}, '../utils/memo': {shallowEqualProps: () => false},
      '../utils/social': {nameOf: user => user.username, dateOf: value => value},
    });
    const palette = themes.themes[scheme].colors;
    for (const [status, badge] of [['ACCEPTED', '✓ Going'], ['PENDING', '⏳ Requested'], ['INVITED', '✉ Invited'], ['CANCELLED', ''], ['DENIED', '']]) {
      const opened = [], profiles = [], item = {id: 7, name: 'Coffee', host: {id: 2, username: 'host'}, my_attendance_status: status};
      const tree = EventCard({item, openEvent: id => opened.push(id), setSelectedUser: user => profiles.push(user.id)});
      const card = flatten(tree.props.style);
      assert.equal(card.borderColor, status === 'ACCEPTED' ? palette.accent : palette.border);
      if (badge) {
        const pill = nodes(tree).find(node => node.type === 'Text' && node.props.children === badge);
        assert.ok(pill); assert.equal(flatten(pill.props.style).maxWidth, '100%');
      } else assert.doesNotMatch(texts(tree), /Going|Requested|Invited/);
      const buttons = nodes(tree).filter(node => node.props?.accessibilityRole === 'button');
      assert.equal(buttons.length, 2); buttons.forEach(button => {assert.ok(button.props.accessibilityLabel); button.props.onPress();});
      assert.deepEqual(opened, [7]); assert.deepEqual(profiles, [2]);
    }
  }
});
