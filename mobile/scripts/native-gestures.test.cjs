const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const jsx = (type, props) => ({type, props});
function load(file, imports = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX},
  }).outputText;
  const context = {exports: {}, require: name => {
    if (name === 'react/jsx-runtime') return {jsx, jsxs: jsx};
    assert.ok(name in imports, 'Mock supplied for ' + name); return imports[name];
  }};
  vm.runInNewContext(code, context); return context.exports;
}
function hooks() {
  const slots = [], effects = []; let cursor = 0, writes = 0;
  const memo = (create, deps) => {
    const index = cursor++, old = slots[index];
    if (!old || deps.some((dep, i) => !Object.is(dep, old.deps[i]))) slots[index] = {value: create(), deps};
    return slots[index].value;
  };
  const react = {
    useRef: initial => memo(() => ({current: initial}), []), useMemo: memo,
    useCallback: (callback, deps) => memo(() => callback, deps),
    useState: initial => {
      const slot = memo(() => ({value: typeof initial === 'function' ? initial() : initial}), []);
      return [slot.value, next => {writes++; slot.value = typeof next === 'function' ? next(slot.value) : next;}];
    },
    useEffect: (run, deps) => {
      const index = cursor++, old = slots[index];
      if (!old || deps.some((dep, i) => !Object.is(dep, old.deps[i]))) {
        const slot = slots[index] = {deps}; effects.push(() => {old?.cleanup?.(); slot.cleanup = run();});
      }
    },
  };
  return {react, writes: () => writes, render: callback => {cursor = 0; const value = callback(); effects.splice(0).forEach(run => run()); return value;},
    cleanup: () => slots.forEach(slot => slot?.cleanup?.())};
}
const all = node => Array.isArray(node) ? node.flatMap(all) : node && typeof node === 'object' ? [node, ...all(node.props?.children)] : [];
function runtime(h) {
  const jobs = [], animations = [], springs = [];
  class Builder {
    constructor(kind) {this.kind = kind; this.callbacks = {}; this.config = {};}
  }
  for (const name of ['enabled', 'manualActivation', 'maxPointers', 'minDistance', 'averageTouches', 'numberOfTaps', 'maxDelay', 'maxDuration', 'maxDistance']) {
    Builder.prototype[name] = function(value) {this.config[name] = value; return this;};
  }
  for (const name of ['onTouchesDown', 'onTouchesMove', 'onStart', 'onUpdate', 'onEnd', 'onFinalize']) {
    Builder.prototype[name] = function(callback) {this.callbacks[name] = callback; return this;};
  }
  const Gesture = {Pan: () => new Builder('pan'), Pinch: () => new Builder('pinch'), Tap: () => new Builder('tap'),
    Simultaneous: (...children) => ({children})};
  const animated = {__esModule: true, default: {View: 'Animated'},
    useSharedValue: initial => h.react.useRef({value: initial}).current,
    useAnimatedStyle: callback => callback(), cancelAnimation() {},
    withTiming: (target, config, complete) => {if (complete) animations.push(complete); return target;},
    withSpring: (target, config, complete) => {springs.push({target, config}); if (complete) animations.push(complete); return target;},
  };
  const worklets = {scheduleOnRN: (callback, ...args) => jobs.push(() => callback(...args)), scheduleOnUI: (callback, ...args) => callback(...args)};
  return {Gesture, animated, worklets, jobs, animations, springs,
    flush: () => jobs.splice(0).forEach(job => job()), finish: () => animations.splice(0).forEach(complete => complete(true))};
}
const touch = (x = 16, y = 100, count = 1) => ({numberOfTouches: count, allTouches: Array.from({length: count}, () => ({x, y, absoluteX: x, absoluteY: y}))});
const move = (x, y = 0, pointers = 1, velocityX = 0, velocityY = 0) => ({translationX: x, translationY: y, numberOfPointers: pointers, velocityX, velocityY, x, y});
function manager() {return {state: 'pending', fail() {this.state = 'failed';}, activate() {this.state = 'active';}};}

