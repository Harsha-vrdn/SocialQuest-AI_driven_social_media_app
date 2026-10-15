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
    if (name === 'react/jsx-runtime') return {jsx, jsxs: jsx};
    if (name in imports) return imports[name];
    throw Error('Unexpected import: ' + name);
  }};
  vm.runInNewContext(code, context);
  return context.exports;
}
const preferences = load('accountSettings.ts');
const themeModule = load('theme.ts');
const defaultSettings = {location_mode: 'CURRENT', saved_city: '', saved_latitude: null, saved_longitude: null, account_state: 'ACTIVE', deletion_due_at: null};
const deferred = () => {let resolve, reject; const promise = new Promise((a, b) => {resolve = a; reject = b;}); return {promise, resolve, reject};};
function harness({api, mode = 'light', bottomInset = 0} = {}) {
  const slots = [], effects = [], alerts = [], requests = [];
  let cursor = 0, dirty = true, tree, stored = {...defaultSettings}, logouts = 0, suspended = 0, refreshed = 0, backs = 0;
  const state = initial => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], next => {slots[index] = typeof next === 'function' ? next(slots[index]) : next; dirty = true;}];
  };
  const react = {
    useState: state, useRef: initial => state(() => ({current: initial}))[0],
    useEffect: (effect, deps) => {
      const index = cursor++, previous = slots[index];
      if (!previous || deps.some((dep, i) => dep !== previous.deps[i])) {
        slots[index] = {deps}; effects.push(() => {previous?.cleanup?.(); slots[index].cleanup = effect();});
      }
    },
  };
  const theme = themeModule.themes[mode];
  const native = Object.fromEntries(['ActivityIndicator', 'ScrollView', 'Text', 'TextInput', 'View'].map(name => [name, name]));
  Object.assign(native, {Alert: {alert: (...args) => alerts.push(args)}, Keyboard: {dismiss() {}}, Linking: {openSettings: async () => {}}});
  const {SettingsScreen} = load('SettingsScreen.tsx', {
    react, 'react-native': native, '@expo/vector-icons': {Ionicons: 'Ionicons'},
    './AppearanceSettings': {AppearanceSettings: 'AppearanceSettings'}, './Motion': {SoftPressable: 'Pressable'},
    './GlassBackdrop': {GlassBackdrop: 'GlassBackdrop'},
    './ThemeProvider': {useTheme: () => ({theme})}, './themedStyles': {createThemedStyles: fn => fn},
    './theme': themeModule, './accountSettings': preferences,
  });
  const props = {userId: 1, bottomInset, profileCity: 'Mysuru', notifications: jsx('Text', {children: 'Notification controls'}),
    api: async (url, options = {}) => {
      requests.push({url, ...options});
      if (api) return api(url, options);
      if (options.method === 'PATCH') stored = {...stored, ...JSON.parse(options.body)};
      return stored;
    },
    onLocationSaved: () => {refreshed++;}, onLogout: () => {logouts++;}, onAccountSuspended: async () => {suspended++;}, onBack: () => {backs++;},
  };
  function render() {
    let count = 0;
    while (dirty) {assert.ok(count++ < 20); dirty = false; cursor = 0; tree = SettingsScreen(props); effects.splice(0).forEach(fn => fn());}
    return tree;
  }
  function all(node = tree) {
    if (Array.isArray(node)) return node.flatMap(all);
    if (!node || typeof node !== 'object') return [];
    return [node, ...all(node.props?.children ?? null)];
  }
  const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : node === false || node == null ? '' : String(node);
  function button(label) {render(); const result = all().find(node => node.type === 'Pressable' && (node.props.accessibilityLabel === label || text(node) === label)); assert.ok(result, 'Button exists: ' + label); return result;}
  const byLabel = label => {render(); const result = all().find(node => node.props.accessibilityLabel === label); assert.ok(result, label); return result;};
  const press = label => {const item = button(label); assert.ok(!item.props.disabled, label + ' is enabled'); item.props.onPress(); render();};
  const tick = async () => {for (let i = 0; i < 3; i++) {await new Promise(resolve => setImmediate(resolve)); render();}};
  render();
  return {render, all, text: () => text(tree), button, byLabel, press, tick, alerts, requests,
    stored: () => stored, logouts: () => logouts, suspended: () => suspended, refreshed: () => refreshed, backs: () => backs,
    unmount: () => slots.forEach(slot => slot?.cleanup?.()), theme};
}

