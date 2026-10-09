const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

// Execute the hook and the installed Expo local modules with native bridges
// stubbed. Unlike a bundle check, this evaluates their startup side effects.
function runtime({platform = 'android', expoGo = true, projectId = 'test-project', permission = true, pushFails = false} = {}) {
  const calls = {remoteImports: 0, requests: [], scheduled: [], permissionRequests: 0, channels: []};
  const cache = new Map();
  const files = new Map();
  const permissions = {granted: permission, canAskAgain: permission, status: permission ? 'granted' : 'denied'};
  const native = {
    getPermissionsAsync: async () => permissions,
    requestPermissionsAsync: async () => { calls.permissionRequests++; return permissions; },
    setNotificationChannelAsync: async (id, options) => { calls.channels.push(id); return {id, ...options}; },
    scheduleNotificationAsync: async (...args) => { calls.scheduled.push(args); return args[0]; },
  };
  const mocks = {
    expo: {isRunningInExpoGo: () => expoGo},
    'expo-constants': {__esModule: true, default: {expoConfig: {extra: {eas: {projectId}}}}},
    react: {useRef: value => ({current: value}), useState: value => [value, () => {}], useEffect: () => {}},
    'react-native': {AppState: {currentState: 'active'}, Platform: {OS: platform}, Linking: {}},
    'expo-file-system': {
      Paths: {document: '/test'},
      File: class {
        constructor(_directory, name) { this.name = name; }
        textSync() { if (!files.has(this.name)) throw new Error('No preferences'); return files.get(this.name); }
        write(text) { files.set(this.name, text); }
      },
    },
    'expo-modules-core': {
      Platform: {OS: platform}, UnavailabilityError: Error, CodedError: Error,
      requireNativeModule: () => native,
      uuid: {v4: () => 'test-notification'},
      LegacyEventEmitter: class { addListener() { return {remove() {}}; } },
    },
  };
  function load(specifier, parent = path.join(root, 'entry.ts')) {
    if (mocks[specifier]) return mocks[specifier];
    if (specifier === 'expo-notifications') {
      calls.remoteImports++;
      // SDK 57's root import registers push tokens and throws on Android Go.
      if (expoGo) throw new Error('Remote push registration is unavailable in Expo Go');
      return {getExpoPushTokenAsync: async options => {
        assert.equal(options.projectId, projectId);
        if (pushFails) throw new Error('Push credentials unavailable');
        return {data: 'ExpoPushToken[test-device]'};
      }};
    }
    const base = specifier.startsWith('.') ? path.resolve(path.dirname(parent), specifier) : path.join(root, 'node_modules', specifier);
    const filename = [`.${platform}.js`, '.native.js', '.ts', '.js'].map(ext => base + ext).find(fs.existsSync);
    assert.ok(filename, `Unexpected dependency: ${specifier}`);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = {exports: {}};
    cache.set(filename, module);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true},
    }).outputText;
    const execute = vm.runInNewContext(`(function(require, module, exports) {${source}\n})`, {console, setTimeout, clearTimeout}, {filename});
    execute(dependency => load(dependency, filename), module, module.exports);
    return module.exports;
  }
  function hook() {
    return load('./useDeviceNotifications').useDeviceNotifications({
      token: 'test-auth', userId: 1, chatsOpen: false,
      api: async (url, options) => { calls.requests.push({url, ...JSON.parse(options.body)}); return {}; },
      open: async () => {},
    });
  }
  return {load, hook, calls};
}

for (const platform of ['android', 'ios']) {
  test(`${platform} Expo Go starts and enables local notifications without loading remote push`, async () => {
    const app = runtime({platform});
    await app.hook().enable();
    assert.equal(app.calls.remoteImports, 0);
    assert.equal(app.calls.requests.length, 1);
    assert.equal(app.calls.requests[0].transport, 'LOCAL');
    assert.deepEqual(app.calls.requests[0].address, {});
    if (platform === 'android') assert.deepEqual(app.calls.channels, ['chat', 'activity']);
    await app.load('./notificationRuntime').scheduleNotificationAsync({identifier: 'local-message', content: {title: 'Hello'}, trigger: null});
    assert.equal(app.calls.scheduled[0][0], 'local-message');
    assert.equal(app.calls.remoteImports, 0);
  });
}

test('the remote-token helper refuses Expo Go even if called with a project ID', async () => {
  const app = runtime();
  assert.equal(await app.load('./notificationRuntime').getRemotePushToken('test-project'), null);
  assert.equal(app.calls.remoteImports, 0);
});

test('a configured development build registers Expo push only when enabled', async () => {
  const app = runtime({expoGo: false});
  const hook = app.hook();
  assert.equal(app.calls.remoteImports, 0);
  await hook.enable();
  assert.equal(app.calls.remoteImports, 1);
  assert.equal(app.calls.requests[0].transport, 'EXPO');
  assert.equal(app.calls.requests[0].address.token, 'ExpoPushToken[test-device]');
});

test('a build without a project ID keeps local notifications available', async () => {
  const app = runtime({expoGo: false, projectId: ''});
  await app.hook().enable();
  assert.equal(app.calls.remoteImports, 0);
  assert.equal(app.calls.requests[0].transport, 'LOCAL');
});

test('push registration failure falls back to local delivery', async () => {
  const app = runtime({expoGo: false, pushFails: true});
  await app.hook().enable();
  assert.equal(app.calls.requests[0].transport, 'LOCAL');
});

test('denied permission does not register a device or load remote push', async () => {
  const app = runtime({permission: false});
  await app.hook().enable();
  assert.equal(app.calls.requests.length, 0);
  assert.equal(app.calls.remoteImports, 0);
  assert.equal(app.calls.permissionRequests, 0);
});