function swipeHarness({reduced = false} = {}) {
  const h = hooks(), ui = runtime(h), closes = [], states = [];
  const {useNativeSwipeDismiss} = load('useNativeSwipeDismiss.ts', {
    react: h.react, 'react-native-gesture-handler': {Gesture: ui.Gesture}, 'react-native-reanimated': ui.animated,
    'react-native-worklets': ui.worklets, './dismissGestures': load('dismissGestures.ts'), './Motion': {useReducedMotion: () => reduced},
  });
  let options = {axis: 'x', distance: 390, edgeWidth: 32, enabled: true, resetKey: 1, onDismiss: () => closes.push('closed'), onActiveChange: active => states.push(active)}, value;
  const render = updates => {options = {...options, ...updates}; value = h.render(() => useNativeSwipeDismiss(options)); return value;};
  render();
  return {h, ui, render, value: () => value, closes, states};
}

test('Android edge swipes reject scrolling/multitouch natively and perform no JS work while tracking', () => {
  const app = swipeHarness(), p = app.value().gesture.callbacks;
  const edge = manager(); p.onTouchesDown(touch(140), edge); assert.equal(edge.state, 'failed');
  const scroll = manager(); p.onTouchesDown(touch(), scroll); p.onTouchesMove(touch(17, 140), scroll); assert.equal(scroll.state, 'failed');
  const multi = manager(); p.onTouchesDown(touch(16, 100, 2), multi); assert.equal(multi.state, 'failed');
  const drag = manager(); p.onTouchesDown(touch(), drag); p.onTouchesMove(touch(40, 101), drag); assert.equal(drag.state, 'active');
  p.onStart(); app.ui.flush(); assert.equal(app.states.at(-1), true);
  const writes = app.h.writes();
  for (let i = 0; i < 500; i++) p.onUpdate(move(i, 1));
  assert.equal(app.value().offset.value, 390); assert.equal(app.h.writes(), writes); assert.equal(app.ui.jobs.length, 0);
  p.onEnd(move(130, 1), true); p.onFinalize(); assert.equal(app.closes.length, 0);
  app.ui.finish(); app.ui.flush(); assert.equal(app.closes.length, 1);
});

test('Android swipe cancellation suppresses reads until the return finishes; stale completions cannot navigate', () => {
  for (const interruption of ['cancel', 'hidden', 'replacement', 'unmount']) {
    const app = swipeHarness(), p = app.value().gesture.callbacks;
    p.onStart(); app.ui.flush(); p.onUpdate(move(130)); p.onEnd(move(130), true);
    if (interruption === 'cancel') {app.render({resetKey: 2}); app.value().gesture.callbacks.onFinalize();}
    if (interruption === 'hidden') app.render({enabled: false});
    if (interruption === 'replacement') app.render({resetKey: 2, onDismiss: () => assert.fail('Old gesture closed a new page')});
    if (interruption === 'unmount') app.h.cleanup();
    app.ui.finish(); app.ui.flush(); assert.equal(app.closes.length, 0, interruption);
  }
  const app = swipeHarness(), p = app.value().gesture.callbacks;
  p.onStart(); app.ui.flush(); p.onEnd(move(45), true); p.onFinalize();
  assert.equal(app.states.at(-1), true); app.ui.finish(); app.ui.flush(); assert.equal(app.states.at(-1), false);
});

test('native gesture velocities retain the existing millisecond thresholds and respect reduced motion', () => {
  const app = swipeHarness({reduced: true}), p = app.value().gesture.callbacks;
  p.onStart(); p.onEnd(move(40, 0, 1, 800), true); p.onFinalize(); app.ui.flush();
  assert.equal(app.closes.length, 1); assert.equal(app.ui.animations.length, 0);
  const short = swipeHarness({reduced: true}), q = short.value().gesture.callbacks;
  q.onStart(); q.onEnd(move(40, 0, 1, 0.8), true); q.onFinalize(); short.ui.flush();
  assert.equal(short.closes.length, 0);
});

test('a blocked JS thread cannot lose swipe start effects or publish stale read suppression', () => {
  let starts = 0;
  const app = swipeHarness(), value = app.render({onStart: () => starts++}), p = value.gesture.callbacks;
  p.onStart(); p.onEnd(move(130), true); p.onFinalize();
  // Drain the JS start notification only after the UI has committed the exit.
  app.ui.flush(); assert.equal(starts, 1); assert.equal(app.states.at(-1), true);
  app.ui.finish(); app.ui.flush(); assert.equal(app.closes.length, 1);
  const other = swipeHarness(), q = other.value().gesture.callbacks;
  q.onStart(); q.onEnd(move(40), true); q.onFinalize(); other.ui.finish();
  q.onStart(); other.ui.flush(); assert.equal(other.states.at(-1), true, 'An old return cannot clear the next drag');
});

