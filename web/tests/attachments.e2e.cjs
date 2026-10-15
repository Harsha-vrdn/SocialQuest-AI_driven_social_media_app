// Run ONLY against a disposable QA database/server. This creates test accounts.
// PLAYWRIGHT_MODULE=/path/to/playwright ATTACHMENT_QA_URL=http://127.0.0.1:8012 node web/tests/attachments.e2e.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.ATTACHMENT_QA_URL;
if (!base || !/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('Set ATTACHMENT_QA_URL to a disposable localhost QA server.');
const request = async (path, token, body) => {
  const response = await fetch(base + '/api' + path, {method: body ? 'POST' : 'GET', headers: {'Content-Type': 'application/json', ...(token ? {Authorization: 'Token ' + token} : {})}, ...(body ? {body: JSON.stringify(body)} : {})});
  const data = await response.json(); assert.ok(response.ok, JSON.stringify(data)); return data;
};
(async () => {
  const suffix = Date.now().toString(36);
  const alice = await request('/auth/register/', '', {username: 'attachment_alice_' + suffix, password: 'Temporary-QA-only-12!', display_name: 'Attachment Alice'});
  const bob = await request('/auth/register/', '', {username: 'attachment_bob_' + suffix, password: 'Temporary-QA-only-12!', display_name: 'Attachment Bob'});
  const chat = await request('/conversations/direct/', alice.token, {user_id: bob.user.id});
  const browser = await chromium.launch({headless: true, ...(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {})});
  const errors = [];
  try {
    const a = await browser.newContext({viewport: {width: 1440, height: 1000}}), b = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
    for (const [context, user] of [[a, alice], [b, bob]]) await context.addInitScript(token => {if (location.protocol.startsWith('http')) localStorage.setItem('socialquest_token', token);}, user.token);
    const sender = await a.newPage(), receiver = await b.newPage();
    for (const page of [sender, receiver]) {page.on('pageerror', error => {errors.push(error.message); console.error('PAGE ERROR', error.message);}); page.on('dialog', dialog => {errors.push(dialog.message()); console.error('UI ERROR', dialog.message()); void dialog.dismiss();});}
    const url = base + '/?view=chats&conversation=' + chat.id;
    await Promise.all([sender.goto(url), receiver.goto(url)]);
    await Promise.all([sender.locator('.message-form').waitFor(), receiver.locator('.message-form').waitFor()]);
    await sender.waitForFunction(() => !!window.SocialQuestAttachments);
    for (let count = 0; count < 40; count++) {const roster = await request(`/conversations/${chat.id}/attachment-devices/`, alice.token); if (roster.devices.length >= 2) break; await new Promise(resolve => setTimeout(resolve, 100));}
    await receiver.goto('about:blank'); // registered device offline during send
    const bytes = Buffer.from('Encrypted offline delivery test. Never upload this plaintext.');
    const sendFile = async (name, mimeType, buffer) => {
      await sender.locator('.message-form input[type=file]').setInputFiles({name, mimeType, buffer});
      const sent = sender.waitForResponse(response => response.url() === base + '/api/chat-attachments/' && response.request().method() === 'POST');
      await sender.getByRole('button', {name: 'Send message', exact: true}).click();
      const response = await sent; const message = await response.json(); assert.equal(response.status(), 201, JSON.stringify(message)); return message;
    };
    const message = await sendFile('confidential-notes.txt', 'text/plain', bytes);
    let history = await request(`/messages/?conversation=${chat.id}`, alice.token);
    assert.equal(history.results.find(m => m.id === message.id).attachment.available, true, 'relay must retain an offline recipient copy');
    await receiver.goto(url);
    const card = receiver.locator(`[data-message-id="${message.id}"] .chat-attachment`);
    await card.getByText('confidential-notes.txt').waitFor();
    assert.match(await card.textContent(), /saved in this browser/);
    const downloaded = receiver.waitForEvent('download'); await card.getByRole('link', {name: 'Save file'}).click();
    assert.deepEqual(await fs.readFile(await (await downloaded).path()), bytes);
    history = await request(`/messages/?conversation=${chat.id}`, alice.token);
    assert.equal(history.results.find(m => m.id === message.id).attachment.available, false, 'all saved: relay deleted');
    await receiver.reload();
    await receiver.locator(`[data-action="open-chat"][data-id="${chat.id}"]`).click();
    await receiver.locator(`[data-message-id="${message.id}"] .chat-attachment`).getByText('confidential-notes.txt').waitFor();
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQn8AAAAASUVORK5CYII=', 'base64');
    const photo = await sendFile('photo.png', 'image/png', png);
    const photoCard = receiver.locator(`[data-message-id="${photo.id}"] .chat-attachment`);
    await photoCard.getByRole('button', {name: 'Open attached photo'}).waitFor();
    await photoCard.getByRole('button', {name: 'Open attached photo'}).click();
    await receiver.locator('.chat-photo-dialog').waitFor(); await receiver.locator('.chat-photo-dialog').getByRole('button', {name: 'Close'}).click();
    const clip = await sender.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 16;
      const context = canvas.getContext('2d'); context.fillStyle = '#8040cc'; context.fillRect(0, 0, 16, 16);
      const stream = canvas.captureStream(10), recorder = new MediaRecorder(stream, {mimeType: 'video/webm'}), chunks = [];
      recorder.ondataavailable = event => chunks.push(event.data);
      const stopped = new Promise(resolve => recorder.onstop = resolve);
      recorder.start(); await new Promise(resolve => setTimeout(resolve, 250)); recorder.stop(); await stopped; stream.getTracks().forEach(track => track.stop());
      return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
    });
    const movie = await sendFile('clip.webm', 'video/webm', Buffer.from(clip));
    const video = receiver.locator(`[data-message-id="${movie.id}"] video`); await video.waitFor();
    await receiver.waitForFunction(id => document.querySelector(`[data-message-id="${id}"] video`)?.readyState >= 1, movie.id);
    await receiver.screenshot({path: '/private/tmp/socialquest-attachment-mobile-web.png', fullPage: true});
    await sender.screenshot({path: '/private/tmp/socialquest-attachment-desktop-web.png', fullPage: true});
    const newDevice = await browser.newContext(); await newDevice.addInitScript(token => localStorage.setItem('socialquest_token', token), bob.token);
    const newcomer = await newDevice.newPage(); await newcomer.goto(url);
    await newcomer.locator(`[data-message-id="${message.id}"] .chat-attachment button`).waitFor();
    assert.match(await newcomer.locator(`[data-message-id="${message.id}"] .chat-attachment`).textContent(), /not found|resend|No ChatAttachment/i);
    assert.deepEqual(errors, []);
    console.log('PASS: offline encrypted delivery, exact file download, all-device relay deletion, reload from local storage, photo viewer, video decoding, and unavailable-on-new-device state. Desktop and mobile web screenshots saved in /private/tmp.');
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
