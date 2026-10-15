// Built into web/static/chat-attachments.js by scripts/build-attachments.cjs.
import {AttachmentClient, checkSize, fileSize, hex, imageMime, videoMime, previewMime, type CryptoAdapter, type LocalRecord, type Prepared} from './attachmentProtocol';

const win = window as any;
const dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('socialquest-encrypted-attachments-v1', 1);
  request.onupgradeneeded = () => {request.result.createObjectStore('values'); request.result.createObjectStore('files');};
  request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
});
// Avoid an unhandled rejection when browser storage is disabled and chat is unused.
void dbPromise.catch(() => {});
export const browserAttachmentCrypto: CryptoAdapter = {
  random: async n => crypto.getRandomValues(new Uint8Array(n)),
  hash: async bytes => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)))),
  encrypt: async (bytes, key, aad) => {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const aes = await crypto.subtle.importKey('raw', new Uint8Array(key), 'AES-GCM', false, ['encrypt']);
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: new Uint8Array(aad), tagLength: 128}, aes, new Uint8Array(bytes)));
    const combined = new Uint8Array(iv.length + encrypted.length); combined.set(iv); combined.set(encrypted, iv.length); return combined;
  },
  decrypt: async (bytes, key, aad) => {
    const aes = await crypto.subtle.importKey('raw', new Uint8Array(key), 'AES-GCM', false, ['decrypt']);
    return new Uint8Array(await crypto.subtle.decrypt({name: 'AES-GCM', iv: new Uint8Array(bytes.slice(0, 12)), additionalData: new Uint8Array(aad), tagLength: 128}, aes, new Uint8Array(bytes.slice(12))));
  },
};
function storageFor(user: number) {
  const query = async (store: string, key: string, value?: any, write = false): Promise<any> => {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, write ? 'readwrite' : 'readonly'), table = tx.objectStore(store);
      const request = table.get(user + ':' + key); let result: any;
      request.onsuccess = () => {
        result = request.result;
        // Concurrent tabs must not overwrite the shared private identity.
        if (write && !(key === 'identity' && result)) table.put(value, user + ':' + key);
      };
      tx.oncomplete = () => resolve(write ? undefined : result);
      tx.onerror = () => reject(tx.error || new Error('Could not save attachment on this browser.'));
      tx.onabort = () => reject(tx.error || new Error('Browser storage is full or unavailable. Delivery was not confirmed.'));
    });
  };
  return {get: (key: string) => query('values', key), put: (key: string, value: any) => query('values', key, value, true),
    read: (id: string) => query('files', id), write: (record: LocalRecord) => query('files', record.info.id, record, true)};
}

