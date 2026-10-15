const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const jsx = (type, props) => ({type, props});
function load(file, imports = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX},
  }).outputText;
  const context = {...globals, exports: {}, require: name => {
    if (name === 'react/jsx-runtime') return {jsx, jsxs: jsx};
    if (name in imports) return imports[name];
    throw Error('Unexpected import: ' + name);
  }};
  vm.runInNewContext(code, context); return context.exports;
}
function hooks() {
  const slots = [], effects = []; let cursor = 0, dirty = true;
  const state = initial => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], next => {const value = typeof next === 'function' ? next(slots[index]) : next; if (!Object.is(slots[index], value)) {slots[index] = value; dirty = true;}}];
  };
  const effect = (fn, deps) => {
    const index = cursor++, old = slots[index];
    if (!old || deps.some((value, i) => value !== old.deps[i])) {
      slots[index] = {deps}; effects.push(() => {old?.cleanup?.(); slots[index].cleanup = fn();});
    }
  };
  return {react: {useState: state, useRef: initial => state(() => ({current: initial}))[0], useEffect: effect, useLayoutEffect: effect},
    render: fn => {let tree, tries = 0; do {assert.ok(++tries < 20); cursor = 0; dirty = false; tree = fn(); effects.splice(0).forEach(fn => fn());} while (dirty); return tree;},
    cleanup: () => slots.forEach(slot => slot?.cleanup?.())};
}
const theme = load('theme.ts');
const styles = load('appStyles.ts', {'./theme': theme, './themedStyles': {createThemedStyles: fn => fn}});
const flatten = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
const all = node => Array.isArray(node) ? node.flatMap(all) : node && typeof node === 'object' ? [node, ...all(node.props?.children)] : [];
function navigation({width = 360, left = 12, reduced = false, scheme = 'dark', translucent = true, selected: initialSelection = 'Home'} = {}) {
  const h = hooks(), selections = [], animations = [];
  const Animated = {View: 'Animated.View', Value: class {constructor(value) {this.value = value;} setValue(value) {this.value = value;} stopAnimation() {}},
    spring: (value, config) => ({start: () => {animations.push(config); value.setValue(config.toValue);}})};
  const {SlidingTabs, tabIndexAt} = load('SlidingTabs.tsx', {
    react: h.react, 'react-native': {Animated, View: 'View', Text: 'Text', PanResponder: {create: config => ({panHandlers: config})}},
    '@expo/vector-icons': {Ionicons: 'Icon'}, './Motion': {SoftPressable: 'Pressable', Pop: 'Pop', PulseBadge: 'Badge', useReducedMotion: () => reduced},
    './ThemeProvider': {useTheme: () => ({theme: theme.themes[scheme]})}, './appStyles': styles,
  });
  const items = ['Home', 'Events', 'Chats', 'Reels', 'Profile'].map(tab => ({tab, label: tab, icon: 'home-outline', activeIcon: 'home', badge: tab === 'Chats' ? 125 : 0}));
  let selected = initialSelection, tree;
  const render = () => tree = h.render(() => SlidingTabs({items, selected, translucent, onSelect: tab => {selected = tab; selections.push(tab);}}));
  render(); tree.props.ref.current = {measureInWindow: fn => fn(left)};
  tree.props.onLayout({nativeEvent: {layout: {width, height: 54}}}); render();
  const event = (count = 1) => ({nativeEvent: {touches: Array.from({length: count}, () => ({}))}});
  const gesture = (x, dx = 20, dy = 0) => ({moveX: left + x, dx, dy});
  const begin = (x, dx = 20, dy = 0) => {
    const p = tree.props, g = gesture(x, dx, dy); p.onStartShouldSetPanResponderCapture(event());
    const captured = p.onMoveShouldSetPanResponderCapture(event(), g);
    if (captured) {p.onPanResponderGrant(event(), g); render();} return captured;
  };
  return {render, selections, animations, tabIndexAt, begin, event, gesture,
    props: () => tree.props, indicator: () => all(tree).find(node => node.type === 'Animated.View'),
    move: (x, dx = 20, dy = 0, touches = 1) => {tree.props.onPanResponderMove(event(touches), gesture(x, dx, dy)); render();},
    release: x => {tree.props.onPanResponderRelease(event(0), gesture(x)); render();},
    press: tab => {all(tree).find(node => node.type === 'Pressable' && node.props.accessibilityLabel.startsWith(tab)).props.onPress(); render();},
    cleanup: h.cleanup};
}

