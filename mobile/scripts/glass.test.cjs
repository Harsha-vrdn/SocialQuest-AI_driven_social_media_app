const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const jsx = (type, props) => ({type, props});
function load(file, imports = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX},
  }).outputText;
  const context = {exports: {}, require: name => {
    if (name === 'react/jsx-runtime') return {jsx, jsxs: jsx, Fragment: 'Fragment'};
    if (name in imports) return imports[name];
    throw Error('Unexpected import: ' + name);
  }};
  vm.runInNewContext(code, context);
  return context.exports;
}
const {themes} = load('theme.ts');
const deferred = () => {let resolve, reject; const promise = new Promise((a, b) => {resolve = a; reject = b;}); return {promise, resolve, reject};};
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const style = value => Object.assign({}, ...[value].flat(Infinity).filter(Boolean));

// Render the real provider/backdrop with native availability and OS preference events mocked.
function harness({platform = 'ios', scheme = 'light', api = true, available = true, throws = false, missingPreferenceAPI = false} = {}) {
  const initial = deferred(), slots = [], effects = [], probes = [], listeners = new Set();
  let cursor = 0, dirty = true, preference, tree, theme = themes[scheme], removed = 0;
  const react = {
    createContext: value => {preference = value; return {Provider: 'Provider'};},
    useContext: () => preference,
    useState: value => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = value;
      return [slots[index], next => {slots[index] = next; dirty = true;}];
    },
    useEffect: effect => {const index = cursor++; if (!(index in slots)) {slots[index] = true; effects.push(effect);}},
  };
  const module = load('GlassBackdrop.tsx', {
    react,
    'react-native': {Platform: {OS: platform}, View: 'View', StyleSheet: {absoluteFill: {position: 'absolute', inset: 0}},
      AccessibilityInfo: {
        isReduceTransparencyEnabled: missingPreferenceAPI ? undefined : () => initial.promise,
        addEventListener: (name, listener) => {assert.equal(name, 'reduceTransparencyChanged'); listeners.add(listener); return {remove: () => {listeners.delete(listener); removed++;}};},
      }},
    'expo-glass-effect': {GlassView: 'GlassView',
      isGlassEffectAPIAvailable: () => {probes.push('api'); if (throws) throw Error('Native module unavailable'); return api;},
      isLiquidGlassAvailable: () => {probes.push('design'); return available;}},
    'expo-linear-gradient': {LinearGradient: 'LinearGradient'},
    './ThemeProvider': {useTheme: () => ({theme})}, './themedStyles': {createThemedStyles: factory => factory},
  });
  const cleanups = [];
  function render() {
    while (dirty) {
      dirty = false; cursor = 0; tree = module.GlassPreferenceProvider({children: 'app'}); preference = tree.props.value;
      cleanups.push(...effects.splice(0).map(effect => effect()));
    }
    return tree;
  }
  render();
  return {initial, probes, render, removed: () => removed,
    native: () => {render(); return module.useLiquidGlass();},
    backdrop: props => {render(); return module.GlassBackdrop(props || {});},
    event: value => {listeners.forEach(listener => listener(value)); render();},
    theme: scheme => {theme = themes[scheme];},
    settle: async value => {initial.resolve(value); await initial.promise; await Promise.resolve(); render();},
    reject: async () => {initial.reject(Error('Preference unavailable')); await initial.promise.catch(() => {}); await Promise.resolve(); render();},
    unmount: () => cleanups.forEach(cleanup => cleanup?.()),
  };
}

test('supported iOS uses native regular glass in both app themes without an opaque tint or simulated highlights', async () => {
  const app = harness();
  assert.equal(app.native(), false, 'Use an opaque surface while the OS preference is unknown');
  await app.settle(false);
  assert.equal(app.native(), true);
  for (const scheme of ['light', 'dark']) {
    app.theme(scheme);
    const tree = app.backdrop({native: true, radius: 24}), all = nodes(tree);
    const glass = all.find(node => node.type === 'GlassView');
    assert.ok(glass);
    assert.equal(glass.props.glassEffectStyle, 'regular');
    assert.equal(glass.props.colorScheme, scheme);
    assert.equal(glass.props.tintColor, undefined);
    assert.equal(style(glass.props.style).borderRadius, 24);
    assert.equal(all.some(node => node.type === 'LinearGradient'), false);
    assert.equal(all.length, 2, 'Only the non-interactive wrapper and the native material');
    assert.equal(tree.props.pointerEvents, 'none');
    assert.equal(tree.props.accessible, false);
    assert.equal(tree.props.accessibilityElementsHidden, true);
  }
});

