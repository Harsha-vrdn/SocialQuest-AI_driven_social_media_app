const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const jsx = (type, props, key) => ({type, props, key});
function load(file, imports = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX},
  }).outputText;
  const context = {exports: {}, require: name => {
    if (name === 'react/jsx-runtime') return {jsx, jsxs: jsx};
    if (name in imports) return imports[name];
    throw Error('Unexpected import: ' + name);
  }};
  vm.runInNewContext(code, context);
  return context.exports;
}
const themeModule = load('theme.ts');
const {themes} = themeModule;

function storageHarness(initial) {
  let contents = initial, failWrite = false;
  const storage = load('themePreference.ts', {'expo-file-system': {
    Paths: {document: 'documents'}, File: class {
      constructor(directory, name) {assert.equal(directory, 'documents'); assert.equal(name, 'appearance.json');}
      textSync() {if (contents === undefined) throw Error('Missing'); return contents;}
      write(value) {if (failWrite) throw Error('Disk full'); contents = value;}
    },
  }});
  return {storage, contents: () => contents, failWrite: value => {failWrite = value;}};
}

// Runs the real provider with deterministic React hooks and native Appearance events.
function providerHarness({saved, system = 'light', storage = storageHarness(saved).storage} = {}) {
  let cursor = 0, pending = [], dirty = true, rendered, override = 'unspecified';
  const slots = [], listeners = new Set(), nativeChanges = [], frames = [];
  const scheme = () => override === 'unspecified' ? system : override;
  const emit = () => listeners.forEach(listener => listener({colorScheme: scheme()}));
  const memo = (factory, deps) => {
    const index = cursor++, previous = slots[index];
    if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) slots[index] = {deps, value: factory()};
    return slots[index].value;
  };
  const react = {
    createContext: () => ({Provider: 'Provider'}),
    useContext: () => rendered?.props.value,
    useState: initial => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], next => {
        const value = typeof next === 'function' ? next(slots[index]) : next;
        if (!Object.is(value, slots[index])) {slots[index] = value; dirty = true;}
      }];
    },
    useMemo: memo,
    useCallback: (fn, deps) => memo(() => fn, deps),
    useEffect: (effect, deps) => {
      const index = cursor++, previous = slots[index];
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
        slots[index] = {deps};
        pending.push(() => {previous?.cleanup?.(); slots[index].cleanup = effect();});
      }
    },
  };
  const native = {Appearance: {
    getColorScheme: scheme,
    setColorScheme: value => {override = value; nativeChanges.push(value); emit();},
    addChangeListener: listener => {listeners.add(listener); return {remove: () => listeners.delete(listener)};},
  }};
  const {ThemeProvider} = load('ThemeProvider.tsx', {
    react, 'react-native': native, './theme': themeModule, './themePreference': storage,
  });
  const child = {type: 'App', props: {draft: 'Not yet posted'}};
  function flush() {
    let iterations = 0;
    while (dirty) {
      assert.ok(++iterations < 20, 'Provider should settle without a render loop');
      dirty = false; cursor = 0; rendered = ThemeProvider({children: child}); frames.push(rendered);
      const effects = pending; pending = []; effects.forEach(effect => effect());
    }
    return rendered.props.value;
  }
  flush();
  return {frames, nativeChanges, child, value: () => rendered.props.value,
    choose: preference => {rendered.props.value.setPreference(preference); return flush();},
    changeSystem: value => {system = value; emit(); return flush();},
    unmount: () => {slots.forEach(slot => slot?.cleanup?.()); assert.equal(listeners.size, 0);},
  };
}

test('missing, malformed, and unsupported preferences safely follow the system', () => {
  for (const value of [undefined, '', '{', 'null', '[]', '{}', '{"appearance":"sepia"}']) {
    assert.equal(storageHarness(value).storage.readThemePreference(), 'system');
  }
});

test('all appearance choices round-trip through local storage', () => {
  const {storage} = storageHarness();
  for (const preference of ['dark', 'light', 'system']) {
    storage.saveThemePreference(preference);
    assert.equal(storage.readThemePreference(), preference);
  }
});

test('saved dark mode paints the first frame dark even on a light device', () => {
  const app = providerHarness({saved: '{"appearance":"dark"}'});
  assert.equal(app.frames[0].props.value.theme, themes.dark);
  assert.equal(app.value().preference, 'dark');
  assert.equal(app.nativeChanges.at(-1), 'dark');
});

test('system appearance updates live, explicit choices hold, and System releases the override', () => {
  const app = providerHarness({system: 'dark'});
  assert.equal(app.value().theme, themes.dark);
  assert.equal(app.changeSystem('light').theme, themes.light);
  app.choose('dark');
  assert.equal(app.changeSystem('light').theme, themes.dark);
  assert.equal(app.choose('system').theme, themes.light);
  assert.equal(app.nativeChanges.at(-1), 'unspecified');
  assert.equal(app.changeSystem('dark').theme, themes.dark);
  app.choose('light');
  assert.equal(app.changeSystem('dark').theme, themes.light);
  assert.equal(app.choose('system').theme, themes.dark);
  app.unmount();
  assert.equal(app.nativeChanges.at(-1), 'unspecified');
});