test('dragging across tabs moves the highlight but commits navigation only on release', () => {
  for (const width of [280, 360, 398, 740]) {
    const app = navigation({width}); assert.equal(app.begin(width * 0.3), true);
    app.move(width * 0.5);
    const pill = app.indicator().props.style;
    assert.equal(pill.width, width / 5);
    assert.ok(Math.abs(pill.transform[0].translateX.value - width * 0.4) < 0.001);
    assert.deepEqual(app.selections, []);
    app.move(width * 0.9); app.release(width * 0.9);
    assert.deepEqual(app.selections, ['Profile']);
    app.begin(width * 0.5, -20); app.move(width * 0.1, -20); app.release(width * 0.1);
    assert.deepEqual(app.selections, ['Profile', 'Home']);
  }
});

test('returning to the inbox mounts the fallback tab indicator on Chats without a Home-to-Chats spring', () => {
  for (const width of [280, 360, 740]) {
    const app = navigation({selected: 'Chats', width});
    assert.equal(app.indicator().props.style.transform[0].translateX.value, 2 * width / 5);
    assert.equal(app.animations.length, 0);
    app.props().onLayout({nativeEvent: {layout: {width: width + 100, height: 54}}}); app.render();
    assert.equal(app.indicator().props.style.transform[0].translateX.value, 2 * (width + 100) / 5);
    assert.equal(app.animations.length, 0);
    app.press('Profile'); assert.equal(app.animations.length, 1, 'Deliberate tab changes still animate');
    app.cleanup();
  }
});

test('tab taps, unread badges and accessible selected state still work in both themes and fallbacks', () => {
  for (const scheme of ['light', 'dark']) for (const translucent of [true, false]) {
    const app = navigation({scheme, translucent}); app.press('Chats');
    assert.deepEqual(app.selections, ['Chats']);
    const nodes = all(app.render());
    const chat = nodes.find(node => node.props?.accessibilityLabel === 'Chats, 125 unread messages');
    assert.equal(chat.props.accessibilityState.selected, true);
    assert.ok(nodes.some(node => node.type === 'Badge'));
    assert.equal(app.indicator().props.style.backgroundColor, translucent ? theme.themes[scheme].colors.accent + '26' : theme.themes[scheme].colors.selection);
  }
});

test('vertical drags, multiple fingers, system cancellation and dragging off the bar never change tabs', () => {
  const vertical = navigation(); assert.equal(vertical.begin(50, 2, 18), false);
  const multi = navigation(); multi.begin(140); multi.move(280, 80, 0, 2); multi.release(280); assert.deepEqual(multi.selections, []);
  const canceled = navigation(); canceled.begin(140); canceled.move(280); canceled.props().onPanResponderTerminate(); canceled.release(280); assert.deepEqual(canceled.selections, []);
  const off = navigation(); off.begin(140); off.move(280, 140, 80); off.release(280); assert.deepEqual(off.selections, []);
});

test('tab drag clamps at the edges, respects Reduce Motion, and handles missing layout safely', () => {
  const app = navigation({reduced: true}); app.begin(140); app.move(1000); app.release(1000);
  assert.deepEqual(app.selections, ['Profile']); assert.equal(app.animations.length, 0);
  assert.equal(app.tabIndexAt(-100, 360, 5), 0); assert.equal(app.tabIndexAt(1000, 360, 5), 4);
  assert.equal(app.tabIndexAt(20, 0, 5), -1); assert.equal(app.tabIndexAt(20, 360, 0), -1);
  app.cleanup();
});

function messages() {
  const h = hooks(), timers = new Map(), reads = []; let clockId = 0, tree, scrolls = 0;
  const module = load('MessageList.tsx', {react: h.react, 'react-native': {FlatList: 'FlatList', View: 'View'}}, {
    setTimeout: fn => {timers.set(++clockId, fn); return clockId;}, clearTimeout: id => timers.delete(id),
  });
  const data = [{id: 1, sender: {id: 2}}, {id: 2, sender: {id: 2}}, {id: 3, sender: {id: 2}}];
  let top = 80, bottom = 80;
  const render = () => tree = h.render(() => module.MessageList({data, onReadThrough: id => reads.push(id), occludedTop: top, occludedBottom: bottom}));
  render(); tree.props.ref.current = {scrollToEnd: () => scrolls++}; tree.props.onLayout({nativeEvent: {layout: {height: 600}}});
  const cell = (id, y, height) => {let measured = false; const element = tree.props.CellRendererComponent({item: data.find(row => row.id === id), onLayout: () => {measured = true;}, children: 'message'}); element.props.onLayout({nativeEvent: {layout: {y, height}}}); assert.ok(measured);};
  const visible = ids => tree.props.onViewableItemsChanged({viewableItems: ids.map(id => ({item: data.find(item => item.id === id), isViewable: true}))});
  const tick = () => {const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn());};
  return {cell, visible, tick, reads, module, render, cleanup: h.cleanup,
    occlusion: (nextTop, nextBottom) => {top = nextTop; bottom = nextBottom; render();},
    scroll: y => tree.props.onScroll({nativeEvent: {contentOffset: {y}, layoutMeasurement: {height: 600}, contentSize: {height: 1000}}})};
}