test('Settings opens from the profile gear as a separate page, not a bottom tab or popup', () => {
  const source = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
  assert.match(source, /tab === 'Settings' \? settingsView/);
  assert.match(source, /const settingsView = me \? <SettingsScreen/);
  const tabs = source.slice(source.indexOf('const mobileTabs:'), source.indexOf('const isChatOpen ='));
  assert.equal((tabs.match(/tab: '/g) || []).length, 5);
  assert.doesNotMatch(tabs, /tab: 'Settings'/);
  assert.doesNotMatch(tabs, /tab: 'Notifications'/);
  const profileSource = fs.readFileSync(path.join(root, 'screens/ProfileScreen.tsx'), 'utf8');
  const profile = profileSource.slice(profileSource.indexOf('const profile = <FlatList'));
  assert.doesNotMatch(profile, /AppearanceSettings|confirmLogout|notificationPermissionCard/);
  assert.match(profile, /accessibilityLabel="Settings"/);
  assert.match(profile, /style={styles.profileSettingsButton} onPress={\(\) => setTab\('Settings'\)}/);
  const others = source.slice(source.indexOf('const isChatOpen ='));
  assert.doesNotMatch(others, /accessibilityLabel="Settings"/);
  assert.match(source, /onBack={\(\) => setTab\('Profile'\)}/);
  const controllerSource = fs.readFileSync(path.join(root, 'hooks/useSocialQuestController.tsx'), 'utf8');
  assert.match(controllerSource, /if \(tab === 'Settings'\) { Keyboard.dismiss\(\); setTab\('Profile'\); return true; }/);
  assert.match(source, /accessibilityLabel="Notifications"/);
});

test('Settings has a working back-to-profile control without changing preferences', async () => {
  const page = harness(); await page.tick();
  page.press('Back to profile');
  assert.equal(page.backs(), 1);
  assert.equal(page.requests.length, 1);
});

test('Settings renders a full scrollable page in both themes', async () => {
  for (const mode of ['light', 'dark']) {
    const page = harness({mode}); await page.tick();
    assert.equal(page.render().type, 'ScrollView');
    assert.equal(page.render().props.testID, 'settings-page');
    assert.equal(page.render().props.automaticallyAdjustKeyboardInsets, true);
    assert.equal(page.all().filter(node => node.type === 'AppearanceSettings').length, 1);
    for (const heading of ['Notifications', 'Location', 'Account']) assert.ok(page.text().includes(heading));
    assert.equal(page.all().some(node => node.type === 'Modal'), false);
  }
});

test('Settings keeps account controls scrollable above a measured floating navigation bar', () => {
  for (const bottomInset of [0, 106, 160]) {
    const page = harness({bottomInset}).render();
    const style = Object.assign({}, ...page.props.contentContainerStyle);
    assert.equal(style.paddingBottom, 32 + bottomInset);
    assert.equal(page.props.scrollIndicatorInsets.bottom, bottomInset);
  }
});

test('saved city dropdown filters, persists coordinates and refreshes discovery', async () => {
  const page = harness(); await page.tick();
  page.press('Saved city'); page.press('Choose saved city');
  page.byLabel('Search cities').props.onChangeText('benga'); page.render();
  page.press('Use Bengaluru, India');
  page.press('Save location preference'); await page.tick();
  assert.equal(page.stored().saved_city, 'Bengaluru, India');
  assert.equal(page.stored().saved_latitude, 12.9716);
  assert.equal(page.stored().location_mode, 'SAVED');
  assert.match(page.text(), /Location preference saved/); assert.equal(page.refreshed(), 1);
  page.press('Device location'); page.press('Save location preference'); await page.tick();
  assert.equal(page.stored().location_mode, 'CURRENT');
});

test('custom cities are supported offline and do not inherit stale coordinates', async () => {
  const page = harness(); await page.tick(); page.press('Saved city'); page.press('Choose saved city');
  page.byLabel('Search cities').props.onChangeText('Cambridge'); page.render();
  page.press('Use “Cambridge”Custom city · matches event location names');
  page.press('Save location preference'); await page.tick();
  assert.equal(page.stored().saved_city, 'Cambridge'); assert.equal(page.stored().saved_latitude, null);
  assert.equal(preferences.citySuggestions('mys', 'Mysuru')[0].name, 'Mysuru');
});

test('saved-city discovery never requests GPS; device mode uses foreground coordinates', async () => {
  let called = 0;
  const locate = async () => {called++; return {latitude: 12.9716, longitude: 77.5946};};
  assert.equal(await preferences.nearbyEventsPath({...defaultSettings, location_mode: 'SAVED'}, locate), '/events/recommended/');
  assert.equal(called, 0);
  assert.match(await preferences.nearbyEventsPath(defaultSettings, locate), /latitude=12.971600&longitude=77.594600/);
  assert.equal(called, 1);
  await assert.rejects(preferences.nearbyEventsPath(defaultSettings, async () => {throw Error('Denied');}), /Denied/);
});

test('empty saved city cannot be saved and failed saves never claim success', async () => {
  const page = harness({api: async (_url, options) => {if (options.method) throw Error('Offline'); return defaultSettings;}});
  await page.tick(); page.press('Saved city'); page.press('Save location preference');
  assert.match(page.text(), /Choose a city first/); assert.equal(page.requests.length, 1);
  page.press('Device location'); page.press('Save location preference'); await page.tick();
  assert.match(page.text(), /Offline/); assert.doesNotMatch(page.text(), /preference saved/);
  assert.equal(page.refreshed(), 0);
});

test('load errors have a working retry while account and appearance controls remain accessible', async () => {
  let fail = true;
  const page = harness({api: async () => {if (fail) throw Error('Offline'); return defaultSettings;}});
  await page.tick(); assert.match(page.text(), /Offline/);
  page.press('Log out of this device'); assert.equal(page.logouts(), 1);
  fail = false; page.press('Retry loading settings'); await page.tick();
  assert.ok(page.button('Device location')); assert.doesNotMatch(page.text(), /Offline/);
});

test('deletion requires a password and explicit confirmation; cancel leaves account untouched', async () => {
  const page = harness(); await page.tick(); page.press('Delete account'); page.press('Schedule deletion in 90 days');
  assert.match(page.text(), /Enter your current password/); assert.equal(page.alerts.length, 0);
  page.byLabel('Current password to confirm account action').props.onChangeText('password123'); page.render();
  page.press('Schedule deletion in 90 days');
  assert.match(page.alerts[0][1], /Log in within 90 days to cancel/);
  assert.equal(page.requests.length, 1);
  assert.equal(page.alerts[0][2][0].style, 'cancel');
  page.press('Cancel'); assert.doesNotMatch(page.text(), /Confirm scheduled deletion/);
  assert.equal(page.suspended(), 0);
});

test('confirmed deletion sends once, signs out and reports the server deadline', async () => {
  const pending = deferred();
  const page = harness({api: async (_url, options) => options.method ? pending.promise : defaultSettings});
  await page.tick(); page.press('Delete account'); page.byLabel('Current password to confirm account action').props.onChangeText('password123'); page.render();
  page.press('Schedule deletion in 90 days');
  const confirm = page.alerts[0][2][1].onPress; confirm(); confirm(); page.render();
  assert.equal(page.requests.length, 2);
  assert.equal(page.requests[1].url, '/auth/request-deletion/');
  assert.equal(JSON.parse(page.requests[1].body).password, 'password123');
  pending.resolve({deletion_due_at: '2027-01-12T12:00:00Z'}); await page.tick();
  assert.equal(page.suspended(), 1); assert.equal(page.alerts.at(-1)[0], 'Deletion scheduled');
  assert.match(page.alerts.at(-1)[1], /Log in before that deadline/);
});

test('deactivation has no deletion countdown and a rejected password keeps the page open', async () => {
  let fail = true;
  const page = harness({api: async (_url, options) => {if (!options.method) return defaultSettings; if (fail) throw Error('Wrong password'); return {deletion_due_at: null};}});
  await page.tick(); page.press('Deactivate account');
  assert.match(page.text(), /no deletion countdown/);
  page.byLabel('Current password to confirm account action').props.onChangeText('password123'); page.render();
  page.press('Deactivate now'); page.alerts.at(-1)[2][1].onPress(); await page.tick();
  assert.match(page.text(), /Wrong password/); assert.equal(page.suspended(), 0);
  fail = false; page.press('Deactivate now'); page.alerts.at(-1)[2][1].onPress(); await page.tick();
  assert.equal(page.requests.at(-1).url, '/auth/deactivate/'); assert.equal(page.suspended(), 1);
  assert.equal(page.alerts.at(-1)[0], 'Account deactivated');
});

module.exports = {harness, load, jsx};
