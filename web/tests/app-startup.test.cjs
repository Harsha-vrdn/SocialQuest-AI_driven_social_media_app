const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const webRoot = path.resolve(__dirname, '..');
const template = fs.readFileSync(path.join(webRoot, 'index.html'), 'utf8');
const scripts = [...template.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)]
  .map(match => match[1].split('?')[0]);

test('every script loaded by the website compiles as a complete browser script', () => {
  assert.ok(scripts.includes('/static/app.js'), 'The website must load its application');
  for (const url of scripts) {
    assert.ok(url.startsWith('/static/'), `Unexpected application script: ${url}`);
    const source = fs.readFileSync(path.join(webRoot, url), 'utf8');
    // Handler-only tests cannot detect duplicate declarations elsewhere in app.js.
    assert.doesNotThrow(() => new vm.Script(source, {filename: url}), url);
  }
});

test('notification and post-creator dependencies load before the application', () => {
  const appIndex = scripts.indexOf('/static/app.js');
  for (const dependency of ['/static/notifications.js', '/static/post-studio.js', '/static/chat-attachments.js']) {
    assert.ok(scripts.indexOf(dependency) >= 0 && scripts.indexOf(dependency) < appIndex,
      `${dependency} must be available when the app starts`);
  }
});

test('encrypted attachment device registration starts when the account loads', () => {
  const source = fs.readFileSync(path.join(webRoot, 'static/app.js'), 'utf8');
  const startup = source.slice(source.indexOf('(async function init()'));
  assert.match(startup, /state\.user = await api\('\/people\/me\/'\);\s*window\.SocialQuestAttachments\?\.init\(/);
});
