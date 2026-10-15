import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import {Directory, File, Paths} from 'expo-file-system';
import {AttachmentClient, hex, type AttachmentApi, type CryptoAdapter, type LocalRecord} from './attachmentProtocol';

export const nativeAttachmentCrypto: CryptoAdapter = {
  // The async API has no development-mode Math.random fallback.
  random: n => Crypto.getRandomBytesAsync(n),
  hash: async bytes => hex(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes)))),
  encrypt: async (bytes, key, aad) => {
    const sealed = await Crypto.aesEncryptAsync(bytes, await Crypto.AESEncryptionKey.import(key), {nonce: {length: 12}, tagLength: 16, additionalData: aad});
    return sealed.combined();
  },
  decrypt: async (bytes, key, aad) => Crypto.aesDecryptAsync(Crypto.AESSealedData.fromCombined(bytes, {ivLength: 12, tagLength: 16}), await Crypto.AESEncryptionKey.import(key), {additionalData: aad}),
};

export function createMobileAttachmentClient(user: number, token: string, base: string, api: AttachmentApi, guard: () => void) {
  // Clear only app-owned plaintext previews, including leftovers after a crash.
  const previews = new Directory(Paths.cache, 'chat-previews');
  if (previews.exists) previews.delete();
  // Isolate identities and saved files between accounts AND API deployments.
  const namespace = Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base + ':' + user);
  const directory = async () => {
    const dir = new Directory(Paths.document, 'chat-attachments', await namespace);
    dir.create({intermediates: true, idempotent: true}); return dir;
  };
  const recordFile = async (id: string, suffix: string) => {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid attachment ID.');
    return new File(await directory(), id + suffix);
  };
  const storage = {
    get: async (key: string) => {
      const raw = await SecureStore.getItemAsync('chat-' + await namespace + '-' + key);
      return raw ? JSON.parse(raw) : null;
    },
    put: async (key: string, value: any) => SecureStore.setItemAsync('chat-' + await namespace + '-' + key, JSON.stringify(value), {keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY}),
    read: async (id: string): Promise<LocalRecord | null> => {
      const meta = await recordFile(id, '.json'), file = await recordFile(id, '.bin');
      if (!meta.exists || !file.exists) return null;
      return {info: JSON.parse(await meta.text()), cipher: await file.bytes()};
    },
    write: async (record: LocalRecord) => {
      (await recordFile(record.info.id, '.bin')).write(record.cipher);
      (await recordFile(record.info.id, '.json')).write(JSON.stringify(record.info));
    },
  };
  return new AttachmentClient(user, api, nativeAttachmentCrypto, storage,
    async path => {
      guard();
      const response = await fetch(base + path, {headers: {Authorization: 'Token ' + token}});
      if (!response.ok) throw new Error(response.status === 410 ? 'Attachment expired. Ask the sender to resend.' : 'Could not download this attachment. Try again.');
      const bytes = new Uint8Array(await response.arrayBuffer()); guard(); return bytes;
    },
    async prepared => {
      const form = new FormData();
      form.append('id', prepared.record.info.id); form.append('device', prepared.device);
      form.append('conversation', String(prepared.record.info.conversation)); form.append('body', prepared.body);
      form.append('envelopes', JSON.stringify(prepared.envelopes));
      const file = await recordFile(prepared.record.info.id, '.bin');
      // SDK 57 uses expo/fetch: its multipart encoder reads File.bytes(), and
      // rejects React Native's older URI-only file descriptor before HTTP starts.
      form.append('ciphertext', file);
      guard(); return api('/chat-attachments/', {method: 'POST', body: form});
    }, () => {
      guard();
      if (!__DEV__ && !base.startsWith('https://')) throw new Error('Encrypted attachments require an HTTPS server.');
    });
}