const theme = load('theme.ts');
const styles = load('appStyles.ts', {'./theme': theme, './themedStyles': {createThemedStyles: create => create}});
function tabsHarness({selected: initialSelection = 'Home', width = 360, reduced = false} = {}) {
  const h = hooks(), ui = runtime(h), selections = [];
  const {SlidingTabs} = load('SlidingTabs.android.tsx', {
    react: h.react, 'react-native': {View: 'View', Text: 'Text'}, '@expo/vector-icons': {Ionicons: 'Icon'},
    'react-native-gesture-handler': {Gesture: ui.Gesture, GestureDetector: 'Detector'}, 'react-native-reanimated': ui.animated,
    'react-native-worklets': ui.worklets, './Motion': {SoftPressable: 'Pressable', Pop: 'Pop', PulseBadge: 'Badge', useReducedMotion: () => reduced},
    './ThemeProvider': {useTheme: () => ({theme: theme.themes.dark})}, './appStyles': styles,
  });
  let items = ['Home', 'Events', 'Chats', 'Reels', 'Profile'].map(tab => ({tab, label: tab, icon: 'home-outline', activeIcon: 'home'}));
  let selected = initialSelection, tree;
  const render = (updates = {}) => {
    selected = updates.selected ?? selected; items = updates.items ?? items;
    return tree = h.render(() => SlidingTabs({items, selected, translucent: true, onSelect: tab => {selections.push(tab); selected = tab;}}));
  };
  const measure = width => {tree.props.children.props.onLayout({nativeEvent: {layout: {width, height: 54}}}); render();};
  render(); measure(width);
  return {h, ui, render, measure, selections, tree: () => tree,
    indicator: () => all(tree).find(node => node.type === 'Animated')};
}

test('Android tab bars remount directly on Chats and resize without animating from Home', () => {
  for (const selected of ['Chats', 'Profile']) for (const width of [280, 360, 740]) {
    const app = tabsHarness({selected, width});
    const index = selected === 'Chats' ? 2 : 4;
    assert.equal(app.indicator().props.style[1].transform[0].translateX, index * width / 5);
    assert.equal(app.ui.springs.length, 0, 'A remount or first layout is not a tab change');
    app.measure(width + 100);
    assert.equal(app.indicator().props.style[1].transform[0].translateX, index * (width + 100) / 5);
    assert.equal(app.ui.springs.length, 0); assert.deepEqual(app.selections, []);
    app.h.cleanup();
  }
});

test('Android selection changes still animate, while Reduce Motion and reordered slots snap directly', () => {
  for (const reduced of [false, true]) {
    const app = tabsHarness({selected: 'Chats', reduced});
    app.render({selected: 'Profile'});
    assert.equal(app.ui.springs.length, reduced ? 0 : 1);
    app.render(); assert.equal(app.indicator().props.style[1].transform[0].translateX, 288);
    const springs = app.ui.springs.length;
    const reordered = ['Profile', 'Home', 'Events', 'Chats', 'Reels'].map(tab => ({tab, label: tab, icon: 'home-outline', activeIcon: 'home'}));
    app.render({items: reordered}); app.render();
    assert.equal(app.indicator().props.style[1].transform[0].translateX, 0);
    assert.equal(app.ui.springs.length, springs); app.h.cleanup();
  }
});

test('Android tab scrubbing never renders or calls JS per move and commits the release position only', () => {
  const app = tabsHarness(), p = app.tree().props.gesture.callbacks;
  const m = manager(); p.onTouchesDown(touch(100), m); p.onTouchesMove(touch(130), m); p.onStart();
  const writes = app.h.writes(); for (let x = 0; x < 350; x++) p.onUpdate(move(x));
  assert.equal(app.h.writes(), writes); assert.equal(app.ui.jobs.length, 0); assert.deepEqual(app.selections, []);
  // The final event can be newer than the last move. Commit and snap to it.
  p.onEnd(move(30), true); p.onFinalize(); app.ui.flush(); assert.deepEqual(app.selections, []);
  p.onTouchesDown(touch(100), m); p.onStart(); p.onUpdate(move(30)); p.onEnd(move(350), true); p.onFinalize(); app.ui.flush();
  assert.deepEqual(app.selections, ['Profile']);
  app.render(); assert.equal(all(app.tree()).find(node => node.props?.accessibilityLabel === 'Profile').props.accessibilityState.selected, true);
});