test('rapid choices persist the latest preference for the next launch', () => {
  const {storage} = storageHarness();
  const app = providerHarness({storage});
  for (const preference of ['dark', 'light', 'system', 'dark']) app.choose(preference);
  app.unmount();
  const relaunched = providerHarness({storage});
  assert.equal(relaunched.frames[0].props.value.theme, themes.dark);
  assert.equal(relaunched.value().preference, 'dark');
});

test('a failed preference write leaves the new look active and can be retried', () => {
  const disk = storageHarness('{"appearance":"light"}');
  const app = providerHarness({storage: disk.storage});
  disk.failWrite(true);
  assert.equal(app.choose('dark').theme, themes.dark);
  assert.match(app.value().preferenceError, /could not be saved/);
  assert.equal(disk.storage.readThemePreference(), 'light');
  disk.failWrite(false);
  app.choose('dark');
  assert.equal(app.value().preferenceError, '');
  assert.equal(disk.storage.readThemePreference(), 'dark');
});

test('switching themes preserves the child tree identity instead of remounting the app', () => {
  const app = providerHarness();
  for (const preference of ['dark', 'light', 'system']) app.choose(preference);
  for (const frame of app.frames) {
    assert.equal(frame.props.children, app.child);
    assert.equal(frame.key, undefined);
    assert.equal(frame.props.children.key, undefined);
  }
});

const themedStyles = load('themedStyles.ts', {'react-native': {StyleSheet: {create: styles => styles}}});
test('themed styles cache each palette separately and do not mutate earlier styles', () => {
  let calls = 0;
  const styles = themedStyles.createThemedStyles(({colors}) => {calls++; return {card: {backgroundColor: colors.surface}};});
  const light = styles(themes.light), dark = styles(themes.dark);
  assert.notEqual(light, dark);
  assert.equal(styles(themes.light), light); assert.equal(styles(themes.dark), dark);
  assert.equal(calls, 2);
  assert.equal(light.card.backgroundColor, themes.light.colors.surface);
  assert.equal(dark.card.backgroundColor, themes.dark.colors.surface);
});

