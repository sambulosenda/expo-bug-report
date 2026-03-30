let cachedPushToken: string | null = null;

/**
 * Attempt to get the Expo Push Token. Returns null if expo-notifications
 * is not installed, permissions are denied, or no EAS projectId is found.
 * Silently disables push features without breaking the SDK.
 */
export async function getExpoPushToken(): Promise<string | null> {
  if (cachedPushToken) return cachedPushToken;

  try {
    const Notifications = require('expo-notifications');
    const Constants = require('expo-constants');

    const projectId = Constants.default?.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.warn('[BugPulse] Push disabled: no EAS projectId found');
      return null;
    }

    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      const { status: newStatus } = await Notifications.requestPermissionsAsync();
      if (newStatus !== 'granted') {
        console.warn('[BugPulse] Push disabled: notification permission denied');
        return null;
      }
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    cachedPushToken = tokenData.data;
    return cachedPushToken;
  } catch {
    // expo-notifications not installed or other error — silently disable
    return null;
  }
}

export function getCachedPushToken(): string | null {
  return cachedPushToken;
}