test('Android tab cancellation, off-track moves, multitouch and unmount never commit navigation', () => {
  for (const mode of ['vertical', 'multi', 'cancel', 'unmount']) {
    const app = tabsHarness(), p = app.tree().props.gesture.callbacks, m = manager();
    p.onTouchesDown(touch(100), m); p.onStart();
    if (mode === 'vertical') {p.onUpdate(move(300, 90)); p.onEnd(move(300, 90), true);}
    if (mode === 'multi') {p.onUpdate(move(300, 0, 2)); p.onEnd(move(300), true);}
    if (mode === 'cancel') p.onEnd(move(300), false);
    if (mode === 'unmount') {p.onEnd(move(300), true); app.h.cleanup();}
    p.onFinalize(); app.ui.flush(); assert.deepEqual(app.selections, [], mode);
  }
});

function photoHarness({reduced = false} = {}) {
  const h = hooks(), ui = runtime(h), closes = [], zooms = [];
  const {useNativePhotoGestures} = load('useNativePhotoGestures.ts', {
    react: h.react, 'react-native-gesture-handler': {Gesture: ui.Gesture}, 'react-native-reanimated': ui.animated,
    'react-native-worklets': ui.worklets, './dismissGestures': load('dismissGestures.ts'), './imageZoom': load('imageZoom.ts'),
    './Motion': {useReducedMotion: () => reduced},
  });
  let props = {image: {width: 390, height: 520}, viewport: {width: 390, height: 620}, resetKey: 'photo-1', enabled: true,
    onClose: () => closes.push('closed'), onZoomChange: percent => zooms.push(percent)}, value;
  const render = changes => {props = {...props, ...changes}; value = h.render(() => useNativePhotoGestures(props)); return value;};
  render(); return {h, ui, render, value: () => value, closes, zooms};
}

test('Android pinch/pan stays on UI with focal zoom, clamped bounds and boundary-only announcements', () => {
  const app = photoHarness(), [pan, pinch] = app.value().gesture.children.map(gesture => gesture.callbacks);
  pan.onTouchesDown(touch(), manager()); pan.onStart(); pan.onUpdate(move(0, 40));
  assert.equal(app.value().dismissOffset.value, 40);
  pinch.onStart({focalX: 195, focalY: 310});
  const writes = app.h.writes();
  for (let i = 0; i < 500; i++) pinch.onUpdate({scale: 1 + (i + 1) / 500, focalX: 215, focalY: 310});
  assert.equal(app.h.writes(), writes); assert.equal(app.ui.jobs.length, 0);
  assert.equal(app.value().transform.value.scale, 2); assert.equal(app.value().transform.value.x, 20);
  pinch.onFinalize(); pan.onUpdate(move(0, 180)); pan.onEnd(move(0, 180, 1, 0, 900), true); pan.onFinalize();
  app.ui.finish(); app.ui.flush(); assert.equal(app.closes.length, 0); assert.equal(app.zooms.at(-1), 200);
  app.value().zoomBy(100); app.ui.flush(); assert.equal(app.value().transform.value.scale, 4);
  app.value().resetZoom(); app.ui.flush(); assert.equal(app.value().transform.value.scale, 1); assert.equal(app.zooms.at(-1), 100);
});

