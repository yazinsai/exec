import { useEffect, useRef, useState, useCallback, createContext, useContext, type ReactNode } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { id } from "@instantdb/react-native";
import { db } from "@/lib/db";
import {
  registerForPushNotificationsAsync,
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  getLastNotificationResponse,
} from "@/lib/notifications";

interface NotificationData {
  type?: "action_completed" | "action_awaiting_feedback";
  actionId?: string;
  actionTitle?: string;
}

interface PushNotificationsContextValue {
  expoPushToken: string | null;
  notification: Notifications.Notification | null;
  lastActionId: string | null;
  clearLastActionId: () => void;
  isEnabled: boolean;
  isLoading: boolean;
  permissionStatus: "granted" | "denied" | "undetermined";
  enableNotifications: () => Promise<boolean>;
  disableNotifications: () => Promise<void>;
  debugLog: string[];
}

const PushNotificationsContext = createContext<PushNotificationsContextValue | null>(null);

export function PushNotificationsProvider({ children }: { children: ReactNode }) {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const [lastActionId, setLastActionId] = useState<string | null>(null);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [permissionStatus, setPermissionStatus] = useState<"granted" | "denied" | "undetermined">("undetermined");
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const notificationListener = useRef<ReturnType<typeof Notifications.addNotificationReceivedListener>>();
  const responseListener = useRef<ReturnType<typeof Notifications.addNotificationResponseReceivedListener>>();
  const hasRegistered = useRef(false);

  const log = useCallback((msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const entry = `[${timestamp}] ${msg}`;
    console.log(entry);
    setDebugLog(prev => [...prev.slice(-19), entry]); // Keep last 20 entries
  }, []);

  const clearLastActionId = useCallback(() => {
    setLastActionId(null);
  }, []);

  // Save token to InstantDB
  const saveTokenToDb = useCallback(async (token: string) => {
    const now = Date.now();
    const platform = Platform.OS;

    log(`saveToken: querying existing...`);
    const { data } = await db.queryOnce({
      pushTokens: {
        $: { where: { token } },
      },
    });
    log(`saveToken: found ${data.pushTokens.length} existing`);

    if (data.pushTokens.length > 0) {
      const existingId = data.pushTokens[0].id;
      await db.transact(
        db.tx.pushTokens[existingId].update({
          updatedAt: now,
        })
      );
      log("saveToken: updated existing");
    } else {
      await db.transact(
        db.tx.pushTokens[id()].update({
          token,
          platform,
          createdAt: now,
          updatedAt: now,
        })
      );
      log("saveToken: created new");
    }
  }, [log]);

  // Delete token from InstantDB
  const deleteTokenFromDb = useCallback(async (token: string) => {
    const { data } = await db.queryOnce({
      pushTokens: {
        $: { where: { token } },
      },
    });

    if (data.pushTokens.length > 0) {
      const existingId = data.pushTokens[0].id;
      await db.transact(db.tx.pushTokens[existingId].delete());
      console.log("Push token deleted");
    }
  }, []);

  // Enable notifications
  const enableNotifications = useCallback(async (): Promise<boolean> => {
    log("enable: starting...");
    setIsLoading(true);
    try {
      const token = await registerForPushNotificationsAsync(log);
      log(`enable: token=${token ? token.slice(0, 20) + "..." : "null"}`);

      const { status } = await Notifications.getPermissionsAsync();
      log(`enable: permission=${status}`);
      setPermissionStatus(status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined");

      if (token) {
        log("enable: saving to DB...");
        await saveTokenToDb(token);
        log("enable: saved! setting state...");
        setExpoPushToken(token);
        setIsEnabled(true);
        log("enable: SUCCESS");
        return true;
      }
      log("enable: no token, FAILED");
      return false;
    } catch (error) {
      log(`enable: ERROR - ${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [saveTokenToDb, log]);

  // Disable notifications
  const disableNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      if (expoPushToken) {
        await deleteTokenFromDb(expoPushToken);
      }
      setExpoPushToken(null);
      setIsEnabled(false);
    } catch (error) {
      console.error("Error disabling notifications:", error);
    } finally {
      setIsLoading(false);
    }
  }, [expoPushToken, deleteTokenFromDb]);

  // Check initial status - query DB for existing token
  useEffect(() => {
    async function initializeNotifications() {
      if (hasRegistered.current) return;
      hasRegistered.current = true;

      log("init: starting...");

      // Check permission status
      const { status } = await Notifications.getPermissionsAsync();
      log(`init: permission=${status}`);
      setPermissionStatus(status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined");

      // Check if we have a token registered in the DB
      try {
        log("init: checking DB for tokens...");
        const { data } = await db.queryOnce({ pushTokens: {} });
        log(`init: found ${data.pushTokens.length} tokens in DB`);

        if (data.pushTokens.length > 0) {
          // Token exists in DB - we're enabled
          log("init: using existing token");
          setExpoPushToken(data.pushTokens[0].token);
          setIsEnabled(true);
          setIsLoading(false);
          return;
        }
      } catch (error) {
        log(`init: DB error - ${error instanceof Error ? error.message : String(error)}`);
      }

      // No token in DB - check if we can auto-register (permission already granted)
      if (status === "granted") {
        log("init: auto-registering...");
        const token = await registerForPushNotificationsAsync(log);

        if (token) {
          log(`init: got token, saving...`);
          setExpoPushToken(token);
          setIsEnabled(true);

          try {
            await saveTokenToDb(token);
            log("init: token saved");
          } catch (error) {
            log(`init: save error - ${error instanceof Error ? error.message : String(error)}`);
          }
        } else {
          log("init: no token received");
        }
      } else {
        log("init: permission not granted, skipping");
      }

      setIsLoading(false);
      log("init: done");
    }

    initializeNotifications();
  }, [saveTokenToDb, log]);

  // Check if app was opened from a notification
  useEffect(() => {
    async function checkInitialNotification() {
      const response = await getLastNotificationResponse();
      if (response) {
        const data = response.notification.request.content.data as NotificationData;
        if (data?.actionId) {
          console.log("App opened from notification, actionId:", data.actionId);
          setLastActionId(data.actionId);
        }
      }
    }

    checkInitialNotification();
  }, []);

  // Set up notification listeners
  useEffect(() => {
    // Listener for notifications received while app is in foreground
    notificationListener.current = addNotificationReceivedListener((notification) => {
      console.log("Notification received:", notification.request.content.title);
      setNotification(notification);
    });

    // Listener for when user taps on a notification
    responseListener.current = addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as NotificationData;
      console.log("Notification tapped, data:", data);

      if (data?.actionId) {
        setLastActionId(data.actionId);
      }
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  return (
    <PushNotificationsContext.Provider
      value={{
        expoPushToken,
        notification,
        lastActionId,
        clearLastActionId,
        isEnabled,
        isLoading,
        permissionStatus,
        enableNotifications,
        disableNotifications,
        debugLog,
      }}
    >
      {children}
    </PushNotificationsContext.Provider>
  );
}

export function usePushNotifications(): PushNotificationsContextValue {
  const context = useContext(PushNotificationsContext);
  if (!context) {
    throw new Error("usePushNotifications must be used within a PushNotificationsProvider");
  }
  return context;
}
