const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const jsx = (type, props, key) => ({type, props, key});

function load(file, imports = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX},
  }).outputText;
  const context = {exports: {}, ...globals, require: name => {
    if (name === 'react/jsx-runtime') return {jsx, jsxs: jsx, Fragment: 'Fragment'};
    assert.ok(name in imports, 'Mock supplied for ' + name); return imports[name];
  }};
  vm.runInNewContext(code, context); return context.exports;
}
function hooks() {
  const slots = [], effects = [];
  let cursor = 0;
  const memo = (factory, deps) => {
    const index = cursor++, previous = slots[index];
    if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) slots[index] = {value: factory(), deps};
    return slots[index].value;
  };
  const react = {
    memo: component => component, useMemo: memo, useRef: initial => memo(() => ({current: initial}), []),
    useState: initial => {
      const slot = memo(() => ({value: typeof initial === 'function' ? initial() : initial}), []);
      return [slot.value, update => {slot.value = typeof update === 'function' ? update(slot.value) : update;}];
    },
    useEffect: (run, deps) => {
      const index = cursor++, previous = slots[index];
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
        const slot = slots[index] = {deps}; effects.push(() => {previous?.cleanup?.(); slot.cleanup = run();});
      }
    },
  };
  return {react, render: run => {cursor = 0; const value = run(); effects.splice(0).forEach(effect => effect()); return value;},
    unmount: () => slots.forEach(slot => slot?.cleanup?.())};
}
function nodes(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(child => nodes(child, predicate));
  return [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)];
}
const flatten = style => Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : style || {};
const theme = load('theme.ts');
const styleImports = {'./themedStyles': {createThemedStyles: factory => factory}, './theme': theme};
const styles = load('postStyles.ts', styleImports);
const appStyles = load('appStyles.ts', styleImports);
const makePost = () => ({id: 17, kind: 'POST', body: 'A moment after the hike.', media: '/photo.jpg', location_name: 'Lakeside',
  author: {id: 2, username: 'maya', display_name: 'Maya'}, created_at: '2026-10-15T08:00:00Z', like_count: 5, comment_count: 3,
  liked_by_me: false, quest_title: 'Take the scenic route', event_name: 'Morning hike', recommendation_reason: 'Near you'});

function cardHarness({scheme = 'light', mine = false, post = makePost()} = {}) {
  const h = hooks(), calls = [], alerts = [], timers = new Map(), players = [];
  let timerId = 0;
  const events = load('node_modules/expo/src/hooks/useEvent.ts', {react: h.react});
  const {PostCard, ReelVideo} = load('components/PostCard.tsx', {
    react: h.react, expo: events, 'react-native': {Alert: {alert: (...args) => alerts.push(args)}, Image: 'Image', Text: 'Text', View: 'View'},
    '@expo/vector-icons': {Ionicons: 'Icon'}, 'expo-video': {VideoView: 'Video', useVideoPlayer: (uri, setup) => h.react.useMemo(() => {
      const listeners = new Map(); let muted = false;
      const player = {uri, addListener: (name, callback) => {listeners.set(name, callback); return {remove: () => listeners.delete(name)};}};
      Object.defineProperty(player, 'muted', {get: () => muted, set: value => {muted = value; listeners.get('mutedChange')?.({muted});}});
      setup(player); players.push(player); return player;
    }, [uri])},
    '../postStyles': styles, '../components/Avatar': {Avatar: 'Avatar'}, '../ImageViewer': {ImageViewer: 'Viewer'},
    '../Motion': {SoftPressable: 'Pressable', LikeFeedback: 'Heart', Pop: 'Pop'}, '../PostTime': {RelativeTime: 'Time'},
    '../QuestAttribution': {QuestAttribution: 'Quest'}, '../ThemeProvider': {useTheme: () => ({theme: theme.themes[scheme]})},
    '../utils/memo': {shallowEqualProps() {}}, '../utils/social': {nameOf: user => user.display_name || user.username},
  }, {setTimeout: (run, delay) => {timers.set(++timerId, {run, delay}); return timerId;}, clearTimeout: id => timers.delete(id)});
  const props = {post, mine, onLike: post => calls.push(['like', post.id]), onEdit: post => calls.push(['edit', post.id]),
    onDelete: post => calls.push(['delete', post.id]), onShare: post => calls.push(['share', post.id]),
    onComments: post => calls.push(['comments', post.id]), onOpenProfile: user => calls.push(['profile', user.id]),
    onReport: (post, reason) => calls.push(['report', post.id, reason])};
  const tree = () => PostCard(props);
  return {props, tree, calls, alerts, timers, players, unmount: h.unmount,
    controls: () => nodes(tree(), node => node.type === 'Pressable'),
    press: label => nodes(tree(), node => node.props?.accessibilityLabel === label)[0].props.onPress(),
    child: name => {
      const element = nodes(tree(), node => typeof node.type === 'function' && node.type.name === name)[0];
      assert.ok(element, name); return {element, render: () => h.render(() => element.type(element.props))};
    },
    renderVideo: uri => h.render(() => ReelVideo({uri})),
  };
}