test('Android double taps zoom about the focal point; zoomed pans and canceled dismissals do not close', () => {
  const app = photoHarness(), [pan, , tap] = app.value().gesture.children.map(gesture => gesture.callbacks);
  tap.onEnd({x: 150, y: 250}, true); app.ui.flush(); assert.equal(app.value().transform.value.scale, 2.5);
  pan.onTouchesDown(touch(), manager()); pan.onStart(); pan.onUpdate(move(0, 180)); pan.onEnd(move(0, 180, 1, 0, 900), true); pan.onFinalize();
  app.ui.finish(); app.ui.flush(); assert.equal(app.closes.length, 0);
  tap.onEnd({x: 150, y: 250}, true); app.ui.flush(); assert.equal(app.value().transform.value.scale, 1);
  pan.onTouchesDown(touch(), manager()); pan.onStart(); pan.onUpdate(move(0, 40)); pan.onEnd(move(0, 40), true); pan.onFinalize();
  app.ui.finish(); app.ui.flush(); assert.equal(app.closes.length, 0);
});

test('Android photo exits respect reduced motion and cannot close a replacement image or unmounted viewer', () => {
  for (const mode of ['replacement', 'unmount', 'success']) {
    const app = photoHarness({reduced: true}), p = app.value().gesture.children[0].callbacks;
    p.onTouchesDown(touch(), manager()); p.onStart(); p.onUpdate(move(1, 140)); p.onEnd(move(1, 140), true); p.onFinalize();
    if (mode === 'replacement') app.render({resetKey: 'photo-2'});
    if (mode === 'unmount') app.h.cleanup();
    app.ui.finish(); app.ui.flush(); assert.equal(app.closes.length, mode === 'success' ? 1 : 0, mode);
  }
});

test('delayed zoom announcements cannot overwrite a resized/reset photo', () => {
  const app = photoHarness(), tap = app.value().gesture.children[2].callbacks;
  tap.onEnd({x: 150, y: 250}, true);
  app.render({viewport: {width: 620, height: 390}}); app.ui.flush();
  assert.equal(app.value().transform.value.scale, 1); assert.equal(app.zooms.at(-1), 100);
});

test('SoftPressable uses native scale feedback without owning pressed state, while render-prop styles/children still work', () => {
  const h = hooks(), animations = [], calls = [];
  let reduced = false;
  const {SoftPressable, MotionModal} = load('Motion.tsx', {
    react: {...h.react, createContext: () => ({}), useContext: () => reduced, forwardRef: component => component},
    'react-native': {Animated: {Value: class {setValue(value) {this.value = value;} stopAnimation() {}}, createAnimatedComponent: component => component,
      timing: (_value, config) => ({start: () => animations.push(config)}), spring: (_value, config) => ({start: () => animations.push(config)})},
      Easing: {bezier() {}}, Pressable: 'Pressable', Modal: 'Modal', StyleSheet: {flatten: style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean))}}, './theme': theme,
  });
  const children = ({pressed}) => pressed ? 'Pressed' : 'Resting';
  let style = {transform: [{translateX: 4}]};
  const render = () => h.render(() => SoftPressable({children, style,
    onPressIn: () => calls.push('in'), onPressOut: () => calls.push('out')}, null));
  const tree = render(), before = h.writes(); tree.props.onPressIn({}); tree.props.onPressOut({});
  assert.equal(h.writes(), before); assert.equal(tree.props.children, children);
  assert.equal(tree.props.style[1].transform[0].translateX, 4);
  style = ({pressed}) => ({opacity: pressed ? 0.5 : 1, transform: [{translateX: 4}]});
  const custom = render(); assert.equal(custom.props.style({pressed: true}).opacity, 0.5);
  assert.equal(custom.props.children({pressed: true}), 'Pressed');
  assert.equal(custom.props.style({pressed: false}).transform[0].translateX, 4);
  assert.deepEqual(calls, ['in', 'out']); assert.ok(animations.every(animation => animation.useNativeDriver && animation.isInteraction === false));
  reduced = true; render().props.onPressIn({}); assert.equal(animations.length, 2);
  assert.equal(MotionModal({visible: true}).props.hardwareAccelerated, true);
  assert.equal(MotionModal({visible: true}).props.animationType, 'none');
});