function contrast(a, b) {
  const luminance = hex => {
    const rgb = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
test('both palettes keep small text, buttons, and colored labels at least 4.5:1', () => {
  for (const theme of Object.values(themes)) {
    const {colors} = theme;
    const pairs = Object.entries(theme.accents).map(([name, accent]) => [name, accent.text, accent.surface]);
    for (const surface of ['background', 'surface', 'field', 'elevated', 'selection']) {
      for (const ink of ['text', 'muted', 'accent']) pairs.push([ink + '/' + surface, colors[ink], colors[surface]]);
    }
    pairs.push(['primary', colors.onPrimary, colors.primary], ['media', colors.onMedia, colors.mediaBackground], ['unread', colors.onUnread, colors.unread]);
    for (const [label, foreground, background] of pairs) {
      assert.ok(contrast(foreground, background) >= 4.5, `${theme.scheme} ${label}: ${contrast(foreground, background).toFixed(2)}`);
    }
  }
});

function appearanceControls(value) {
  const component = load('AppearanceSettings.tsx', {
    'react-native': {View: 'View', Text: 'Text'}, '@expo/vector-icons': {Ionicons: 'Icon'},
    './Motion': {SoftPressable: 'Pressable'}, './ThemeProvider': {useTheme: () => value},
    './theme': themeModule, './themedStyles': themedStyles,
  });
  const nodes = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    nodes.push(node); visit(node.props.children);
  }
  visit(component.AppearanceSettings());
  return nodes;
}
test('appearance controls expose their selection and save all three choices', () => {
  const choices = [];
  const nodes = appearanceControls({theme: themes.dark, preference: 'dark', preferenceError: '', setPreference: value => choices.push(value)});
  const radios = nodes.filter(node => node.props.accessibilityRole === 'radio');
  assert.equal(radios.length, 3);
  assert.deepEqual(radios.map(node => node.props.accessibilityState.checked), [false, true, false]);
  radios.forEach(node => node.props.onPress());
  assert.deepEqual(choices, ['light', 'dark', 'system']);
});

test('appearance UI never claims an unsaved choice was saved', () => {
  const nodes = appearanceControls({theme: themes.dark, preference: 'dark', preferenceError: 'Could not save', setPreference: () => {}});
  const text = nodes.filter(node => node.type === 'Text').map(node => node.props.children).join(' ');
  assert.match(text, /active for this session/);
  assert.doesNotMatch(text, /saved on this device/);
  assert.equal(nodes.filter(node => node.props.accessibilityRole === 'alert').length, 1);
});

test('native projects allow system appearance and do not lock system bars to light mode', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
  assert.equal(config.userInterfaceStyle, 'automatic');
  const android = fs.readFileSync(path.join(root, 'android/app/src/main/res/values/styles.xml'), 'utf8');
  assert.match(android, /Theme.AppCompat.DayNight.NoActionBar/);
  assert.match(android, /windowLightStatusBar">\?attr\/isLightTheme/);
  assert.match(android, /windowLightNavigationBar">\?attr\/isLightTheme/);
  const ios = fs.readFileSync(path.join(root, 'ios/SocialQuest/Info.plist'), 'utf8');
  assert.match(ios, /<key>UIUserInterfaceStyle<\/key>\s*<string>Automatic<\/string>/);
});

test('system bars and the full root use the selected palette while fonts are still loading', () => {
  const source = ts.createSourceFile('App.tsx', fs.readFileSync(path.join(root, 'App.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const app = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'ThemedApp');
  assert.ok(app);
  const compiled = ts.transpileModule('(' + app.getText(source) + ')', {
    compilerOptions: {target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React},
  }).outputText;
  const nodes = tree => tree && typeof tree === 'object' ? [tree, ...tree.children.flatMap(nodes)] : [];
  for (const scheme of ['light', 'dark']) for (const fontState of [[false, null], [true, null], [false, Error('Font unavailable')]]) {
    const render = vm.runInNewContext(compiled, {
      useTheme: () => ({theme: themes[scheme]}), useFonts: () => fontState, require: () => 1,
      SafeAreaProvider: 'SafeArea', RelativeTimeProvider: 'Time', MotionProvider: 'Motion', GlassPreferenceProvider: 'Glass',
      StatusBar: 'StatusBar', NavigationBar: 'NavigationBar', SocialQuestApp: 'App', View: 'View',
      React: {createElement: (type, props, ...children) => ({type, props, children})},
    });
    const tree = render(), children = nodes(tree);
    assert.equal(tree.props.style.flex, 1);
    assert.equal(tree.props.style.backgroundColor, themes[scheme].colors.background);
    for (const type of ['StatusBar', 'NavigationBar']) {
      assert.equal(children.find(node => node.type === type).props.style, scheme === 'dark' ? 'light' : 'dark');
    }
    assert.equal(children.some(node => node.type === 'App'), !!fontState[0] || !!fontState[1]);
  }
  const {GestureRoot} = load('GestureRoot.android.tsx', {
    'react-native-gesture-handler': {GestureHandlerRootView: 'Root'},
    './ThemeProvider': {useTheme: () => ({theme: themes.dark})},
  });
  assert.equal(GestureRoot({children: 'app'}).props.style.backgroundColor, themes.dark.colors.background);
});

test('Android system bar defaults survive repeated Expo prebuilds without white backgrounds or duplicate settings', async () => {
  const {XML} = require('expo/config-plugins');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
  const [pluginPath, options] = config.plugins.find(plugin => Array.isArray(plugin) && plugin[0].includes('withAndroidSystemBars'));
  const plugin = require(path.join(root, pluginPath));
  assert.equal(options.lightBackground, themes.light.colors.background);
  assert.equal(options.darkBackground, themes.dark.colors.background);
  const modConfig = plugin(plugin({name: 'SocialQuest', slug: 'socialquest'}, options), options);
  const mod = async (name, modResults) => (await modConfig.mods.android[name]({
    ...modConfig, modResults, modRequest: {platform: 'android', modName: name, projectRoot: root, platformProjectRoot: path.join(root, 'android')},
  })).modResults;
  for (const [name, directory, color] of [['colors', 'values', themes.light.colors.background], ['colorsNight', 'values-night', themes.dark.colors.background]]) {
    const file = await XML.parseXMLAsync(fs.readFileSync(path.join(root, 'android/app/src/main/res', directory, 'colors.xml'), 'utf8'));
    const result = await mod(name, file);
    const entries = result.resources.color.filter(item => item.$.name === 'app_background');
    assert.equal(entries.length, 1); assert.equal(entries[0]._, color);
  }
  const native = await XML.parseXMLAsync(fs.readFileSync(path.join(root, 'android/app/src/main/res/values/styles.xml'), 'utf8'));
  const result = await mod('styles', native);
  const items = result.resources.style.find(style => style.$.name === 'AppTheme').item;
  for (const [name, expected] of Object.entries({
    'android:windowBackground': '@color/app_background', 'android:colorBackground': '@color/app_background',
    'android:navigationBarColor': '@android:color/transparent', 'android:navigationBarDividerColor': '@android:color/transparent',
    'android:enforceNavigationBarContrast': 'false', expoEnforceNavigationBarContrast: 'false',
    'android:windowLightNavigationBar': '?attr/isLightTheme', 'android:windowLightStatusBar': '?attr/isLightTheme',
  })) {
    const entries = items.filter(item => item.$.name === name);
    assert.equal(entries.length, 1, name); assert.equal(entries[0]._, expected, name);
  }
  const properties = await mod('gradleProperties', [{type: 'property', key: 'edgeToEdgeEnabled', value: 'false'}]);
  assert.deepEqual(properties, [{type: 'property', key: 'edgeToEdgeEnabled', value: 'true'}]);
});
