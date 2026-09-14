const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { prepareTunnelHostname } = require('./start-expo.cjs');

function fixture(t, settings) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'socialquest-expo-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const settingsPath = path.join(root, '.expo', 'settings.json');
  if (settings !== undefined) {
    fs.mkdirSync(path.dirname(settingsPath));
    fs.writeFileSync(settingsPath, JSON.stringify(settings));
  }
  return { root, settingsPath, read: () => JSON.parse(fs.readFileSync(settingsPath, 'utf8')) };
}

test('repairs the observed underscore hostname and preserves other settings', t => {
  const project = fixture(t, { urlRandomness: 'BT_85kQ', customSetting: true });
  assert.equal(prepareTunnelHostname(project.root), true);
  assert.match(project.read().urlRandomness, /^[a-f0-9]{16}$/);
  assert.equal(project.read().customSetting, true);
});

test('preserves an existing valid hostname without rewriting settings', t => {
  const project = fixture(t, { urlRandomness: 'safe-seed' });
  const before = fs.readFileSync(project.settingsPath, 'utf8');
  assert.equal(prepareTunnelHostname(project.root), false);
  assert.equal(fs.readFileSync(project.settingsPath, 'utf8'), before);
});

test('prepares a fresh checkout and keeps the generated hostname stable', t => {
  const project = fixture(t);
  assert.equal(prepareTunnelHostname(project.root), true);
  const seed = project.read().urlRandomness;
  assert.match(seed, /^[a-f0-9]{16}$/);
  assert.equal(prepareTunnelHostname(project.root), false);
  assert.equal(project.read().urlRandomness, seed);
});

test('rejects invalid seed types and characters', t => {
  for (const seed of [null, 123, {}, '', '_first', 'last_', '-first', 'last-', 'has space', 'has.dot']) {
    const project = fixture(t, { urlRandomness: seed });
    assert.equal(prepareTunnelHostname(project.root), true);
    assert.match(project.read().urlRandomness, /^[a-f0-9]{16}$/);
  }
});
