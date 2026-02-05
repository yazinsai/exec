import { AppState, AppStateStatus, Platform } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import * as Notifications from "expo-notifications";
import { db } from "./db";
import { processQueue } from "./queue";

const POLL_INTERVAL_MS = 3000;
const ANDROID_NOTIFICATION_ID = "background-upload";

let pollTimer: ReturnType<typeof setInterval> | null = null;
let isBackgroundProcessing = false;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

/**
 * Show a sticky notification on Android to prevent the OS from killing
 * the JS thread while uploads/transcription are in progress.
 */
async function showUploadNotification() {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync("background-upload", {
    name: "Background Uploads",
    importance: Notifications.AndroidImportance.LOW,
    sound: null,
    vibrationPattern: [0],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });

  await Notifications.scheduleNotificationAsync({
    identifier: ANDROID_NOTIFICATION_ID,
    content: {
      title: "Processing recording",
      body: "Uploading and transcribing in the background...",
      sticky: true,
      autoDismiss: false,
      priority: Notifications.AndroidNotificationPriority.LOW,
    },
    trigger: null, // show immediately
  });
}

async function dismissUploadNotification() {
  if (Platform.OS !== "android") return;
  await Notifications.dismissNotificationAsync(ANDROID_NOTIFICATION_ID);
}

async function hasPendingRecordings(): Promise<boolean> {
  const result = await db.queryOnce({
    recordings: {
      $: {
        where: {
          status: { $ne: "transcribed" },
        },
        limit: 1,
      },
    },
  });

  return result.data.recordings.length > 0;
}

async function runBackgroundCycle() {
  if (!isBackgroundProcessing) return;

  try {
    const netState = await NetInfo.fetch();
    const isOnline = netState.isConnected ?? false;

    if (!isOnline) return;

    const hasPending = await hasPendingRecordings();
    if (!hasPending) {
      stopBackgroundProcessing();
      return;
    }

    await processQueue(isOnline);

    // Check again after processing — if nothing left, stop
    const stillHasPending = await hasPendingRecordings();
    if (!stillHasPending) {
      stopBackgroundProcessing();
    }
  } catch (error) {
    console.warn("[BackgroundQueue] cycle error:", error);
  }
}

function startBackgroundProcessing() {
  if (isBackgroundProcessing) return;
  isBackgroundProcessing = true;

  console.log("[BackgroundQueue] Starting background processing");
  showUploadNotification().catch(() => {});

  // Run immediately, then poll
  runBackgroundCycle();
  pollTimer = setInterval(runBackgroundCycle, POLL_INTERVAL_MS);
}

function stopBackgroundProcessing() {
  if (!isBackgroundProcessing) return;
  isBackgroundProcessing = false;

  console.log("[BackgroundQueue] Stopping background processing");

  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  dismissUploadNotification().catch(() => {});
}

function handleAppStateChange(nextState: AppStateStatus) {
  if (nextState === "background" || nextState === "inactive") {
    // App going to background — check if there's work to do
    hasPendingRecordings()
      .then((hasPending) => {
        if (hasPending) {
          startBackgroundProcessing();
        }
      })
      .catch(() => {});
  } else if (nextState === "active") {
    // App returning to foreground — React hooks will take over
    stopBackgroundProcessing();
  }
}

/**
 * Call once at app startup (in _layout.tsx or similar) to enable
 * background queue processing on Android.
 */
export function initBackgroundQueue() {
  if (appStateSubscription) return; // already initialized

  appStateSubscription = AppState.addEventListener("change", handleAppStateChange);
  console.log("[BackgroundQueue] Initialized");
}

/**
 * Clean up (not typically needed — the app's lifecycle manages this).
 */
export function teardownBackgroundQueue() {
  stopBackgroundProcessing();
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
}