let client: AttachmentClient | null = null, timer: ReturnType<typeof setInterval> | undefined;
let restart: (() => void) | undefined;
const views = new Map<HTMLElement, string>();
const drafts = new WeakMap<HTMLFormElement, {file: File; prepared?: Prepared; sending?: boolean}>();
function sweep() {for (const [node, url] of views) if (!node.isConnected) {URL.revokeObjectURL(url); views.delete(node);}}
function dispose() {if (timer) clearInterval(timer); timer = undefined; client = null; for (const url of views.values()) URL.revokeObjectURL(url); views.clear();}
function init({api, userId, token}: {api: any; userId: number; token: string}) {
  dispose();
  restart = () => init({api, userId, token});
  const guard = () => {if (localStorage.getItem('socialquest_token') !== token || client !== instance) throw new Error('Session changed.'); if (!crypto.subtle) throw new Error('Attachments require HTTPS (or localhost) and a browser with Web Crypto.');};
  const request = (path: string, options: any = {}) => {guard(); return api(path, {...options, background: true});};
  const instance = new AttachmentClient(userId, request, browserAttachmentCrypto, storageFor(userId),
    async path => {
      guard(); const response = await fetch('/api' + path, {headers: {Authorization: 'Token ' + token}, cache: 'no-store'});
      if (!response.ok) throw new Error(response.status === 410 ? 'Attachment expired. Ask the sender to resend.' : 'Could not download attachment. Tap to retry.');
      const bytes = new Uint8Array(await response.arrayBuffer()); guard(); return bytes;
    }, async prepared => {
      const form = new FormData();
      form.append('id', prepared.record.info.id); form.append('device', prepared.device); form.append('conversation', String(prepared.record.info.conversation));
      form.append('body', prepared.body); form.append('envelopes', JSON.stringify(prepared.envelopes));
      form.append('ciphertext', new Blob([new Uint8Array(prepared.record.cipher)], {type: 'application/octet-stream'}), 'encrypted.bin');
      return request('/chat-attachments/', {method: 'POST', body: form});
    }, guard);
  client = instance;
  const sync = () => {sweep(); if (!document.hidden && client === instance) void instance.sync().catch(() => {});};
  sync(); timer = setInterval(sync, 15000);
}
function bind(form: HTMLFormElement) {
  const text = form.querySelector('input:not([type=file])') as HTMLInputElement;
  const wrap = document.createElement('div'); wrap.className = 'chat-attachment-draft'; wrap.hidden = true;
  wrap.setAttribute('aria-live', 'polite'); form.before(wrap);
  const input = document.createElement('input'); input.type = 'file'; input.hidden = true;
  input.setAttribute('aria-label', 'Choose a photo, video, or file');
  const button = document.createElement('button'); button.type = 'button'; button.className = 'chat-attach'; button.textContent = '＋'; button.setAttribute('aria-label', 'Attach photo, video, or file');
  button.onclick = () => input.click(); form.append(input); text.before(button);
  input.onchange = () => {
    if (!input.files?.[0]) return;
    const file = input.files[0];
    try {checkSize(file.size);} catch (error: any) {alert(error.message); input.value = ''; return;}
    drafts.set(form, {file}); text.required = false; text.readOnly = false;
    const label = document.createElement('strong'); label.textContent = file.name + ' · ' + fileSize(file.size);
    const note = document.createElement('small'); note.textContent = 'File encrypted · 24-hour relay limit. Captions and text are not encrypted. Recipients must open the app to save files before expiry.';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Remove';
    cancel.onclick = () => {if (drafts.get(form)?.sending) return; drafts.delete(form); input.value = ''; wrap.hidden = true; text.required = true; text.readOnly = false;};
    wrap.replaceChildren(label, note, cancel); wrap.hidden = false;
  };
}
async function send(form: HTMLFormElement) {
  const draft = drafts.get(form); if (!draft || draft.sending) return false;
  const instance = client; if (!instance) throw new Error('Attachments are not ready yet. Please try again.');
  const input = form.querySelector('input:not([type=file])') as HTMLInputElement;
  draft.sending = true;
  form.querySelectorAll('button').forEach(button => button.disabled = true);
  input.readOnly = true;
  try {
    if (!draft.prepared) draft.prepared = await instance.prepare(Number(form.dataset.conversation), new Uint8Array(await draft.file.arrayBuffer()), {name: draft.file.name, mime: draft.file.type || 'application/octet-stream', size: draft.file.size}, input.value);
    await instance.send(draft.prepared);
    drafts.delete(form); input.value = ''; input.required = true; input.readOnly = false;
    const preview = form.previousElementSibling as HTMLElement; if (preview?.classList.contains('chat-attachment-draft')) preview.hidden = true;
    const picker = form.querySelector('input[type=file]') as HTMLInputElement; picker.value = '';
    return true;
  } finally {
    draft.sending = false; form.querySelectorAll('button').forEach(button => button.disabled = false);
    // A retry must retain the caption that was included in its idempotent request.
    if (!draft.prepared) input.readOnly = false;
  }
}
function hydrate(holder: HTMLElement, messages: any[], conversation: number) {
  sweep(); const instance = client;
  for (const message of messages) {
    if (!message.attachment || message.deleted_for_everyone) continue;
    const bubble = holder.querySelector(`[data-message-id="${message.id}"]`);
    if (!bubble || bubble.querySelector('.chat-attachment')) continue;
    const card = document.createElement('div'); card.className = 'chat-attachment'; bubble.prepend(card);
    const load = async () => {
      card.textContent = 'Saving encrypted attachment…';
      try {
        if (!instance) throw new Error('Attachments not ready. Tap to retry.');
        const result = await instance.receive({...message.attachment, conversation, sender: message.sender.id});
        if (!card.isConnected || client !== instance) return;
        const follow = holder.scrollHeight - holder.scrollTop - holder.clientHeight < 90;
        // Never create same-origin active HTML/SVG blob documents, even when a
        // download link is opened in a new tab through the browser context menu.
        const url = URL.createObjectURL(new Blob([new Uint8Array(result.bytes)], {type: previewMime(result.metadata.mime)}));
        views.set(card, url);
        const name = document.createElement('strong'); name.textContent = result.metadata.name;
        const note = document.createElement('small'); note.textContent = fileSize(result.metadata.size) + ' · saved in this browser';
        const download = document.createElement('a'); download.href = url; download.download = result.metadata.name; download.textContent = 'Save file ↗';
        card.replaceChildren(name, note, download);
        if (imageMime(result.metadata.mime)) {
          const image = document.createElement('img'); image.src = url; image.alt = result.metadata.name; image.loading = 'lazy';
          const open = document.createElement('button'); open.type = 'button'; open.className = 'chat-photo-open'; open.setAttribute('aria-label', 'Open attached photo'); open.append(image); card.prepend(open);
          open.onclick = () => {
            const dialog = document.createElement('dialog'); dialog.className = 'chat-photo-dialog';
            const full = image.cloneNode() as HTMLImageElement;
            const close = document.createElement('button'); close.textContent = 'Close'; close.onclick = () => dialog.close();
            dialog.append(full, close); document.body.append(dialog); dialog.onclose = () => dialog.remove(); dialog.showModal();
          };
        } else if (videoMime(result.metadata.mime)) {
          const video = document.createElement('video'); video.src = url; video.controls = true; video.preload = 'metadata'; video.playsInline = true; card.prepend(video);
        }
        if (follow) holder.scrollTop = holder.scrollHeight;
      } catch (error: any) {
        if (!card.isConnected || client !== instance) return;
        const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = error.message + ' Retry'; retry.onclick = () => void load(); card.replaceChildren(retry);
      }
    };
    void load();
  }
}
win.SocialQuestAttachments = {init, dispose, bind, send, hydrate, hasDraft: (form: HTMLFormElement) => drafts.has(form)};
window.addEventListener('pagehide', dispose);
window.addEventListener('pageshow', event => {if (event.persisted) {restart?.(); for (const node of document.querySelectorAll('.chat-attachment')) node.remove();}});
