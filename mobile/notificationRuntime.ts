import {isRunningInExpoGo} from 'expo';

// SDK 57's package entry point eagerly registers a remote push-token listener,
// which throws in Android Expo Go. Keep local APIs separate from that import.
// These SDK-specific paths are covered by the notification startup tests.
export {setNotificationHandler} from 'expo-notifications/build/NotificationsHandler';
export {
  addNotificationResponseReceivedListener,
  getLastNotificationResponseAsync,
  clearLastNotificationResponseAsync,
} from 'expo-notifications/build/NotificationsEmitter';
export {getPermissionsAsync, requestPermissionsAsync} from 'expo-notifications/build/NotificationPermissions';
export {AndroidImportance} from 'expo-notifications/build/NotificationChannelManager.types';
export {IosAuthorizationStatus} from 'expo-notifications/build/NotificationPermissions.types';
export {setNotificationChannelAsync} from 'expo-notifications/build/setNotificationChannelAsync';
export {scheduleNotificationAsync} from 'expo-notifications/build/scheduleNotificationAsync';
export {getPresentedNotificationsAsync} from 'expo-notifications/build/getPresentedNotificationsAsync';
export {dismissNotificationAsync} from 'expo-notifications/build/dismissNotificationAsync';
export {dismissAllNotificationsAsync} from 'expo-notifications/build/dismissAllNotificationsAsync';
export type {NotificationResponse} from 'expo-notifications/build/Notifications.types';

export async function getRemotePushToken(projectId?: string): Promise<string | null> {
  if (!projectId || isRunningInExpoGo()) return null;
  // require runs only after the environment check; a static import would crash
  // Expo Go even when this function is never called.
  const {getExpoPushTokenAsync} = require('expo-notifications') as typeof import('expo-notifications');
  return (await getExpoPushTokenAsync({projectId})).data;
}