test('messages covered by floating chat controls are not read, even when FlatList calls them viewable', () => {
  const app = messages(); app.cell(1, 20, 40); app.cell(2, 220, 40); app.cell(3, 530, 40);
  app.visible([1, 2, 3]); assert.deepEqual(app.reads, []); app.tick(); assert.deepEqual(app.reads, [2]);
  app.scroll(100); app.tick(); assert.deepEqual(app.reads, [2, 3]);
});

test('keyboard lift and expanded composer occlusion cancel pending read receipts and require exposure', () => {
  const app = messages(); app.cell(2, 220, 40); app.visible([2]);
  app.occlusion(300, 80); app.tick(); assert.deepEqual(app.reads, []);
  app.occlusion(80, 400); app.tick(); assert.deepEqual(app.reads, []);
  app.occlusion(80, 80); app.tick(); assert.deepEqual(app.reads, [2]);
  app.visible([2]); app.cleanup(); app.tick(); assert.deepEqual(app.reads, [2]);
});

test('message visibility accounts for partial and tall bubbles, not just their top edge', () => {
  const {visibleAboveChrome: visible} = messages().module;
  assert.equal(visible({y: 510, height: 40}, 0, 600, 80, 80), false);
  assert.equal(visible({y: 480, height: 40}, 0, 600, 80, 80), true);
  assert.equal(visible({y: 100, height: 1000}, 0, 600, 80, 80), true);
  assert.equal(visible({y: 100, height: 40}, 0, 100, 80, 80), false);
});

test('keyboard occlusion stays conservative during animations and ignores stale frame measurements', async () => {
  const h = hooks(), callbacks = new Map(), measurements = [], animations = [], occlusion = [];
  const {KeyboardLift} = load('KeyboardLift.tsx', {
    react: h.react, 'react-native': {View: 'View', Platform: {OS: 'ios'}, Easing: {bezier() {}},
      Keyboard: {addListener: (name, fn) => {callbacks.set(name, fn); return {remove: () => callbacks.delete(name)};}},
      AccessibilityInfo: {isReduceMotionEnabled: async () => false, addEventListener: () => ({remove() {}})},
      Animated: {View: 'Animated.View', Value: class {stopAnimation() {}}, timing: (_value, config) => ({start: finish => animations.push({config, finish})})}},
  });
  const tree = h.render(() => KeyboardLift({children: 'chat', onLiftChange: value => occlusion.push(value)}));
  tree.props.ref.current = {measureInWindow: fn => measurements.push(fn)};
  await Promise.resolve();
  callbacks.get('keyboardWillChangeFrame')({endCoordinates: {screenY: 500}, duration: 250});
  measurements.shift()(0, 100, 390, 700);
  assert.equal(occlusion.at(-1), 300); animations.at(-1).finish({finished: true});
  callbacks.get('keyboardWillHide')({duration: 250});
  assert.equal(occlusion.at(-1), 300, 'Do not expose hidden messages before the hide animation finishes');
  animations.at(-1).finish({finished: true}); assert.equal(occlusion.at(-1), 0);
  callbacks.get('keyboardWillChangeFrame')({endCoordinates: {screenY: 500}});
  callbacks.get('keyboardWillHide')({duration: 250});
  const previous = animations.length; measurements.shift()(0, 100, 390, 700);
  assert.equal(animations.length, previous, 'Ignore a delayed measurement from before keyboard hide');
  h.cleanup(); assert.equal(callbacks.size, 0);
});

