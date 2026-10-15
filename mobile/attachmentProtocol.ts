import nacl from 'tweetnacl';

// Versioned format shared by native and browser clients. The relay never gets
// the file key, filename, MIME type, or a device private key.
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export type AttachmentRef = {id: string; sha256: string; available?: boolean; expires_at?: string};
export type Context = {id: string; conversation: number; sender: number};
export type Identity = {id: string; publicKey: string; secretKey: string};
export type Metadata = {name: string; mime: string; size: number};
export type RecordInfo = Context & {sha256: string; envelope: string; sender_public_key: string};
export type LocalRecord = {info: RecordInfo; cipher: Uint8Array};
export type Prepared = {record: LocalRecord; envelopes: Record<string, string>; body: string; device: string};
export type CryptoAdapter = {
  random(n: number): Promise<Uint8Array>;
  hash(bytes: Uint8Array): Promise<string>;
  encrypt(bytes: Uint8Array, key: Uint8Array, aad: Uint8Array): Promise<Uint8Array>;
  decrypt(bytes: Uint8Array, key: Uint8Array, aad: Uint8Array): Promise<Uint8Array>;
};
export type StorageAdapter = {
  get(key: string): Promise<any>;
  put(key: string, value: any): Promise<void>;
  read(id: string): Promise<LocalRecord | null>;
  write(record: LocalRecord): Promise<void>;
};
export type AttachmentApi = (path: string, options?: any) => Promise<any>;
export const toBase64 = (bytes: Uint8Array) => {
  let raw = ''; for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw);
};
export const fromBase64 = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
export const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const aad = (ctx: Context) => encode(['socialquest-attachment', 1, ctx.id, ctx.conversation, ctx.sender]);
export const safeName = (name: string) => {
  const cleaned = name.replace(/[\x00-\x1f\x7f/\\\u202a-\u202e\u2066-\u2069]/g, '_').slice(0, 180);
  return !cleaned || /^\.+$/.test(cleaned) ? 'attachment' : cleaned;
};
export const imageMime = (mime: string) => /^(image\/(jpeg|png|webp|gif|heic|heif))$/.test(mime);
export const videoMime = (mime: string) => /^(video\/(mp4|webm|quicktime|3gpp))$/.test(mime);
export const previewMime = (mime: string) => imageMime(mime) || videoMime(mime) ? mime : 'application/octet-stream';
export const fileSize = (size: number) => size >= 1024 * 1024 ? (size / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.ceil(size / 1024)) + ' KB';
export function checkSize(size: number) {
  if (!Number.isInteger(size) || size < 1 || size > MAX_ATTACHMENT_BYTES) throw new Error('Choose a non-empty file up to 25 MB.');
}

export class AttachmentClient {
  private identityPromise?: Promise<Identity>;
  private registrationPromise?: Promise<Identity>;
  private inFlight = new Map<string, Promise<{bytes: Uint8Array; metadata: Metadata}>>();
  private syncing = false;
  constructor(readonly user: number, private api: AttachmentApi, readonly crypto: CryptoAdapter,
    readonly storage: StorageAdapter, private download: (path: string) => Promise<Uint8Array>,
    private upload: (prepared: Prepared) => Promise<any>, private guard: () => void) {}

