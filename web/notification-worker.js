/* Notifications only: this worker does not cache pages, API data, or credentials. */
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

async function clientContext(client) {
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); resolve(null); }, 500);
    channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data); };
    client.postMessage({type: 'NOTIFICATION_CONTEXT'}, [channel.port2]);
  });
}
function notificationPath(data) {
  const positive = value => Number.isInteger(value) && value > 0;
  if (data.kind === 'MESSAGE' && positive(data.conversation_id)) return '/?view=chats&conversation=' + data.conversation_id;
  if (positive(data.post_id)) return '/?view=post&post=' + data.post_id;
  if (positive(data.event_id)) return '/?view=event&event=' + data.event_id;
  return '/?view=notifications';
}
async function present(data) {
  if (!data || typeof data.title !== 'string' || typeof data.body !== 'string') return;
  const windows = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
  const contexts = await Promise.all(windows.map(clientContext));
  // A live page can suppress a message even if it changed tabs after the server sent it.
  if (data.kind === 'MESSAGE' && contexts.some(context => context?.userId === data.recipient_id && context.chatsOpen)) return;
  if (contexts.length && contexts.every(context => context && context.userId !== data.recipient_id)) return;
  await self.registration.showNotification(data.title, {
    body: data.body, tag: 'socialquest-' + data.delivery_id,
    data: {...data, path: notificationPath(data)},
  });
}
self.addEventListener('push', event => {
  let data;
  try { data = event.data?.json(); } catch (_) { return; }
  event.waitUntil(present(data));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SHOW_NOTIFICATION') event.waitUntil(present(event.data.notification));
  if (event.data?.type === 'CLEAR_CHAT_NOTIFICATIONS') {
    event.waitUntil(self.registration.getNotifications().then(items => items.forEach(item => {
      if (item.data?.kind === 'MESSAGE' && item.data?.recipient_id === event.data.userId) item.close();
    })));
  }
});
self.addEventListener('notificationclick', event => {
  const data = event.notification.data || {};
  event.notification.close();
  event.waitUntil((async () => {
    const path = notificationPath(data);
    const windows = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    for (const client of windows) {
      const context = await clientContext(client);
      if (context?.userId === data.recipient_id) {
        await client.focus(); client.postMessage({type: 'OPEN_NOTIFICATION', notification: data}); return;
      }
    }
    await self.clients.openWindow(path);
  })());
});