test('photo-centric cards retain accessible actions, counts and attribution in both themes', () => {
  for (const scheme of ['light', 'dark']) for (const liked of [false, true]) {
    const card = cardHarness({scheme}); card.props.post.liked_by_me = liked;
    const tree = card.tree();
    assert.equal(nodes(tree, node => node.type === 'Avatar')[0].props.size, 40);
    assert.ok(nodes(tree, node => node.type === 'Time').some(node => node.props.compact && node.props.prefix === ' · '));
    assert.ok(nodes(tree, node => node.type === 'Text').some(node => node.props.children === '5 likes'));
    assert.ok(nodes(tree, node => node.type === 'Text').some(node => node.props.children === 'View all 3 comments'));
    assert.equal(nodes(tree, node => node.type === 'Quest')[0].props.quest, card.props.post.quest_title);
    for (const control of card.controls()) {
      assert.equal(control.props.accessibilityRole, 'button'); assert.ok(control.props.accessibilityLabel);
      assert.ok(flatten(control.props.style).minHeight >= 44);
    }
    const like = nodes(tree, node => node.props?.accessibilityLabel === (liked ? 'Unlike post' : 'Like post'))[0];
    assert.equal(like.props.accessibilityState.selected, liked);
    assert.equal(like.props.accessibilityValue.text, '5 likes');
    card.press(liked ? 'Unlike post' : 'Like post'); card.press('Open comments'); card.press('Share post'); card.press("Open Maya's profile");
    assert.deepEqual(card.calls, [['like', 17], ['comments', 17], ['share', 17], ['profile', 2]]);
  }
});

test('post options route owner edit/delete and visitor share/report without accidental actions on cancel', () => {
  const own = cardHarness({mine: true}); own.press('Post options');
  const ownerOptions = own.alerts.at(-1)[2];
  assert.deepEqual(Array.from(ownerOptions, option => option.text), ['Edit', 'Delete', 'Cancel']);
  ownerOptions[0].onPress(); ownerOptions[1].onPress(); assert.equal(ownerOptions[1].style, 'destructive');
  assert.equal(ownerOptions[2].onPress, undefined); assert.deepEqual(own.calls, [['edit', 17], ['delete', 17]]);
  const visitor = cardHarness(); visitor.press('Post options');
  const options = visitor.alerts.at(-1)[2];
  assert.deepEqual(Array.from(options, option => option.text), ['Share', 'Report', 'Cancel']);
  options[0].onPress(); options[1].onPress();
  const reasons = visitor.alerts.at(-1)[2]; assert.equal(reasons.length, 3, 'Android alerts support at most three buttons');
  reasons[1].onPress(); assert.deepEqual(visitor.calls, [['share', 17], ['report', 17, 'Abuse or harmful content']]);
});