test('Android keyboard lift listens to did events and lifts only the overlap left after native resize', async () => {
  const h = hooks(), listeners = new Map(), measurements = [], animations = [], occlusion = [];
  const {KeyboardLift} = load('KeyboardLift.tsx', {react: h.react,
    'react-native': {View: 'View', Platform: {OS: 'android'}, Easing: {bezier() {}},
      Keyboard: {addListener: (name, run) => {listeners.set(name, run); return {remove: () => listeners.delete(name)};}},
      AccessibilityInfo: {isReduceMotionEnabled: async () => false, addEventListener: () => ({remove() {}})},
      Animated: {View: 'Animated', Value: class {stopAnimation() {}}, timing: (_value, config) => ({start: done => animations.push({config, done})})}},
  });
  const tree = h.render(() => KeyboardLift({children: 'chat', onLiftChange: value => occlusion.push(value)}));
  tree.props.ref.current = {measureInWindow: callback => measurements.push(callback)}; await Promise.resolve();
  assert.equal(listeners.has('keyboardWillChangeFrame'), false);
  listeners.get('keyboardDidShow')({endCoordinates: {screenY: 500}, duration: 200}); measurements.shift()(0, 100, 390, 400);
  assert.equal(animations.length, 0, 'adjustResize already consumed all overlap');
  listeners.get('keyboardDidShow')({endCoordinates: {screenY: 500}, duration: 200}); measurements.shift()(0, 100, 390, 700);
  assert.equal(animations.at(-1).config.toValue, -300); assert.equal(animations.at(-1).config.useNativeDriver, true);
  animations.at(-1).done({finished: true}); listeners.get('keyboardDidHide')({duration: 200});
  assert.equal(occlusion.at(-1), 300); animations.at(-1).done({finished: true}); assert.equal(occlusion.at(-1), 0);
  h.cleanup(); assert.equal(listeners.size, 0);
});

test('live Reduce Motion overrides a stale keyboard preference read and stops the fallback animation', async () => {
  const h = hooks(), listeners = new Map(), measurements = [], animations = [], snaps = [];
  let motionChanged, resolvePreference;
  const preference = new Promise(resolve => {resolvePreference = resolve;});
  const {KeyboardLift} = load('KeyboardLift.tsx', {react: h.react,
    'react-native': {View: 'View', Platform: {OS: 'android'}, Easing: {bezier() {}},
      Keyboard: {addListener: (name, run) => {listeners.set(name, run); return {remove: () => listeners.delete(name)};}},
      AccessibilityInfo: {isReduceMotionEnabled: () => preference, addEventListener: (_name, run) => {motionChanged = run; return {remove() {}};}},
      Animated: {View: 'Animated', Value: class {stopAnimation() {} setValue(value) {snaps.push(value);}},
        timing: (_value, config) => ({start: done => animations.push({config, done})})}},
  });
  const tree = h.render(() => KeyboardLift({children: 'chat'})); tree.props.ref.current = {measureInWindow: callback => measurements.push(callback)};
  motionChanged(true); resolvePreference(false); await Promise.resolve();
  listeners.get('keyboardDidShow')({endCoordinates: {screenY: 500}, duration: 200}); measurements.shift()(0, 100, 390, 700);
  assert.equal(animations.at(-1).config.duration, 0, 'A stale read cannot undo live Reduce Motion');
  motionChanged(true); assert.equal(snaps.at(-1), -300); h.cleanup();
});

test('Android sheets keep gestures on the header, preserve native/backdrop closing and avoid a second keyboard resize', () => {
  let closed = 0, dismissed = 0;
  const {DetailSheet} = load('DetailSheet.android.tsx', {
    'react-native': {Keyboard: {dismiss: () => dismissed++}, StyleSheet: {absoluteFill: {}}, Text: 'Text', View: 'View', useWindowDimensions: () => ({height: 844})},
    'react-native-safe-area-context': {useSafeAreaInsets: () => ({top: 44, bottom: 34})},
    'react-native-gesture-handler': {GestureDetector: 'Detector', GestureHandlerRootView: 'Root'},
    'react-native-reanimated': {__esModule: true, default: {View: 'Animated'}, useAnimatedStyle: create => create()},
    '@expo/vector-icons': {Ionicons: 'Icon'}, './Motion': {MotionModal: 'Modal', SoftPressable: 'Pressable'},
    './useNativeSwipeDismiss': {useNativeSwipeDismiss: () => ({gesture: 'native-pan', offset: {value: 0}})},
    './ThemeProvider': {useTheme: () => ({theme: theme.themes.dark})}, './themedStyles': {createThemedStyles: create => create},
    './theme': theme, './GlassBackdrop': {GlassBackdrop: 'Glass'},
  });
  const content = {type: 'ScrollView', props: {children: 'Long sheet content'}};
  const tree = DetailSheet({visible: true, sheetKey: 2, title: 'DETAILS', closeLabel: 'Close details', onClose: () => closed++, children: content});
  assert.equal(tree.props.animationType, 'fade'); assert.equal(tree.props.children.type, 'Root');
  assert.equal(all(tree).some(node => node.type === 'KeyboardAvoidingView'), false);
  const header = all(tree).find(node => node.type === 'Detector'); assert.equal(all(header).includes(content), false);
  const surface = all(tree).find(node => node.props?.accessibilityViewIsModal);
  assert.ok(surface.props.style[1].height <= 844 - 44 - 8);
  const body = all(tree).find(node => node.props?.children === content);
  assert.ok(body.props.style[1].paddingBottom >= 34);
  all(tree).find(node => node.props?.accessibilityLabel === 'Close details').props.onPress();
  all(tree).find(node => node.props?.accessible === false).props.onPress(); tree.props.onRequestClose();
  assert.equal(closed, 3); assert.equal(dismissed, 3);
});

