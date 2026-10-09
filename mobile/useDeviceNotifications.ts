import {useEffect, useRef, useState} from 'react';
import {AppState, Linking, Platform} from 'react-native';
import Constants from 'expo-constants';
import {File, Paths} from 'expo-file-system';
import * as Notifications from './notificationRuntime';

export type DeliveryNotice = {delivery_id: number; recipient_id: number; kind: string; title: string; body: string; conversation_id?: number; post_id?: number; event_id?: number};
type Options = {token: string; userId?: number; chatsOpen: boolean; api: (path: string, options?: any) => Promise<any>; open: (notice: DeliveryNotice) => Promise<void>};
let notificationContext = {userId: 0, chatsOpen: false, allowed: false};
Notifications.setNotificationHandler({
  handleNotification: async notification => {
    const data = notification.request.content.data || {};
    const show = notificationContext.allowed && data.recipient_id === notificationContext.userId && !(data.kind === 'MESSAGE' && notificationContext.chatsOpen);
    return {shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false};
  },
});
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16);});
function preferences(userId: number) {
  const file = new File(Paths.document, 'notification-device-' + userId + '.json');
  try { const data = JSON.parse(file.textSync()); if (data.id) return {file, ...data}; } catch (_) {}
  return {file, id: uuid(), enabled: false};
}

export function useDeviceNotifications(options: Options) {
  const latest = useRef(options); latest.current = options;
  const device = useRef<{id: string; transport: string} | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [settingsNeeded, setSettingsNeeded] = useState(false);
  const [message, setMessage] = useState('Get chat, RSVP, and reply notifications. Chat alerts stay quiet while Chats is open.');
  const configuring = useRef(false);
  const handledResponse = useRef<string | null>(null);
  notificationContext = {userId: options.userId || 0, chatsOpen: options.chatsOpen && AppState.currentState === 'active', allowed: enabled && !!options.token};

  const configure = async (ask = true) => {
    if (configuring.current || !latest.current.token || !latest.current.userId) return;
    configuring.current = true; setBusy(true);
    const account = latest.current;
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('chat', {name:'Chat messages', importance:Notifications.AndroidImportance.HIGH});
        await Notifications.setNotificationChannelAsync('activity', {name:'RSVPs and community activity', importance:Notifications.AndroidImportance.DEFAULT});
      }
      let permission = await Notifications.getPermissionsAsync();
      if (ask && !permission.granted && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync({ios:{allowAlert:true,allowBadge:true,allowSound:true}});
      const allowed = permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
      setSettingsNeeded(!allowed && !permission.canAskAgain);
      if (!allowed) {
        const saved = preferences(account.userId!);
        if (saved.enabled) {
          await account.api('/notifications/device/', {method:'DELETE',body:JSON.stringify({id:saved.id})});
          saved.file.write(JSON.stringify({id:saved.id,enabled:false}));
        }
        device.current = null;
        setMessage(permission.canAskAgain ? 'Notifications are off. You can enable them here anytime.' : 'Notifications are blocked. Allow them in your phone settings.');
        setEnabled(false); return;
      }
      const saved = preferences(account.userId!);
      const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
      let transport = 'LOCAL'; let address = {};
      try {
        const pushToken = await Notifications.getRemotePushToken(projectId);
        if (pushToken) {
          address = {token: pushToken};
          transport = 'EXPO';
        }
      } catch (_) { /* Keep local alerts available when native push is not configured. */ }
      if (latest.current.token !== account.token) return;
      await account.api('/notifications/device/', {method:'PUT',body:JSON.stringify({id:saved.id,transport,address})});
      saved.file.write(JSON.stringify({id:saved.id,enabled:true}));
      device.current = {id:saved.id,transport}; setEnabled(true);
      setMessage(transport === 'EXPO' ? 'Notifications enabled. Chat alerts stay quiet while Chats is open.' : 'Notifications enabled while this app is open. Background alerts are not configured yet.');
    } catch (_) { setMessage('Could not enable notifications. Check your connection and try again.'); }
    finally { configuring.current = false; setBusy(false); }
  };
  const disable = async () => {
    const account = latest.current;
    if (!account.userId) return;
    const saved = preferences(account.userId);
    setBusy(true);
    try {
      await account.api('/notifications/device/', {method:'DELETE',body:JSON.stringify({id:saved.id})});
      saved.file.write(JSON.stringify({id:saved.id,enabled:false}));
      device.current = null; setEnabled(false);
      await Notifications.dismissAllNotificationsAsync();
      setMessage('Notifications are off.');
    } catch (_) { setMessage('Could not turn off notifications. Check your connection and try again.'); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (!options.token || !options.userId) { device.current = null; setEnabled(false); return; }
    device.current = null; setEnabled(false); setSettingsNeeded(false);
    setMessage('Get chat, RSVP, and reply notifications. Chat alerts stay quiet while Chats is open.');
    let cancelled = false, polling = false;
    const saved = preferences(options.userId);
    if (saved.enabled) void configure(false);
    const respond = async (response: Notifications.NotificationResponse | null) => {
      if (!response || cancelled) return;
      const id = response.notification.request.identifier;
      const notice = response.notification.request.content.data as unknown as DeliveryNotice;
      if (handledResponse.current === id || notice.recipient_id !== latest.current.userId) return;
      handledResponse.current = id;
      await latest.current.open(notice);
      await Notifications.clearLastNotificationResponseAsync();
    };
    const responseListener = Notifications.addNotificationResponseReceivedListener(response => { void respond(response).catch(() => {}); });
    void Notifications.getLastNotificationResponseAsync().then(respond).catch(() => {});
    const timer = setInterval(async () => {
      if (polling || cancelled || AppState.currentState !== 'active' || device.current?.transport !== 'LOCAL') return;
      polling = true;
      try {
        const response = await latest.current.api('/notifications/poll-delivery/', {method:'POST',body:JSON.stringify({id:device.current.id})});
        for (const notice of response.deliveries as DeliveryNotice[]) {
          if (cancelled || notice.recipient_id !== latest.current.userId || (notice.kind === 'MESSAGE' && latest.current.chatsOpen)) continue;
          await Notifications.scheduleNotificationAsync({identifier:'socialquest-' + notice.delivery_id, content:{title:notice.title,body:notice.body,data:{...notice},sound:'default'},trigger:null});
        }
      } catch (_) {} finally { polling = false; }
    }, 4000);
    const stateListener = AppState.addEventListener('change', state => {
      notificationContext.chatsOpen = state === 'active' && latest.current.chatsOpen;
      if (state === 'active' && preferences(options.userId!).enabled) void configure(false);
    });
    return () => { cancelled = true; clearInterval(timer); responseListener.remove(); stateListener.remove(); };
  }, [options.token, options.userId]);
  useEffect(() => {
    if (!options.chatsOpen || AppState.currentState !== 'active') return;
    void Notifications.getPresentedNotificationsAsync().then(items => Promise.all(items.filter(item => item.request.content.data?.kind === 'MESSAGE').map(item => Notifications.dismissNotificationAsync(item.request.identifier)))).catch(() => {});
  }, [options.chatsOpen]);
  return {enabled, busy, message, settingsNeeded, enable: () => settingsNeeded ? Linking.openSettings() : configure(), disable};
}