test('like labels handle zero/singular counts and optional liker callbacks; empty captions remain clean', () => {
  for (const count of [0, 1]) {
    const card = cardHarness({post: {...makePost(), body: '', media: undefined, like_count: count, comment_count: count, quest_title: '', event_name: ''}});
    const label = count === 1 ? '1 like' : '0 likes';
    assert.ok(nodes(card.tree(), node => node.type === 'Text').some(node => node.props.children === label));
    assert.equal(nodes(card.tree(), node => typeof node.type === 'function').length, 0);
    card.press('Open replies'); assert.deepEqual(card.calls, [['comments', 17]]);
  }
  const card = cardHarness(); card.props.onLikes = post => card.calls.push(['likers', post.id]);
  card.press('View 5 likes'); assert.deepEqual(card.calls, [['likers', 17]]);
});

test('captions truncate after two lines, expand locally, and reset their identity when edited', () => {
  const card = cardHarness(), caption = card.child('PostCaption');
  let tree = caption.render();
  nodes(tree, node => !!node.props?.onTextLayout)[0].props.onTextLayout({nativeEvent: {lines: [{}, {}, {}]}});
  tree = caption.render();
  nodes(tree, node => node.props?.accessibilityLabel === 'Show full post caption')[0].props.onPress(); tree = caption.render();
  assert.equal(nodes(tree, node => node.props?.ellipsizeMode === 'tail')[0].props.numberOfLines, undefined);
  nodes(tree, node => node.props?.accessibilityLabel === 'Collapse post caption')[0].props.onPress(); tree = caption.render();
  assert.equal(nodes(tree, node => node.props?.ellipsizeMode === 'tail')[0].props.numberOfLines, 2);
  card.props.post = {...card.props.post, like_count: 6}; assert.equal(card.child('PostCaption').element.key, caption.element.key);
  card.props.post = {...card.props.post, body: 'Edited caption'}; assert.notEqual(card.child('PostCaption').element.key, caption.element.key);
});

test('hero photos cover the card, preserve single/double taps, and cancel timers on unmount', () => {
  for (const doubleTap of [false, true]) {
    const card = cardHarness(), photo = card.child('InteractivePostImage');
    let tree = photo.render();
    assert.equal(nodes(tree, node => node.type === 'Image')[0].props.resizeMode, 'cover');
    const touch = nodes(tree, node => node.type === 'Pressable')[0].props;
    assert.equal(touch.style.aspectRatio, 4 / 5); assert.equal(touch.feedback, 'none');
    touch.onPress(); if (doubleTap) touch.onPress();
    if (!doubleTap) {const [id, timer] = [...card.timers][0]; card.timers.delete(id); timer.run();}
    tree = photo.render();
    assert.equal(nodes(tree, node => node.type === 'Viewer').length, doubleTap ? 0 : 1);
    assert.equal(nodes(tree, node => node.type === 'Heart').length, doubleTap ? 1 : 0);
    assert.deepEqual(card.calls, doubleTap ? [['like', 17]] : []);
    card.unmount(); assert.equal(card.timers.size, 0);
  }
  const card = cardHarness(), photo = card.child('InteractivePostImage');
  nodes(photo.render(), node => node.type === 'Pressable')[0].props.onPress(); card.unmount(); assert.equal(card.timers.size, 0);
});

test('post videos start muted, keep native playback controls and synchronize the audio toggle with native state', () => {
  const card = cardHarness();
  let tree = card.renderVideo('/reel.mp4');
  const video = nodes(tree, node => node.type === 'Video')[0].props;
  assert.equal(video.nativeControls, true); assert.equal(video.contentFit, 'cover'); assert.equal(video.surfaceType, 'textureView');
  assert.equal(card.players[0].muted, true); assert.equal(card.players[0].loop, true);
  nodes(tree, node => node.props?.accessibilityLabel === 'Unmute post video')[0].props.onPress(); tree = card.renderVideo('/reel.mp4');
  assert.equal(card.players[0].muted, false);
  assert.ok(nodes(tree, node => node.props?.accessibilityLabel === 'Mute post video').length);
  card.players[0].muted = true; tree = card.renderVideo('/reel.mp4');
  assert.ok(nodes(tree, node => node.props?.accessibilityLabel === 'Unmute post video').length);
});