test('profile and event sheet headers still dismiss downwards using native gestures and cancel short drags', () => {
  for (const title of ['PROFILE', 'EVENT DETAILS']) for (const reduced of [false, true]) {
    const h = hooks(), ui = runtime(h);
    let swipe, closed = 0, dismissed = 0;
    const {useNativeSwipeDismiss} = load('useNativeSwipeDismiss.ts', {
      react: h.react, 'react-native-gesture-handler': {Gesture: ui.Gesture}, 'react-native-reanimated': ui.animated,
      'react-native-worklets': ui.worklets, './dismissGestures': load('dismissGestures.ts'), './Motion': {useReducedMotion: () => reduced},
    });
    const {DetailSheet} = load('DetailSheet.android.tsx', {
      'react-native': {Keyboard: {dismiss: () => dismissed++}, StyleSheet: {absoluteFill: {}}, Text: 'Text', View: 'View', useWindowDimensions: () => ({height: 844})},
      'react-native-safe-area-context': {useSafeAreaInsets: () => ({top: 44, bottom: 34})},
      'react-native-gesture-handler': {GestureDetector: 'Detector', GestureHandlerRootView: 'Root'}, 'react-native-reanimated': ui.animated,
      '@expo/vector-icons': {Ionicons: 'Icon'}, './Motion': {MotionModal: 'Modal', SoftPressable: 'Pressable'},
      './useNativeSwipeDismiss': {useNativeSwipeDismiss: options => {assert.equal(options.axis, 'y'); swipe = useNativeSwipeDismiss(options); return swipe;}},
      './ThemeProvider': {useTheme: () => ({theme: theme.themes.dark})}, './themedStyles': {createThemedStyles: create => create},
      './theme': theme, './GlassBackdrop': {GlassBackdrop: 'Glass'},
    });
    const content = {type: 'List', props: {children: 'Scrollable profile/event'}};
    const tree = h.render(() => DetailSheet({visible: true, title, sheetKey: title, closeLabel: 'Close details', onClose: () => closed++, children: content}));
    assert.equal(all(tree).find(node => node.type === 'Detector').props.gesture, swipe.gesture);
    const p = swipe.gesture.callbacks, drag = manager();
    p.onTouchesDown(touch(160, 100), drag); p.onTouchesMove(touch(160, 150), drag); assert.equal(drag.state, 'active');
    p.onStart(); p.onUpdate(move(0, 30)); p.onEnd(move(0, 30), true); p.onFinalize(); ui.finish(); ui.flush();
    assert.equal(closed, 0, 'A short pull returns the sheet to its starting position');
    p.onTouchesDown(touch(160, 100), drag); p.onTouchesMove(touch(160, 250), drag);
    p.onStart(); p.onUpdate(move(0, 150)); assert.equal(swipe.offset.value, 150);
    p.onEnd(move(0, 150), true); p.onFinalize(); ui.finish(); ui.flush();
    assert.equal(closed, 1, title); assert.equal(dismissed, 1); h.cleanup();
  }
});