test('accented native glass uses a light tint and nested/decorative surfaces can opt out', async () => {
  const app = harness(); await app.settle(false);
  for (const props of [{native: true, accent: true}, {native: true, tone: 'mint'}]) {
    const glass = nodes(app.backdrop(props)).find(node => node.type === 'GlassView');
    assert.equal(glass.props.tintColor, (props.tone ? themes.light.accents.mint.text : themes.light.colors.accent) + '26');
  }
  const fallback = nodes(app.backdrop({accent: true}));
  assert.equal(fallback.some(node => node.type === 'GlassView'), false);
  assert.ok(fallback.some(node => node.type === 'LinearGradient'));
});

test('older iOS, incompatible builds and absent native APIs retain the non-native fallback', async () => {
  for (const options of [{api: false}, {available: false}, {throws: true}, {platform: 'android'}, {platform: 'web'}]) {
    const app = harness(options); await app.settle(false);
    assert.equal(app.native(), false);
    const all = nodes(app.backdrop({native: true}));
    assert.equal(all.some(node => node.type === 'GlassView'), false);
    assert.ok(all.some(node => node.type === 'LinearGradient'));
    if (options.platform) assert.deepEqual(app.probes, [], 'Do not call iOS APIs on other platforms');
    if (options.api === false) assert.deepEqual(app.probes, ['api'], 'Check the runtime API before checking the design');
  }
});

test('Reduce Transparency switches every glass surface to a fully opaque palette color live', async () => {
  const app = harness(); await app.settle(false);
  app.event(true);
  for (const scheme of ['light', 'dark']) {
    app.theme(scheme);
    for (const props of [{native: true}, {native: true, accent: true}, {native: true, tone: 'mint'}]) {
      const all = nodes(app.backdrop(props));
      assert.equal(app.native(), false);
      assert.equal(all.some(node => ['GlassView', 'LinearGradient'].includes(node.type)), false);
      assert.equal(style(all[1].props.style).backgroundColor, props.tone ? themes[scheme].accents.mint.surface : props.accent ? themes[scheme].colors.selection : themes[scheme].colors.surface);
    }
  }
  app.event(false);
  assert.equal(app.native(), true);
});

test('a stale initial transparency read cannot override a newer accessibility event', async () => {
  const app = harness(); app.event(true); await app.settle(false);
  assert.equal(app.native(), false);
  app.event(false); assert.equal(app.native(), true);
  app.unmount(); assert.equal(app.removed(), 1);
  app.event(true); assert.equal(app.native(), true, 'The OS listener was removed');
});

test('failed accessibility reads stay opaque, and an unmounted provider ignores pending results', async () => {
  const app = harness(); await app.reject(); assert.equal(app.native(), false);
  const disposed = harness(); disposed.unmount(); await disposed.settle(false); assert.equal(disposed.native(), false);
  const oldPlatform = harness({platform: 'android', missingPreferenceAPI: true}); assert.equal(oldPlatform.native(), false);
});

test('native glass screen transitions retain full opacity while preserving motion and children', () => {
  const value = {stopAnimation() {}, setValue() {}, interpolate: config => config};
  const {ScreenTransition} = load('Motion.tsx', {
    react: {createContext: () => ({}), useContext: () => false, forwardRef: fn => fn, useRef: () => ({current: value}), useLayoutEffect() {}},
    'react-native': {Animated: {View: 'Animated.View', Value: function() {return value;}, createAnimatedComponent: component => component}, Easing: {bezier() {}}, Pressable: 'Pressable'},
    './theme': load('theme.ts'),
  });
  const child = {id: 'same-screen'};
  const native = ScreenTransition({children: child, transitionKey: 'Profile', fade: false});
  assert.equal(style(native.props.style).opacity, 1);
  assert.equal(style(native.props.style).transform.length, 2);
  assert.equal(native.props.children, child);
  const fallback = ScreenTransition({children: child, transitionKey: 'Home'});
  assert.deepEqual(Array.from(style(fallback.props.style).opacity.outputRange), [0.3, 1]);
});

test('glass chrome is wired to app controls without glass on content cards or duplicate profile tabs', () => {
  const app = require('./native-source.cjs').nativeAppSource(path.dirname(root));
  assert.match(app, /const nativeGlass = useLiquidGlass\(\)/);
  assert.match(app, /<ScreenTransition fade={!nativeGlass}/);
  assert.match(app, /<GlassBackdrop native radius=\{16\} \/><SearchIcon/);
  assert.match(app, /<GlassBackdrop native radius=\{14\} \/><Ionicons name="settings-outline"/);
  assert.match(app, /<GlassBackdrop native radius=\{16\} \/><Ionicons name="notifications-outline"/);
  assert.match(app, /<GlassBackdrop accent={profileSection === section} \/>/);
  for (const file of ['SettingsScreen.tsx', 'DetailSheet.tsx', 'PostComposer.tsx']) {
    assert.match(fs.readFileSync(path.join(root, file), 'utf8'), /<GlassBackdrop native radius=/);
  }
});
