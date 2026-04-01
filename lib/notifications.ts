import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";

// Configure how notifications are handled when the app is in the foreground
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * Request push notification permissions and get the Expo push token.
 * Returns the token string or null if permissions were denied or unavailable.
 */
export async function registerForPushNotificationsAsync(
  log?: (msg: string) => void
): Promise<string | null> {
  const _log = log || console.log;

  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    _log("register: not a physical device");
    return null;
  }
  _log("register: is physical device ✓");

  // Set up Android notification channel
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF6B35",
    });
    _log("register: android channel set ✓");
  }

  // Check current permission status
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  _log(`register: existing permission=${existingStatus}`);
  let finalStatus = existingStatus;

  // Request permission if not already granted
  if (existingStatus !== "granted") {
    _log("register: requesting permission...");
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
    _log(`register: new permission=${finalStatus}`);
  }

  if (finalStatus !== "granted") {
    _log("register: permission denied");
    return null;
  }
  _log("register: permission granted ✓");

  // Get the Expo push token
  try {
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId;

    _log(`register: projectId=${projectId || "MISSING"}`);

    if (!projectId) {
      _log("register: ERROR - no projectId configured");
      return null;
    }

    _log("register: getting expo push token...");
    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    _log(`register: SUCCESS token=${tokenResponse.data.slice(0, 25)}...`);
    return tokenResponse.data;
  } catch (error) {
    _log(`register: ERROR - ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}


/**
 * Add a listener for when a notification is received while the app is in foreground.
 */
export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
) {
  return Notifications.addNotificationReceivedListener(callback);
}

/**
 * Add a listener for when a user interacts with a notification (taps it).
 */
export function addNotificationResponseReceivedListener(
  callback: (response: Notifications.NotificationResponse) => void
) {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

/**
 * Get the notification data payload if the app was opened from a notification.
 */
export async function getLastNotificationResponse(): Promise<Notifications.NotificationResponse | null> {
  if (Platform.OS === "web") return null;
  return Notifications.getLastNotificationResponseAsync();
}

// Re-export types for convenience
export type { Notification, NotificationResponse } from "expo-notifications";