test('Android photo UI retains original raster dimensions, loading/retry controls and a native gesture root inside its modal', () => {
  const h = hooks(), requests = [], zooms = [];
  let options, closed = 0, tree;
  const NativeImage = Object.assign(function Image() {}, {getSize: (uri, success, failure) => requests.push({uri, success, failure})});
  const {ImageViewer} = load('ImageViewer.android.tsx', {
    react: h.react, 'react-native': {Image: NativeImage, PixelRatio: {get: () => 3}, Text: 'Text', View: 'View'},
    'react-native-gesture-handler': {GestureDetector: 'Detector', GestureHandlerRootView: 'Root'},
    'react-native-reanimated': {__esModule: true, default: {View: 'Animated'}, useAnimatedStyle: create => create()},
    '@expo/vector-icons': {Ionicons: 'Icon'}, 'react-native-safe-area-context': {useSafeAreaInsets: () => ({top: 24, bottom: 16})},
    './Motion': {MotionModal: 'Modal', SoftPressable: 'Pressable'},
    './useNativePhotoGestures': {useNativePhotoGestures: config => {options = config; return {gesture: 'native-photo', transform: {value: {x: 0, y: 0, scale: 1}},
      dismissOffset: {value: 0}, zoomBy: factor => zooms.push(factor), resetZoom: () => zooms.push('reset')};}},
    './imageZoom': load('imageZoom.ts'), './ThemeProvider': {useTheme: () => ({theme: theme.themes.dark})},
    './themedStyles': {createThemedStyles: create => create}, './theme': theme,
  });
  const render = () => tree = h.render(() => ImageViewer({uri: 'https://example.test/photo.jpg', onClose: () => closed++}));
  const control = label => all(tree).find(node => node.props?.accessibilityLabel === label).props;
  render(); assert.equal(tree.props.children.type, 'Root'); assert.equal(options.enabled, false);
  all(tree).find(node => node.props?.onLayout).props.onLayout({nativeEvent: {layout: {width: 390, height: 620}}}); render();
  requests[0].success(1920, 1280); render();
  let image = all(tree).find(node => node.type === NativeImage).props;
  assert.equal(image.source.width, 1920); assert.equal(image.source.height, 1280); assert.equal(image.source.scale, 1);
  image.onLoad({nativeEvent: {source: {width: 1, height: 1}}}); render(); assert.equal(options.enabled, true);
  assert.equal(all(tree).find(node => node.type === NativeImage).props.source.width, 1920);
  control('Zoom in').onPress(); control('Reset photo zoom').onPress(); assert.deepEqual(zooms, [1.5, 'reset']);
  options.onZoomChange(250); render(); assert.equal(control('Zoom out').disabled, false);
  image.onError(); render(); control('Retry loading photo').onPress(); render(); assert.equal(requests.length, 2);
  control('Close photo viewer').onPress(); tree.props.onRequestClose(); tree.props.children.props.onAccessibilityEscape();
  assert.equal(closed, 3); h.cleanup();
});

test('Expo SDK-matched native dependencies and Babel compile every Android gesture worklet', () => {
  const babel = require('@babel/core');
  const preset = require.resolve('babel-preset-expo', {paths: [require.resolve('expo/package.json')]});
  const supported = require('expo/bundledNativeModules.json');
  const manifest = require('../package.json'), lock = require('../package-lock.json');
  for (const name of ['react-native-gesture-handler', 'react-native-reanimated', 'react-native-worklets']) {
    assert.equal(require(name + '/package.json').version, supported[name].replace('~', ''));
    assert.equal(manifest.dependencies[name], lock.packages[''].dependencies[name]);
  }
  for (const file of ['useNativeSwipeDismiss.ts', 'useNativePhotoGestures.ts', 'SlidingTabs.android.tsx', 'ImageViewer.android.tsx', 'DetailSheet.android.tsx', 'imageZoom.ts', 'dismissGestures.ts']) {
    const compiled = babel.transformFileSync(path.join(root, file), {presets: [[preset, {platform: 'android'}]],
      caller: {name: 'metro', platform: 'android', isDev: true, isServer: false, supportsStaticESM: true}, babelrc: false, configFile: false});
    assert.ok(compiled.code.includes('__workletHash'), file + ' contains compiled UI worklets');
  }
});