  async uuid() {
    const b = await this.crypto.random(16); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const s = hex(b); return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
  }
  ready(): Promise<Identity> {
    if (!this.registrationPromise) this.registrationPromise = this.register().catch(error => { this.registrationPromise = undefined; throw error; });
    return this.registrationPromise;
  }
  private identity(): Promise<Identity> {
    if (!this.identityPromise) this.identityPromise = this.loadIdentity().catch(error => {this.identityPromise = undefined; throw error;});
    return this.identityPromise;
  }
  private async loadIdentity() {
    this.guard();
    let identity = await this.storage.get('identity') as Identity | null;
    if (!identity) {
      const keys = nacl.box.keyPair.fromSecretKey(await this.crypto.random(32));
      identity = {id: await this.uuid(), publicKey: toBase64(keys.publicKey), secretKey: toBase64(keys.secretKey)};
      await this.storage.put('identity', identity);
      // Persistence, not an in-memory-only key, is required before registration.
      if (JSON.stringify(await this.storage.get('identity')) !== JSON.stringify(identity)) throw new Error('Could not save this device’s encryption key.');
    }
    return identity;
  }
  private async register() {
    const identity = await this.identity(); this.guard();
    await this.api('/chat-devices/', {method: 'POST', body: JSON.stringify({id: identity.id, public_key: identity.publicKey})});
    return identity;
  }
  private async pin(id: string, key: string) {
    if (fromBase64(key).length !== 32) throw new Error('Invalid device encryption key.');
    const old = await this.storage.get('pin-' + id);
    if (old && old !== key) throw new Error('A device’s encryption identity changed. Attachment transfer stopped.');
    if (!old) await this.storage.put('pin-' + id, key);
  }
  async prepare(conversation: number, bytes: Uint8Array, metadata: Metadata, body: string): Promise<Prepared> {
    checkSize(bytes.length);
    const identity = await this.ready();
    const roster = await this.api(`/conversations/${conversation}/attachment-devices/`);
    if (roster.participants.some((user: number) => !roster.devices.some((d: any) => d.user === user)))
      throw new Error('Everyone in this chat must open the updated app or website once before you can send encrypted attachments.');
    if (!roster.devices.some((d: any) => d.id === identity.id) || roster.devices.length > 128) throw new Error('This chat has an unsupported device list.');
    const ctx = {id: await this.uuid(), conversation, sender: this.user};
    const key = await this.crypto.random(32);
    const cipher = await this.crypto.encrypt(bytes, key, aad(ctx));
    const sha256 = await this.crypto.hash(cipher);
    const payload = encode({v: 1, ...ctx, key: toBase64(key), name: safeName(metadata.name), mime: metadata.mime.slice(0, 100), size: bytes.length});
    const envelopes: Record<string, string> = {};
    for (const device of roster.devices) {
      await this.pin(device.id, device.public_key);
      const nonce = await this.crypto.random(24);
      const box = nacl.box(payload, nonce, fromBase64(device.public_key), fromBase64(identity.secretKey));
      const combined = new Uint8Array(nonce.length + box.length); combined.set(nonce); combined.set(box, nonce.length);
      envelopes[device.id] = toBase64(combined);
    }
    this.guard();
    const record = {info: {...ctx, sha256, envelope: envelopes[identity.id], sender_public_key: identity.publicKey}, cipher};
    await this.storage.write(record);
    const saved = await this.storage.read(ctx.id);
    if (!saved || await this.crypto.hash(saved.cipher) !== sha256) throw new Error('Could not save your local attachment copy. Nothing was sent.');
    await this.decrypt(saved, ctx);
    return {record, envelopes, body: body.trim(), device: identity.id};
  }
  async send(prepared: Prepared) {
    this.guard();
    // A retry uses the identical UUID, ciphertext, caption, and envelope set.
    const result = await this.upload(prepared);
    this.guard();
    await this.ack(prepared.record.info).catch(() => {});
    return result;
  }
  private async ack(info: RecordInfo) {
    this.guard();
    const identity = await this.ready();
    await this.api(`/chat-attachments/${info.id}/saved/`, {method: 'POST', body: JSON.stringify({device: identity.id, sha256: info.sha256})});
  }
  private async decrypt(record: LocalRecord, expected: Context) {
    const identity = await this.identity();
    const envelope = fromBase64(record.info.envelope);
    const opened = nacl.box.open(envelope.subarray(24), envelope.subarray(0, 24), fromBase64(record.info.sender_public_key), fromBase64(identity.secretKey));
    if (!opened) throw new Error('Attachment encryption verification failed.');
    const payload = JSON.parse(new TextDecoder().decode(opened));
    if (payload.v !== 1 || payload.id !== expected.id || payload.conversation !== expected.conversation || payload.sender !== expected.sender)
      throw new Error('Attachment belongs to a different message or chat.');
    checkSize(payload.size);
    if (typeof payload.name !== 'string' || typeof payload.mime !== 'string' || typeof payload.key !== 'string') throw new Error('Invalid attachment metadata.');
    if (await this.crypto.hash(record.cipher) !== record.info.sha256) throw new Error('Attachment is incomplete or damaged.');
    const bytes = await this.crypto.decrypt(record.cipher, fromBase64(payload.key), aad(expected));
    if (bytes.length !== payload.size) throw new Error('Attachment size verification failed.');
    this.guard();
    return {bytes, metadata: {name: safeName(payload.name), mime: payload.mime, size: bytes.length}};
  }
  receive(ref: AttachmentRef & Context) {
    const existing = this.inFlight.get(ref.id); if (existing) return existing;
    const task = this.receiveOne(ref).finally(() => this.inFlight.delete(ref.id));
    this.inFlight.set(ref.id, task); return task;
  }
  private async receiveOne(ref: AttachmentRef & Context) {
    this.guard();
    let record = await this.storage.read(ref.id);
    // A damaged local copy is retried from the relay while it is still available.
    if (record && record.info.sha256 === ref.sha256) {
      try {await this.decrypt(record, ref);} catch (_) {record = null;}
    }
    if (!record || record.info.sha256 !== ref.sha256) {
      if (ref.available === false) throw new Error('Not saved on this device. The relay copy is gone—ask the sender to resend.');
      const identity = await this.ready();
      let info;
      try {info = await this.api(`/chat-attachments/${ref.id}/?device=${identity.id}`);} catch (error: any) {
        if (/not found/i.test(error.message)) throw new Error('This file was not addressed to this device. Ask the sender to resend.');
        throw error;
      }
      if (!info.available || !info.envelope) throw new Error('Not saved on this device. The relay copy is gone—ask the sender to resend.');
      await this.pin(info.sender_device, info.sender_public_key);
      if (info.sha256 !== ref.sha256) throw new Error('Attachment checksum changed.');
      const cipher = await this.download(`/chat-attachments/${ref.id}/content/?device=${identity.id}`);
      if (cipher.length > MAX_ATTACHMENT_BYTES + 28) throw new Error('Attachment exceeds the size limit.');
      record = {info: {...info, id: ref.id}, cipher};
      await this.decrypt(record, ref);
      this.guard();
      await this.storage.write(record);
      record = await this.storage.read(ref.id);
      if (!record || record.info.sha256 !== ref.sha256) throw new Error('Local storage failed. Delivery has not been confirmed.');
    }
    const opened = await this.decrypt(record, ref);
    // Never acknowledge before the persisted copy has been read back and verified.
    await this.ack(record.info).catch(() => {});
    return opened;
  }
  async sync() {
    if (this.syncing) return;
    this.syncing = true;
    try {
      const identity = await this.ready();
      const pending = await this.api(`/chat-attachments/pending/?device=${identity.id}`);
      // Sequential: bound memory use for videos. Does not mark conversations read.
      for (const ref of pending) { this.guard(); await this.receive(ref).catch(() => {}); }
    } finally { this.syncing = false; }
  }
}
