import { useEffect, useRef, useState, useCallback, createContext, useContext, type ReactNode } from "react";
import * as Notifications from "expo-notifications";
import {
  registerForPushNotificationsAsync,
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  getLastNotificationResponse,
} from "@/lib/notifications";

interface NotificationData {
  type?: string;
  taskId?: string;
}

interface PushNotificationsContextValue {
  expoPushToken: string | null;
  notification: Notifications.Notification | null;
  lastTaskId: string | null;
  clearLastTaskId: () => void;
}

const PushNotificationsContext = createContext<PushNotificationsContextValue | null>(null);

export function PushNotificationsProvider({ children }: { children: ReactNode }) {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const [lastTaskId, setLastTaskId] = useState<string | null>(null);
  const notificationListener = useRef<{ remove: () => void } | undefined>(undefined);
  const responseListener = useRef<{ remove: () => void } | undefined>(undefined);
  const hasRegistered = useRef(false);

  const clearLastTaskId = useCallback(() => {
    setLastTaskId(null);
  }, []);

  // Auto-register if permission already granted
  useEffect(() => {
    async function init() {
      if (hasRegistered.current) return;
      hasRegistered.current = true;

      const { status } = await Notifications.getPermissionsAsync();
      if (status === "granted") {
        const token = await registerForPushNotificationsAsync();
        if (token) {
          setExpoPushToken(token);
        }
      }
    }
    init();
  }, []);

  // Check if app was opened from a notification
  useEffect(() => {
    async function checkInitialNotification() {
      const response = await getLastNotificationResponse();
      if (response) {
        const data = response.notification.request.content.data as NotificationData;
        if (data?.taskId) {
          setLastTaskId(data.taskId);
        }
      }
    }
    checkInitialNotification();
  }, []);

  // Set up notification listeners
  useEffect(() => {
    notificationListener.current = addNotificationReceivedListener((n) => {
      setNotification(n);
    });

    responseListener.current = addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as NotificationData;
      if (data?.taskId) {
        setLastTaskId(data.taskId);
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
        lastTaskId,
        clearLastTaskId,
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
