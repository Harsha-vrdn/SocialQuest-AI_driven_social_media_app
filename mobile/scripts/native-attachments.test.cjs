const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const {randomBytes, createHash, createCipheriv, createDecipheriv} = require('node:crypto');
const root = path.resolve(__dirname, '..');

function load(file, imports = {}, globals = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS},
  }).outputText;
  const context = {exports: {}, Uint8Array, ArrayBuffer, TextEncoder, TextDecoder, Blob, btoa, atob, __DEV__: true, ...globals,
    require: name => {assert.ok(name in imports, 'Mock provided for ' + name); return imports[name];}};
  vm.runInNewContext(source, context);
  return context.exports;
}
// Use Expo 57's actual FormData patch and multipart encoder. A permissive fetch
// mock misses the URI-only upload failure before it ever reaches the server.
const {installFormDataPatch} = load('node_modules/expo/src/winter/FormData.ts');
class NativeFormData {constructor() {this._parts = [];}}
installFormDataPatch(NativeFormData);
const {convertFormDataAsync} = load('node_modules/expo/src/winter/fetch/convertFormData.ts', {
  '../../utils/blobUtils': {blobToArrayBufferAsync: blob => blob.arrayBuffer()},
});
const protocol = load('attachmentProtocol.ts', {tweetnacl: require('tweetnacl')});

function nativeHarness() {
  const files = new Map(), secrets = new Map(), devices = [], uploads = [], acks = [];
  let valid = true, failUpload = false;
  class Directory {
    constructor(...parts) {this.uri = parts.map(part => typeof part === 'string' ? part : part.uri).join('/');}
    exists = false;
    create() {this.exists = true;}
    delete() {this.exists = false;}
  }
  class File {
    constructor(...parts) {this.uri = parts.map(part => typeof part === 'string' ? part : part.uri).join('/');}
    get exists() {return files.has(this.uri);}
    get name() {return this.uri.split('/').at(-1);}
    get type() {return 'application/octet-stream';}
    get size() {return files.get(this.uri)?.length || 0;}
    write(data) {files.set(this.uri, typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data));}
    async bytes() {assert.ok(this.exists, 'Read an existing file'); return new Uint8Array(files.get(this.uri));}
    async text() {return new TextDecoder().decode(await this.bytes());}
  }
  const Crypto = {
    CryptoDigestAlgorithm: {SHA256: 'sha256'}, getRandomBytesAsync: async size => new Uint8Array(randomBytes(size)),
    digestStringAsync: async (algorithm, text) => createHash(algorithm).update(text).digest('hex'),
    digest: async (algorithm, bytes) => createHash(algorithm).update(bytes).digest(),
    AESEncryptionKey: {import: async bytes => bytes}, AESSealedData: {fromCombined: bytes => bytes},
    aesEncryptAsync: async (bytes, key, {nonce, tagLength, additionalData}) => {
      assert.equal(nonce.length, 12); assert.equal(tagLength, 16);
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(additionalData);
      const combined = new Uint8Array(Buffer.concat([iv, cipher.update(bytes), cipher.final(), cipher.getAuthTag()]));
      return {combined: async () => combined};
    },
    aesDecryptAsync: async (bytes, key, {additionalData}) => {
      const cipher = createDecipheriv('aes-256-gcm', key, bytes.slice(0, 12));
      cipher.setAAD(additionalData); cipher.setAuthTag(bytes.slice(-16));
      return new Uint8Array(Buffer.concat([cipher.update(bytes.slice(12, -16)), cipher.final()]));
    },
  };
  const {createMobileAttachmentClient} = load('chatAttachmentStorage.ts', {
    'expo-crypto': Crypto, 'expo-secure-store': {WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device',
      getItemAsync: async key => secrets.get(key) || null, setItemAsync: async (key, value) => {secrets.set(key, value);}},
    'expo-file-system': {File, Directory, Paths: {cache: 'file:///cache', document: 'file:///documents'}},
    './attachmentProtocol': protocol,
  }, {FormData: NativeFormData});
  const create = user => createMobileAttachmentClient(user, 'session', 'https://api.example.test/api', async (route, options) => {
    if (route === '/chat-devices/') {
      const device = {...JSON.parse(options.body), user}; devices.push(device); return device;
    }
    if (route.endsWith('/attachment-devices/')) return {participants: [1, 2], devices};
    if (route.endsWith('/saved/')) {acks.push(JSON.parse(options.body)); return {saved: true};}
    assert.equal(route, '/chat-attachments/'); assert.equal(options.method, 'POST');
    const multipart = await convertFormDataAsync(options.body, 'test-boundary');
    uploads.push({multipart, fields: options.body});
    if (failUpload) throw new TypeError('Network request failed');
    return {id: 42, attachment: {id: options.body.get('id')}};
  }, () => {if (!valid) throw Error('Session changed.');});
  return {create, uploads, acks, files, invalidate: () => {valid = false;}, failUpload: value => {failUpload = value;}};
}

test('Expo 57 rejects legacy URI-only file parts before making an HTTP request', async () => {
  const form = new NativeFormData();
  form.append('ciphertext', {uri: 'file:///encrypted.bin', name: 'encrypted.bin', type: 'application/octet-stream'});
  await assert.rejects(convertFormDataAsync(form), /Unsupported FormDataPart implementation/);
});

test('native attachment uploads serialize persisted ciphertext through the actual Expo multipart encoder', async () => {
  const t = nativeHarness(), sender = t.create(1), recipient = t.create(2);
  await sender.ready(); await recipient.ready();
  const bytes = new TextEncoder().encode('Private photo contents 📷');
  const prepared = await sender.prepare(8, bytes, {name: 'secret-photo.jpg', mime: 'image/jpeg', size: bytes.length}, 'caption');
  const sent = await sender.send(prepared);
  assert.equal(sent.id, 42); assert.equal(t.uploads.length, 1); assert.equal(t.acks.length, 1);
  const {multipart, fields} = t.uploads[0], body = Buffer.from(multipart.body);
  assert.equal(fields.get('id'), prepared.record.info.id); assert.equal(fields.get('conversation'), '8');
  assert.equal(fields.get('device'), prepared.device); assert.equal(fields.get('body'), 'caption');
  assert.deepEqual(JSON.parse(fields.get('envelopes')), {...prepared.envelopes});
  assert.ok(body.includes(Buffer.from('name="ciphertext"; filename="')));
  assert.ok(body.includes(Buffer.from('content-type: application/octet-stream')));
  assert.ok(body.includes(Buffer.from(prepared.record.cipher)));
  assert.equal(body.includes(Buffer.from('secret-photo.jpg')), false);
  assert.equal(body.includes(Buffer.from(bytes)), false);
});

test('native upload retry keeps the same encrypted file and idempotency fields after a network failure', async () => {
  const t = nativeHarness(), sender = t.create(1), recipient = t.create(2);
  await sender.ready(); await recipient.ready();
  const bytes = new Uint8Array([0, 1, 128, 255]);
  const prepared = await sender.prepare(8, bytes, {name: 'test.bin', mime: 'application/octet-stream', size: 4}, 'caption');
  t.failUpload(true); await assert.rejects(sender.send(prepared), /Network request failed/);
  assert.equal(t.acks.length, 0);
  t.failUpload(false); await sender.send(prepared);
  assert.deepEqual(t.uploads[0].multipart.body, t.uploads[1].multipart.body);
  assert.equal(t.acks.length, 1);
  t.invalidate(); await assert.rejects(sender.send(prepared), /Session changed/);
  assert.equal(t.uploads.length, 2);
});
