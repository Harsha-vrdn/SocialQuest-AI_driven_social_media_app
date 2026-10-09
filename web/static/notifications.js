window.SocialQuestNotifications = (() => {
  let context, deviceId, registration, transport, timer, busy = false, stopped = false;
  let enabled = false, message = '', settingUp = false;
  const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16);});
  const supported = () => 'Notification' in window && window.isSecureContext;
  function render() {
    document.querySelectorAll('[data-notification-settings]').forEach(holder => {
      holder.replaceChildren();
      const copy = document.createElement('span');
      copy.textContent = message || (enabled ? 'Notifications enabled. Chat alerts stay quiet while Chats is open.' : 'Get chat, RSVP, and reply notifications. Chat alerts stay quiet while Chats is open.');
      const button = document.createElement('button');
      button.type = 'button'; button.disabled = settingUp;
      button.textContent = settingUp ? 'Please wait…' : enabled ? 'Turn off notifications' : 'Enable notifications';
      button.onclick = () => void (enabled ? disable() : enable());
      holder.append(copy, button);
    });
  }
  async function init(options) {
    context = options; stopped = false;
    const key = 'socialquest_notification_device_' + context.userId;
    deviceId = localStorage.getItem(key) || uuid(); localStorage.setItem(key, deviceId);
    navigator.serviceWorker?.addEventListener('message', event => {
      if (event.data?.type === 'NOTIFICATION_CONTEXT') event.ports[0]?.postMessage({userId: stopped ? null : context.userId, chatsOpen: !document.hidden && context.isChatsOpen()});
      if (event.data?.type === 'OPEN_NOTIFICATION' && event.data.notification?.recipient_id === context.userId) context.open(event.data.notification);
    });
    if (supported() && Notification.permission === 'granted') {
      try {
        const saved = await context.api('/notifications/device/?id=' + deviceId, {background:true});
        if (saved.enabled) await enable(false);
      } catch (_) { message = 'Could not reconnect notifications. Tap Enable to retry.'; }
    }
    render();
  }
  async function enable(requestPermission = true) {
    if (settingUp) return;
    if (!supported()) {
      message = 'Notifications need HTTPS or localhost. On iPhone, add the HTTPS site to your Home Screen and open it there.'; render(); return;
    }
    settingUp = true; render();
    try {
      // The permission request runs directly from the Enable button gesture.
      const permission = requestPermission ? await Notification.requestPermission() : Notification.permission;
      if (permission !== 'granted') {
        message = permission === 'denied' ? 'Notifications are blocked. Allow them in your browser’s site settings, then try again.' : 'Notifications remain off. You can enable them here anytime.';
        return;
      }
      let address = {}; transport = 'LOCAL';
      if ('serviceWorker' in navigator) {
        registration = await navigator.serviceWorker.register('/notification-worker.js');
        await navigator.serviceWorker.ready;
        const config = await context.api('/notifications/delivery-config/', {background:true});
        if (config.webpush_public_key && 'PushManager' in window) {
          try {
            const bytes = Uint8Array.from(atob(config.webpush_public_key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - config.webpush_public_key.length % 4) % 4)), c => c.charCodeAt(0));
            const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:bytes});
            address = subscription.toJSON(); transport = 'WEB';
          } catch (_) { /* Browser push may be unavailable; local notifications still work. */ }
        }
      }
      await context.api('/notifications/device/', {method:'PUT', body:JSON.stringify({id:deviceId, transport, address})});
      enabled = true;
      message = transport === 'WEB' ? 'Notifications enabled. Chat alerts stay quiet while Chats is open.' : 'Notifications enabled while this browser is running. Chat alerts stay quiet while Chats is open.';
      clearInterval(timer);
      if (transport === 'LOCAL') { timer = setInterval(poll, 4000); void poll(); }
    } catch (_) { enabled = false; message = 'Could not enable notifications. Check the connection and browser permission, then try again.'; }
    finally { settingUp = false; render(); }
  }
  async function poll() {
    if (busy || stopped || !enabled || Notification.permission !== 'granted') return;
    busy = true;
    try {
      const result = await context.api('/notifications/poll-delivery/', {method:'POST', body:JSON.stringify({id:deviceId})});
      for (const data of result.deliveries) {
        if (stopped || (data.kind === 'MESSAGE' && !document.hidden && context.isChatsOpen())) continue;
        if (registration?.active) registration.active.postMessage({type:'SHOW_NOTIFICATION', notification:data});
        else {
          const notification = new Notification(data.title, {body:data.body,tag:'socialquest-' + data.delivery_id});
          notification.onclick = () => { window.focus(); context.open(data); notification.close(); };
        }
      }
    } catch (_) {} finally { busy = false; }
  }
  function sync() {
    if (!document.hidden && context?.isChatsOpen()) registration?.active?.postMessage({type:'CLEAR_CHAT_NOTIFICATIONS', userId:context.userId});
    render();
  }
  async function disable() {
    clearInterval(timer); enabled = false;
    try {
      await context.api('/notifications/device/', {method:'DELETE', body:JSON.stringify({id:deviceId})});
      const subscription = await registration?.pushManager.getSubscription();
      await subscription?.unsubscribe();
      message = 'Notifications are off.';
    } catch (_) { message = 'Could not turn off server notifications. Check your connection and try again.'; enabled = true; }
    render();
  }
  async function logout() { stopped = true; await disable(); }
  return {init, render, sync, logout};
})();