test('40-point avatars stay circular for both real photos and initials', () => {
  const {Avatar} = load('components/Avatar.tsx', {
    'react-native': {Image: 'Image', Text: 'Text', View: 'View'}, '../appStyles': appStyles,
    '../ThemeProvider': {useTheme: () => ({theme: theme.themes.light})}, '../utils/social': {nameOf: user => user.username, initial: () => 'M'},
  });
  for (const avatar of [undefined, '/avatar.jpg']) {
    const element = Avatar({user: {...makePost().author, avatar}, size: 40}), style = flatten(element.props.style);
    assert.equal(style.height, 40); assert.equal(style.width, 40); assert.equal(style.borderRadius, 20);
  }
});

test('compact timestamps cover minute/hour/day/year boundaries without changing existing relative labels', () => {
  const {compactRelativeTime, relativeTime} = load('relativeTime.ts'), now = Date.parse('2026-10-15T12:00:00Z');
  for (const [minutes, label] of [[0, 'now'], [1, '1m'], [59, '59m'], [60, '1h'], [120, '2h'], [1440, '1d'], [525600, '1y']]) {
    assert.equal(compactRelativeTime(new Date(now - minutes * 60000).toISOString(), now), label);
  }
  assert.equal(compactRelativeTime('invalid', now), ''); assert.equal(compactRelativeTime(new Date(now + 60000).toISOString(), now), 'now');
  assert.equal(relativeTime(new Date(now - 120 * 60000).toISOString(), now), '2 hrs ago');
});

function reportHandler(context) {
  const source = fs.readFileSync(path.join(root, 'hooks/useSocialQuestController.tsx'), 'utf8');
  const tree = ts.createSourceFile('controller.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  const visit = node => {if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'reportPost') expression = node.initializer.getText(tree); ts.forEachChild(node, visit);};
  visit(tree); assert.ok(expression);
  return vm.runInNewContext(ts.transpileModule('(' + expression + ')', {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText, {...context, Error});
}

test('reporting submits the selected content and reason once, then allows retry after a failure', async () => {
  const requests = [], alerts = [], guard = {current: new Set()};
  let resolve;
  const pending = new Promise(done => {resolve = done;});
  const context = {token: 'test-session', sessionToken: {current: 'test-session'}, me: {id: 1}, reportInFlight: guard,
    api: (...args) => {requests.push(args); return pending;}, Alert: {alert: (...args) => alerts.push(args)}};
  const report = reportHandler(context), task = report(makePost(), ' Spam or scam ');
  await report(makePost(), 'Spam or scam'); assert.equal(requests.length, 1);
  assert.equal(requests[0][0], '/reports/'); assert.equal(requests[0][1].method, 'POST'); assert.equal(requests[0][2], 'test-session');
  assert.deepEqual(JSON.parse(requests[0][1].body), {content_type: 'post', object_id: 17, reason: 'Spam or scam'});
  resolve({id: 9}); await task; assert.equal(guard.current.size, 0); assert.equal(alerts[0][0], 'Report received');
  const failed = reportHandler({...context, api: async () => {throw new Error('Offline');}});
  await failed(makePost(), 'Spam or scam'); assert.equal(guard.current.size, 0); assert.equal(alerts.at(-1)[0], 'Could not report post');
  await report(makePost(), 'Spam or scam'); assert.equal(requests.length, 2);
});

test('report responses from an old session cannot notify a new account; self/empty reports never send', async () => {
  const alerts = [], requests = [], session = {current: 'old-session'};
  let resolve;
  const pending = new Promise(done => {resolve = done;});
  const report = reportHandler({token: 'old-session', sessionToken: session, me: {id: 1}, reportInFlight: {current: new Set()},
    api: (...args) => {requests.push(args); return pending;}, Alert: {alert: (...args) => alerts.push(args)}});
  await report({...makePost(), author: {id: 1}}, 'Spam or scam'); await report(makePost(), '  '); assert.equal(requests.length, 0);
  const task = report(makePost(), 'Abuse or harmful content'); session.current = 'new-session'; resolve({id: 9}); await task;
  assert.equal(requests.length, 1); assert.equal(alerts.length, 0);
  await report(makePost(), 'Spam or scam'); assert.equal(requests.length, 1);
});
