const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {webcrypto, createCipheriv, createDecipheriv} = require('node:crypto');
const {buildSync} = require('esbuild');
const root = path.resolve(__dirname, '..');
function compile(file) {
  const source = buildSync({entryPoints: [path.join(root, file)], bundle: true, write: false, platform: 'browser', format: 'cjs'}).outputFiles[0].text;
  const module = {exports: {}};
  new Function('module', 'exports', 'window', 'indexedDB', 'crypto', source)(module, module.exports, {addEventListener() {}}, undefined, webcrypto);
  return module.exports;
}
const {AttachmentClient, fromBase64, toBase64, safeName, imageMime, previewMime, checkSize, MAX_ATTACHMENT_BYTES} = compile('attachmentProtocol.ts');
const {browserAttachmentCrypto: browserCrypto} = compile('browserAttachments.ts');
// Independent platform primitive, same nonce+ciphertext+tag format as Expo AES.
const nativeFormatCrypto = {...browserCrypto,
  encrypt: async (bytes, key, aad) => {
    const iv = await browserCrypto.random(12), cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(aad);
    return new Uint8Array(Buffer.concat([iv, cipher.update(bytes), cipher.final(), cipher.getAuthTag()]));
  },
  decrypt: async (bytes, key, aad) => {
    const cipher = createDecipheriv('aes-256-gcm', key, bytes.slice(0, 12)); cipher.setAAD(aad); cipher.setAuthTag(bytes.slice(-16));
    return new Uint8Array(Buffer.concat([cipher.update(bytes.slice(12, -16)), cipher.final()]));
  },
};
function storage() {
  const values = new Map(), files = new Map();
  return {values, files, get: async key => values.get(key), put: async (key, value) => {values.set(key, structuredClone(value));},
    read: async id => files.has(id) ? structuredClone(files.get(id)) : null,
    write: async record => {files.set(record.info.id, structuredClone(record));}};
}
async function setup() {
  const devices = [], relay = new Map(), acks = [], stores = [storage(), storage(), storage()];
  let current = true;
  const clients = stores.map((store, index) => new AttachmentClient(index + 1, async (route, options) => {
    if (route === '/chat-devices/') {const value = JSON.parse(options.body); if (!devices.some(d => d.id === value.id)) devices.push({...value, user: index + 1}); return value;}
    if (route.includes('attachment-devices/')) return {participants: [1, 2], devices: devices.filter(d => d.user <= 2)};
    const id = route.split('/')[2];
    if (route.endsWith('/saved/')) {acks.push({user: index + 1, id}); return {saved: true};}
    const prepared = relay.get(id);
    if (!prepared) throw new Error('Expired');
    return {...prepared.record.info, available: true, envelope: prepared.envelopes[devices.find(d => d.user === index + 1).id], sender_device: prepared.device};
  }, index === 0 ? nativeFormatCrypto : browserCrypto, store,
  async route => relay.get(route.split('/')[2]).record.cipher,
  async prepared => {relay.set(prepared.record.info.id, structuredClone(prepared)); return {id: 42};},
  () => {if (!current) throw new Error('Session changed.');}));
  for (const client of clients) await client.ready();
  const bytes = new TextEncoder().encode('private photo contents 📷');
  const prepared = await clients[0].prepare(8, bytes, {name: 'private.jpg', mime: 'image/jpeg', size: bytes.length}, 'caption');
  const ref = {...prepared.record.info};
  return {clients, stores, devices, relay, acks, bytes, prepared, ref, invalidate: () => {current = false;}};
}

