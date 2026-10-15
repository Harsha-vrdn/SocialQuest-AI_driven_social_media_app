import {useEffect, useRef, useState} from 'react';
import {randomUUID} from 'expo-crypto';

export type OutgoingMessage<User> = {
  id: number; client_id: string; conversation: number; body: string; sender: User;
  created_at: string; delivery_status: 'sending' | 'failed'; error?: string;
};

// Session-local: navigating back never loses a failed send. The server's client
// ID makes retry safe even if a successful response was lost on the network.
export function useChatOutbox<User>({session, sender, api, onSent}: {
  session: string; sender: User | null;
  api: (path: string, options: {method: string; body: string; signal?: AbortSignal}) => Promise<any>;
  onSent: (message: any, conversation: number) => void;
}) {
  const [entries, setEntries] = useState<OutgoingMessage<User>[]>([]);
  const queue = useRef(entries), locks = useRef(new Set<number>()), nextId = useRef(-Date.now());
  const current = useRef({session, sender, api, onSent}); current.current = {session, sender, api, onSent};
  const epoch = useRef(0), mounted = useRef(true);
  const requests = useRef(new Set<() => void>());
  const update = (fn: (items: OutgoingMessage<User>[]) => OutgoingMessage<User>[]) => {
    queue.current = fn(queue.current); setEntries(queue.current);
  };
  useEffect(() => {
    mounted.current = true; epoch.current++; locks.current.clear(); update(() => []);
    return () => {mounted.current = false; epoch.current++; for (const cancel of requests.current) cancel(); requests.current.clear();};
  }, [session]);
  const deliver = async (entry: OutgoingMessage<User>) => {
    if (locks.current.has(entry.conversation)) return;
    const version = epoch.current, login = current.current.session;
    const valid = () => mounted.current && version === epoch.current && login === current.current.session;
    locks.current.add(entry.conversation);
    update(items => items.map(item => item.client_id === entry.client_id ? {...item, delivery_status: 'sending', error: undefined} : item));
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined, cancel = () => {};
    const deadline = new Promise<never>((_resolve, reject) => {
      cancel = () => {controller.abort(); reject(new Error('Session changed.'));};
      timer = setTimeout(() => {controller.abort(); reject(new Error('Send timed out. Tap to retry safely.'));}, 30000);
    });
    requests.current.add(cancel);
    let sent: any;
    try {
      sent = await Promise.race([current.current.api('/messages/', {method: 'POST', body: JSON.stringify({conversation: entry.conversation, body: entry.body, client_id: entry.client_id}), signal: controller.signal}), deadline]);
    } catch (error: any) {
      if (valid()) update(items => items.map(item => item.client_id === entry.client_id ? {...item, delivery_status: 'failed', error: error.message || 'Check your connection and try again.'} : item));
      return;
    } finally {clearTimeout(timer); requests.current.delete(cancel); if (valid()) locks.current.delete(entry.conversation);}
    if (!valid()) return;
    update(items => items.filter(item => item.client_id !== entry.client_id));
    // A refresh/UI error after acknowledgement must never mark this as failed.
    try {await current.current.onSent(sent, entry.conversation);} catch (_) { /* Already accepted; never re-send because a UI refresh failed. */ }
  };
  const enqueue = (conversation: number, text: string) => {
    const body = text.trim(), config = current.current;
    if (!body || !config.session || !config.sender || locks.current.has(conversation)) return false;
    const entry: OutgoingMessage<User> = {id: nextId.current--, client_id: randomUUID(), conversation, body, sender: config.sender, created_at: new Date().toISOString(), delivery_status: 'sending'};
    update(items => [...items, entry]); void deliver(entry); return true;
  };
  const retry = (id: string) => {
    const entry = queue.current.find(item => item.client_id === id && item.delivery_status === 'failed');
    if (entry) void deliver(entry);
  };
  const discard = (id: string) => update(items => items.filter(item => item.client_id !== id || item.delivery_status !== 'failed'));
  const reconcile = (messages: {client_id?: string | null}[]) => {
    const accepted = new Set(messages.map(item => item.client_id).filter(Boolean));
    if (queue.current.some(item => accepted.has(item.client_id))) update(items => items.filter(item => !accepted.has(item.client_id)));
  };
  return {entries, enqueue, retry, discard, reconcile};
}