function outboxHarness(overrides = {}, timers = {setTimeout, clearTimeout}) {
  const h = hooks(), sent = [], writes = []; let serial = 0, box;
  let options = {session: 'session-a', sender: {id: 1}, api: async (url, init) => {
    writes.push(JSON.parse(init.body)); return {id: 42, ...JSON.parse(init.body)};
  }, onSent: (...args) => sent.push(args), ...overrides};
  const {useChatOutbox} = load('useChatOutbox.ts', {react: h.react, 'expo-crypto': {randomUUID: () => 'send-' + ++serial}}, {AbortController, ...timers});
  const render = changes => {options = {...options, ...changes}; box = h.render(() => useChatOutbox(options)); return box;};
  render();
  return {render, sent, writes, box: () => box, tick: async () => {await new Promise(setImmediate); render();}, cleanup: h.cleanup};
}

test('outbox shows sending immediately, rejects duplicate taps, then acknowledges only once', async () => {
  let complete; const writes = [];
  const app = outboxHarness({api: (_url, init) => {writes.push(JSON.parse(init.body)); return new Promise(resolve => {complete = resolve;});}});
  assert.equal(app.box().enqueue(7, ' Hello '), true);
  assert.equal(app.box().enqueue(7, 'Hello'), false);
  let box = app.render(); assert.equal(box.entries.length, 1); assert.equal(box.entries[0].delivery_status, 'sending');
  assert.equal(box.entries[0].body, 'Hello'); assert.ok(box.entries[0].id < 0);
  complete({id: 42, client_id: writes[0].client_id}); await app.tick();
  assert.equal(app.box().entries.length, 0); assert.equal(writes.length, 1); assert.equal(app.sent.length, 1);
});

test('failed messages stay with their conversation and retry the exact client ID without duplicate requests', async () => {
  let fail = true; const writes = [];
  const app = outboxHarness({api: async (_url, init) => {writes.push(JSON.parse(init.body)); if (fail) throw Error('Offline'); return {id: 42};}});
  app.box().enqueue(7, 'Keep me'); await app.tick();
  const entry = app.box().entries[0]; assert.equal(entry.delivery_status, 'failed'); assert.equal(entry.error, 'Offline');
  app.box().enqueue(8, 'Other chat'); await app.tick();
  assert.equal(app.box().entries[0].conversation, 7); assert.equal(app.box().entries[0].body, 'Keep me');
  fail = false; app.box().retry(entry.client_id); app.box().retry(entry.client_id); await app.tick();
  assert.equal(writes.length, 3); assert.equal(writes[2].client_id, writes[0].client_id); assert.equal(writes[2].body, writes[0].body);
  assert.equal(app.box().entries.length, 1); assert.equal(app.box().entries[0].conversation, 8);
  app.box().discard(app.box().entries[0].client_id); assert.equal(app.render().entries.length, 0);
});

test('polling reconciles a lost send response and sessions discard old outbox callbacks', async () => {
  const app = outboxHarness({api: async () => {throw Error('Response lost');}});
  app.box().enqueue(7, 'Maybe accepted'); await app.tick();
  app.box().reconcile([{id: 42, client_id: app.box().entries[0].client_id}]); assert.equal(app.render().entries.length, 0);
  let complete;
  app.render({api: () => new Promise(resolve => {complete = resolve;})});
  app.box().enqueue(7, 'Old session'); app.render({session: 'session-b', sender: {id: 2}});
  complete({id: 43}); await app.tick(); assert.equal(app.sent.length, 0); assert.equal(app.box().entries.length, 0);
  assert.equal(app.box().enqueue(7, 'New account'), true); app.cleanup();
});

test('server-acknowledged sends are never turned red by a subsequent refresh failure', async () => {
  const refreshes = [];
  const app = outboxHarness({onSent: () => refreshes.push(Promise.allSettled([Promise.reject(Error('Refresh failed'))]))});
  app.box().enqueue(7, 'Accepted'); await app.tick(); await Promise.all(refreshes);
  assert.equal(app.box().entries.length, 0); assert.equal(app.writes.length, 1);
});

test('an unresponsive send times out, releases its lock and can be retried with the same identifier', async () => {
  let deadline, signal; const requests = [];
  const app = outboxHarness({api: (_path, options) => {signal = options.signal; requests.push(JSON.parse(options.body)); return new Promise(() => {});}},
    {setTimeout: fn => {deadline = fn; return 1;}, clearTimeout() {}});
  app.box().enqueue(7, 'Retry me'); deadline(); await app.tick();
  assert.equal(signal.aborted, true); assert.equal(app.box().entries[0].delivery_status, 'failed');
  app.box().retry(app.box().entries[0].client_id); assert.equal(requests[1].client_id, requests[0].client_id);
  app.cleanup(); await app.tick(); assert.equal(app.sent.length, 0);
});