test('native-format AES and browser Web Crypto interoperate in both directions with authenticated context', async () => {
  const key = await browserCrypto.random(32), aad = new TextEncoder().encode('chat 1'), bytes = await browserCrypto.random(1024);
  for (const [a, b] of [[nativeFormatCrypto, browserCrypto], [browserCrypto, nativeFormatCrypto]]) {
    const encrypted = await a.encrypt(bytes, key, aad);
    assert.equal(encrypted.length, bytes.length + 28);
    assert.deepEqual(await b.decrypt(encrypted, key, aad), bytes);
    await assert.rejects(b.decrypt(encrypted, key, new Uint8Array([99])));
    encrypted[20] ^= 1;
    await assert.rejects(b.decrypt(encrypted, key, aad));
  }
});
test('recipient decrypts a sender file and filename; persisted ciphertext remains encrypted', async () => {
  const t = await setup(); await t.clients[0].send(t.prepared);
  const opened = await t.clients[1].receive(t.ref);
  assert.deepEqual(opened.bytes, t.bytes); assert.equal(opened.metadata.name, 'private.jpg');
  assert.equal(t.acks.length, 2);
  assert.ok(!Buffer.from(t.prepared.record.cipher).includes(Buffer.from('private photo')));
  assert.ok(!Buffer.from(fromBase64(t.prepared.record.info.envelope)).includes(Buffer.from('private.jpg')));
  t.relay.clear(); // expiry must not invalidate a saved local copy
  assert.deepEqual((await t.clients[1].receive(t.ref)).bytes, t.bytes);
});
test('unauthorized device cannot decrypt the recipient envelope', async () => {
  const t = await setup(); await t.clients[0].send(t.prepared);
  t.stores[2].files.set(t.ref.id, {...t.prepared.record, info: {...t.prepared.record.info, envelope: t.prepared.envelopes[t.devices[1].id]}});
  await assert.rejects(t.clients[2].receive(t.ref), /verification failed|resend/);
  assert.equal(t.acks.length, 1);
});
test('storage failure never acknowledges delivery', async () => {
  const t = await setup(); await t.clients[0].send(t.prepared);
  t.stores[1].write = async () => {throw new Error('disk full');};
  await assert.rejects(t.clients[1].receive(t.ref), /disk full/);
  assert.equal(t.acks.length, 1);
});
test('silent partial disk writes are caught by read-back before acknowledgement', async () => {
  const t = await setup(); await t.clients[0].send(t.prepared);
  t.stores[1].write = async record => {record.cipher[5] ^= 1; t.stores[1].files.set(record.info.id, record);};
  await assert.rejects(t.clients[1].receive(t.ref), /damaged/);
  assert.equal(t.acks.length, 1);
});
test('sender storage failure prevents upload', async () => {
  const t = await setup(); t.stores[0].write = async () => {throw new Error('disk full');};
  await assert.rejects(t.clients[0].prepare(8, t.bytes, {name: 'test', mime: 'text/plain'}, ''), /disk full/);
  assert.equal(t.relay.size, 0);
});
test('envelope cannot be replayed into a different conversation or sender', async () => {
  const t = await setup(); await t.clients[0].send(t.prepared);
  for (const mutation of [{conversation: 9}, {sender: 2}]) await assert.rejects(t.clients[1].receive({...t.ref, ...mutation}), /different message/);
  assert.equal(t.acks.length, 1);
});
test('damaged envelope is rejected without acknowledgement', async () => {
  const t = await setup(); await t.clients[0].send(t.prepared);
  const record = t.relay.get(t.ref.id), encrypted = fromBase64(record.envelopes[t.devices[1].id]); encrypted[30] ^= 1;
  record.envelopes[t.devices[1].id] = toBase64(encrypted);
  await assert.rejects(t.clients[1].receive(t.ref), /verification failed/);
  assert.equal(t.acks.length, 1);
});
test('concurrent downloads deduplicate and retries reuse exact UUID and ciphertext', async () => {
  const t = await setup(); await t.clients[0].send(t.prepared); await t.clients[0].send(t.prepared);
  assert.equal(t.relay.size, 1);
  const a = t.clients[1].receive(t.ref), b = t.clients[1].receive(t.ref); assert.equal(a, b); await a;
  assert.equal(t.acks.filter(a => a.user === 2).length, 1);
});
test('device public-key replacement is blocked by local pinning', async () => {
  const t = await setup(); t.devices[1].public_key = toBase64(await browserCrypto.random(32));
  await assert.rejects(t.clients[0].prepare(8, t.bytes, {name: 'test', mime: 'text/plain'}, ''), /identity changed/);
});
test('logout stops sending and reading across accounts', async () => {
  const t = await setup(); t.invalidate();
  await assert.rejects(t.clients[0].send(t.prepared), /Session changed/);
  await assert.rejects(t.clients[1].receive(t.ref), /Session changed/);
  assert.equal(t.relay.size, 0);
});
test('a fresh client can decrypt its saved copy when the relay and registration service are offline', async () => {
  const t = await setup(); await t.clients[0].send(t.prepared); await t.clients[1].receive(t.ref);
  const offline = async () => {throw new Error('offline');};
  const restarted = new AttachmentClient(2, offline, browserCrypto, t.stores[1], offline, offline, () => {});
  assert.deepEqual((await restarted.receive({...t.ref, available: false})).bytes, t.bytes);
});
test('a corrupted local copy can be repaired from the still-available relay', async () => {
  const t = await setup(); await t.clients[0].send(t.prepared); await t.clients[1].receive(t.ref);
  t.stores[1].files.get(t.ref.id).cipher[0] ^= 1;
  assert.deepEqual((await t.clients[1].receive(t.ref)).bytes, t.bytes);
});
test('size and filename safety; active document formats never render inline', () => {
  assert.throws(() => checkSize(0)); assert.throws(() => checkSize(MAX_ATTACHMENT_BYTES + 1));
  checkSize(MAX_ATTACHMENT_BYTES); assert.equal(imageMime('image/svg+xml'), false); assert.equal(imageMime('text/html'), false);
  assert.equal(safeName('../a\\b\u202e.exe'), '.._a_b_.exe');
  assert.equal(safeName('..'), 'attachment');
  assert.equal(previewMime('text/html'), 'application/octet-stream');
  assert.equal(previewMime('image/svg+xml'), 'application/octet-stream');
  assert.equal(previewMime('image/png'), 'image/png');
});
test('native adapter uses secure RNG, 12-byte nonce, 16-byte tag, and authenticated data', () => {
  const source = fs.readFileSync(path.join(root, 'chatAttachmentStorage.ts'), 'utf8');
  assert.match(source, /getRandomBytesAsync/); assert.doesNotMatch(source, /Crypto\.getRandomBytes\(/);
  assert.match(source, /nonce: \{length: 12\}, tagLength: 16, additionalData: aad/);
  assert.match(source, /WHEN_UNLOCKED_THIS_DEVICE_ONLY/);
});