test('delivery indicators distinguish red unsent, yellow unread and green read in both themes without color alone', () => {
  for (const scheme of ['light', 'dark']) {
    const {MessageStatus} = load('MessageStatus.tsx', {'react-native': {Text: 'Text', View: 'View'}, './theme': theme,
      './ThemeProvider': {useTheme: () => ({theme: theme.themes[scheme]})}});
    const colors = [];
    for (const status of ['failed', 'sent', 'read']) {
      const element = MessageStatus({status, group: true});
      assert.ok(element.props.accessible); assert.ok(element.props.accessibilityLabel);
      assert.equal(element.props.children[1].props.children, element.props.accessibilityLabel);
      colors.push(element.props.children[0].props.style.backgroundColor);
    }
    assert.equal(new Set(colors).size, 3); assert.equal(colors[1], '#FACC15');
    assert.equal(MessageStatus({status: 'read', group: true}).props.accessibilityLabel, 'Read by everyone');
  }
});

test('iOS chat back previews are noninteractive and hidden from accessibility with finger-driven parallax', () => {
  for (const reduced of [false, true]) {
    const h = hooks(); let options;
    const {SwipeBackView} = load('SwipeBackView.tsx', {react: h.react,
      'react-native': {View: 'View', Animated: {View: 'Animated'}, Keyboard: {dismiss() {}}, useWindowDimensions: () => ({width: 390})},
      './ThemeProvider': {useTheme: () => ({theme: theme.themes.dark})}, './Motion': {useReducedMotion: () => reduced},
      './useSwipeDismiss': {useSwipeDismiss: config => {options = config; return {panHandlers: {}, offset: {interpolate: x => x}};}}});
    const changes = [], tree = h.render(() => SwipeBackView({children: 'Chat', preview: 'Inbox', onBack() {}, onGestureActiveChange: active => changes.push(active)}));
    const preview = tree.props.children[0]; assert.equal(preview.props.pointerEvents, 'none');
    assert.equal(preview.props.importantForAccessibility, 'no-hide-descendants'); assert.equal(preview.props.accessibilityElementsHidden, true);
    assert.equal(preview.props.children, 'Inbox'); assert.equal(tree.props.children[2].props.children, 'Chat');
    assert.equal(preview.props.style.transform[0].translateX.outputRange[0], reduced ? 0 : -70.2);
    assert.equal(options.edgeWidth, 32); assert.equal(options.resetKey, 390);
    options.onActiveChange(true); options.onActiveChange(false); assert.deepEqual(changes, [true, false]);
  }
});

test('Android conversations use a plain wrapper with accessible Back and no gesture or mounted preview', () => {
  for (const scheme of ['light', 'dark']) {
    const {SwipeBackView} = load('SwipeBackView.android.tsx', {
      'react-native': {View: 'View'}, './ThemeProvider': {useTheme: () => ({theme: theme.themes[scheme]})},
    });
    let backs = 0;
    const child = {type: 'Chat'}, preview = {type: 'Inbox'};
    const tree = SwipeBackView({children: child, preview, onBack: () => backs++, style: {flex: 1},
      onGestureActiveChange: () => assert.fail('Android must not enter predictive Back tracking')});
    assert.equal(tree.type, 'View'); assert.equal(tree.props.children, child);
    assert.equal(flatten(tree.props.style).backgroundColor, theme.themes[scheme].colors.background);
    assert.equal(Object.keys(tree.props).some(name => /Responder|Touch|Gesture/.test(name)), false);
    tree.props.onAccessibilityEscape(); assert.equal(backs, 1);
  }
});

test('Android predictive Back stays opted out in Expo config and the native manifest', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
  assert.equal(config.android.predictiveBackGestureEnabled, false);
  const {XML, AndroidConfig} = require('expo/config-plugins');
  const manifestSource = fs.readFileSync(path.join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  return XML.parseXMLAsync(manifestSource).then(manifest => {
    const application = manifest.manifest.application[0];
    assert.equal(application.$['android:enableOnBackInvokedCallback'], 'false');
    const updated = AndroidConfig.PredictiveBackGesture.setPredictiveBackGesture(config, manifest);
    assert.equal(updated.manifest.application[0].$['android:enableOnBackInvokedCallback'], 'false');
  });
});
