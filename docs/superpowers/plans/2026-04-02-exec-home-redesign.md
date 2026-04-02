# Exec Home Screen Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the home screen from a history-focused list into a live command center with pinned active tasks, a floating record button, and a bottom-sheet recording experience.

**Architecture:** Fixed active-tasks section at top, scrollable history list below, floating FAB for recording. Bottom sheet replaces full-screen recording overlay. Two InstantDB queries (recent + active) merged client-side.

**Tech Stack:** Expo, React Native, react-native-reanimated, react-native-gesture-handler, InstantDB, Ionicons

**Spec:** `docs/superpowers/specs/2026-04-02-exec-home-redesign-design.md`

---

### Task 1: ActiveTaskCard component

**Files:**
- Create: `components/ActiveTaskCard.tsx`

- [ ] **Step 1: Create ActiveTaskCard component**

```tsx
// components/ActiveTaskCard.tsx
import { useState, useEffect, useRef } from "react";
import { View, Text, Pressable } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useThemeColors";
import {
  spacing,
  typography,
  radii,
  fontFamily,
  shadows,
} from "@/constants/Colors";
import type { ThemeColors } from "@/constants/Colors";

interface ActiveTaskCardProps {
  title: string;
  status: "running" | "pending";
  startedAt?: number | null;
  createdAt: number;
  cancelRequested?: boolean | null;
  onView: () => void;
  onCancel: () => void;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m ${totalSeconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function ActiveTaskCard({
  title,
  status,
  startedAt,
  createdAt,
  cancelRequested,
  onView,
  onCancel,
}: ActiveTaskCardProps) {
  const colors = useColors();
  const isRunning = status === "running";
  const borderColor = isRunning ? colors.statusRunning : colors.statusPending;

  // Pulse animation for running tasks
  const borderOpacity = useSharedValue(1);
  useEffect(() => {
    if (isRunning) {
      borderOpacity.value = withRepeat(
        withSequence(
          withTiming(0.4, { duration: 400, easing: Easing.out(Easing.exp) }),
          withTiming(1, { duration: 400, easing: Easing.out(Easing.exp) })
        ),
        -1,
        false
      );
    } else {
      borderOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [isRunning, borderOpacity]);

  const borderAnimatedStyle = useAnimatedStyle(() => ({
    opacity: borderOpacity.value,
  }));

  // Elapsed time ticker
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isRunning) {
      const origin = startedAt ?? createdAt;
      setElapsed(Date.now() - origin);
      intervalRef.current = setInterval(() => {
        setElapsed(Date.now() - origin);
      }, 1000);
    } else {
      setElapsed(0);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, startedAt, createdAt]);

  const statusLabel = isRunning ? "Executing" : "Queued";
  const statusColor = borderColor;

  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: colors.backgroundElevated,
        borderRadius: radii.lg,
        overflow: "hidden",
        ...shadows.sm,
      }}
    >
      {/* Animated left border */}
      <Animated.View
        style={[
          {
            width: 3,
            backgroundColor: borderColor,
          },
          borderAnimatedStyle,
        ]}
      />

      {/* Card content */}
      <View style={{ flex: 1, padding: spacing.md, gap: spacing.xs }}>
        {/* Title */}
        <Text
          numberOfLines={2}
          style={{
            color: colors.textPrimary,
            fontSize: typography.base,
            fontFamily: fontFamily.medium,
            lineHeight: 21,
          }}
        >
          {title}
        </Text>

        {/* Status line + actions */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text
            style={{
              color: statusColor,
              fontSize: typography.xs,
              fontFamily: fontFamily.medium,
              letterSpacing: 0.3,
            }}
          >
            {statusLabel}
            {isRunning ? ` · ${formatElapsed(elapsed)}` : ""}
          </Text>

          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <Pressable onPress={onView} hitSlop={8}>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: typography.xs,
                  fontFamily: fontFamily.medium,
                }}
              >
                View
              </Text>
            </Pressable>

            {isRunning && !cancelRequested && (
              <Pressable onPress={onCancel} hitSlop={8}>
                <Ionicons name="close" size={16} color={colors.textTertiary} />
              </Pressable>
            )}

            {cancelRequested && (
              <Text
                style={{
                  color: colors.warning,
                  fontSize: typography.xs,
                  fontFamily: fontFamily.regular,
                }}
              >
                Cancelling...
              </Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/rock/ai/projects/exec && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors in `ActiveTaskCard.tsx`

- [ ] **Step 3: Commit**

```bash
git add components/ActiveTaskCard.tsx
git commit -m "Add ActiveTaskCard component with pulse animation and elapsed timer"
```

---

### Task 2: TaskListItem component

**Files:**
- Create: `components/TaskListItem.tsx`

- [ ] **Step 1: Create TaskListItem component**

```tsx
// components/TaskListItem.tsx
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useThemeColors";
import { spacing, typography, fontFamily } from "@/constants/Colors";

interface TaskListItemProps {
  title: string;
  status: "done" | "failed" | "cancelled";
  createdAt: number;
  onPress: () => void;
}

const STATUS_ICONS: Record<string, { name: string; colorKey: string }> = {
  done: { name: "checkmark-circle", colorKey: "statusDone" },
  failed: { name: "alert-circle", colorKey: "statusFailed" },
  cancelled: { name: "close-circle", colorKey: "statusCancelled" },
};

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function TaskListItem({
  title,
  status,
  createdAt,
  onPress,
}: TaskListItemProps) {
  const colors = useColors();
  const icon = STATUS_ICONS[status] ?? STATUS_ICONS.done;
  const iconColor = (colors as any)[icon.colorKey] as string;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          color: colors.textPrimary,
          fontSize: typography.base,
          fontFamily: fontFamily.regular,
          lineHeight: 21,
        }}
      >
        {title}
      </Text>

      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginLeft: spacing.md }}>
        <Text
          style={{
            color: colors.textTertiary,
            fontSize: typography.xs,
            fontFamily: fontFamily.regular,
          }}
        >
          {relativeTime(createdAt)}
        </Text>
        <Ionicons name={icon.name as any} size={13} color={iconColor} />
      </View>
    </Pressable>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/rock/ai/projects/exec && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors in `TaskListItem.tsx`

- [ ] **Step 3: Commit**

```bash
git add components/TaskListItem.tsx
git commit -m "Add TaskListItem component for compact history rows"
```

---

### Task 3: RecordFAB component

**Files:**
- Create: `components/RecordFAB.tsx`

- [ ] **Step 1: Create RecordFAB component**

```tsx
// components/RecordFAB.tsx
import { useEffect } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useThemeColors";
import { shadows } from "@/constants/Colors";

interface RecordFABProps {
  isRecording: boolean;
  isProcessing: boolean;
  bottomInset: number;
  onPress: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function RecordFAB({
  isRecording,
  isProcessing,
  bottomInset,
  onPress,
}: RecordFABProps) {
  const colors = useColors();
  const scale = useSharedValue(1);
  const pulseScale = useSharedValue(1);

  // Pulse animation while recording
  useEffect(() => {
    if (isRecording) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.06, { duration: 500 }),
          withTiming(1, { duration: 500 })
        ),
        -1,
        false
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 200 });
    }
  }, [isRecording, pulseScale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value * pulseScale.value }],
  }));

  const disabled = isProcessing;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        bottom: bottomInset + 16,
        left: 0,
        right: 0,
        alignItems: "center",
      }}
    >
      <AnimatedPressable
        onPress={onPress}
        onPressIn={() => {
          scale.value = withSpring(0.92, { damping: 15, stiffness: 200 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 15, stiffness: 200 });
        }}
        disabled={disabled}
        style={[
          {
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: isRecording ? colors.error : colors.primary,
            alignItems: "center",
            justifyContent: "center",
            opacity: disabled ? 0.5 : 1,
            ...(isRecording ? shadows.sm : shadows.gold),
          },
          animatedStyle,
        ]}
      >
        <Ionicons
          name={isRecording ? "stop" : "mic"}
          size={isRecording ? 24 : 28}
          color={colors.white}
        />
      </AnimatedPressable>
    </View>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/rock/ai/projects/exec && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors in `RecordFAB.tsx`

- [ ] **Step 3: Commit**

```bash
git add components/RecordFAB.tsx
git commit -m "Add RecordFAB floating action button with recording pulse animation"
```

---

### Task 4: RecordingSheet component

**Files:**
- Create: `components/RecordingSheet.tsx`

- [ ] **Step 1: Create RecordingSheet component**

This is the bottom sheet with waveform, duration, and controls. It uses `react-native-reanimated` for the slide-up animation and `react-native-gesture-handler` for swipe-to-dismiss.

```tsx
// components/RecordingSheet.tsx
import { useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Waveform } from "./Waveform";
import { useColors } from "@/hooks/useThemeColors";
import { spacing, typography, radii, fontFamily } from "@/constants/Colors";

const SHEET_HEIGHT = 280;

interface RecordingSheetProps {
  isVisible: boolean;
  duration: number;
  metering: number;
  isRecording: boolean;
  isSaving: boolean;
  error: string | null;
  onDone: () => void;
  onDelete: () => void;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.0`;
}

export function RecordingSheet({
  isVisible,
  duration,
  metering,
  isRecording,
  isSaving,
  error,
  onDone,
  onDelete,
}: RecordingSheetProps) {
  const colors = useColors();
  const { width: screenWidth } = useWindowDimensions();
  const translateY = useSharedValue(SHEET_HEIGHT);
  const backdropOpacity = useSharedValue(0);

  // Pulsing recording dot
  const dotOpacity = useSharedValue(1);
  useEffect(() => {
    if (isRecording) {
      dotOpacity.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: 500, easing: Easing.out(Easing.exp) }),
          withTiming(1, { duration: 500, easing: Easing.out(Easing.exp) })
        ),
        -1,
        false
      );
    } else {
      dotOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [isRecording, dotOpacity]);

  // Slide in/out
  useEffect(() => {
    if (isVisible) {
      translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
      backdropOpacity.value = withTiming(1, { duration: 200 });
    } else {
      translateY.value = withSpring(SHEET_HEIGHT, { damping: 20, stiffness: 200 });
      backdropOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [isVisible, translateY, backdropOpacity]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const dotStyle = useAnimatedStyle(() => ({
    opacity: dotOpacity.value,
  }));

  // Swipe down gesture to dismiss (cancel recording)
  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (e.translationY > 80) {
        translateY.value = withSpring(SHEET_HEIGHT, { damping: 20, stiffness: 200 });
        backdropOpacity.value = withTiming(0, { duration: 200 });
        runOnJS(onDelete)();
      } else {
        translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
      }
    })
    .enabled(!isSaving);

  if (!isVisible) return null;

  const controlsDisabled = isSaving || !!error;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colors.overlay },
          backdropStyle,
        ]}
        pointerEvents="auto"
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={controlsDisabled ? undefined : onDelete} />
      </Animated.View>

      {/* Sheet */}
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            {
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: SHEET_HEIGHT,
              backgroundColor: colors.backgroundElevated,
              borderTopLeftRadius: radii.xl,
              borderTopRightRadius: radii.xl,
              paddingHorizontal: spacing.xl,
              paddingTop: spacing.md,
              paddingBottom: spacing.xl,
            },
            sheetStyle,
          ]}
        >
          {/* Drag handle */}
          <View style={{ alignItems: "center", marginBottom: spacing.lg }}>
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.textMuted,
              }}
            />
          </View>

          {error ? (
            /* Error state */
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
              <Text
                style={{
                  color: colors.error,
                  fontSize: typography.base,
                  fontFamily: fontFamily.medium,
                  textAlign: "center",
                }}
              >
                {error}
              </Text>
            </View>
          ) : isSaving ? (
            /* Transcribing state */
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.md }}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: typography.base,
                  fontFamily: fontFamily.medium,
                }}
              >
                Transcribing...
              </Text>
            </View>
          ) : (
            /* Recording state */
            <>
              {/* Recording indicator + duration */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: spacing.md,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <Animated.View
                    style={[
                      {
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: colors.error,
                      },
                      dotStyle,
                    ]}
                  />
                  <Text
                    style={{
                      color: colors.textPrimary,
                      fontSize: typography.sm,
                      fontFamily: fontFamily.medium,
                    }}
                  >
                    Recording
                  </Text>
                </View>
                <Text
                  style={{
                    color: colors.textPrimary,
                    fontSize: typography.lg,
                    fontFamily: fontFamily.light,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {formatDuration(duration)}
                </Text>
              </View>

              {/* Waveform */}
              <View style={{ flex: 1, justifyContent: "center" }}>
                <Waveform
                  metering={metering}
                  isActive={isRecording}
                  height={100}
                  color={colors.primary}
                />
              </View>

              {/* Controls */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingTop: spacing.md,
                }}
              >
                <Pressable onPress={onDelete} hitSlop={12}>
                  <Text
                    style={{
                      color: colors.error,
                      fontSize: typography.lg,
                      fontFamily: fontFamily.medium,
                    }}
                  >
                    Delete
                  </Text>
                </Pressable>
                <Pressable onPress={onDone} hitSlop={12}>
                  <Text
                    style={{
                      color: colors.primary,
                      fontSize: typography.lg,
                      fontFamily: fontFamily.medium,
                    }}
                  >
                    Done
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/rock/ai/projects/exec && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors in `RecordingSheet.tsx`

- [ ] **Step 3: Commit**

```bash
git add components/RecordingSheet.tsx
git commit -m "Add RecordingSheet bottom sheet with waveform, transcribing state, and swipe-to-dismiss"
```

---

### Task 5: Rewrite HomeScreen layout

**Files:**
- Modify: `app/index.tsx`

This is the main integration task. The HomeScreen needs to:
1. Use two InstantDB queries (recent + active) and merge them
2. Split tasks into `activeTasks` and `historyTasks`
3. Render fixed active section + scrollable history
4. Wire up RecordFAB and RecordingSheet instead of the inline button + full-screen overlay
5. Fix `cancelRecording` to reset iOS audio mode
6. Add `isProcessing` guard and `recordingRef` null check
7. Keep the detail modal entirely unchanged

- [ ] **Step 1: Rewrite the HomeScreen**

Replace the entire content of `app/index.tsx`. The file is large, so here's the complete structure with all sections. Key changes are marked with `// NEW` comments.

**Important:** The detail modal (lines ~998-1443 in current file) stays EXACTLY the same. Copy it verbatim. The changes are:
- Remove `LiveActivityFeed`, `RunningLabel` components (moved to detail modal only — they already live there)
- Remove inline record button and `showOverlay` / `RecordingOverlay` usage
- Add dual-query logic
- Add task splitting
- Replace rendering with new components
- Fix recording guards

The full replacement for `app/index.tsx`:

Keep all existing imports, plus add:
```tsx
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActiveTaskCard } from "@/components/ActiveTaskCard";
import { TaskListItem } from "@/components/TaskListItem";
import { RecordFAB } from "@/components/RecordFAB";
import { RecordingSheet } from "@/components/RecordingSheet";
```

Remove these imports (no longer used in HomeScreen):
```tsx
// Remove: import { RecordingOverlay } from "@/components/RecordingOverlay";
```

**Query changes** — replace the single `db.useQuery` with two queries:

```tsx
// NEW: Two queries — recent for history, active to catch old running tasks
const { data: recentData, isLoading: isLoadingRecent } = db.useQuery({
  tasks: {
    $: { order: { createdAt: "desc" }, limit: 50 },
    messages: {},
  },
});

const { data: activeData, isLoading: isLoadingActive } = db.useQuery({
  tasks: {
    $: {
      where: {
        or: [{ status: "running" }, { status: "pending" }],
      },
    },
    messages: {},
  },
});

const isLoading = isLoadingRecent || isLoadingActive;

// NEW: Merge and deduplicate (active query wins on conflict)
const allTasks = (() => {
  const recentTasks = recentData?.tasks ?? [];
  const activeTasks = activeData?.tasks ?? [];
  const taskMap = new Map<string, Task>();
  for (const t of recentTasks) taskMap.set(t.id, t);
  for (const t of activeTasks) taskMap.set(t.id, t); // active wins
  return Array.from(taskMap.values());
})();

// NEW: Split into active + history
const activeTasks = allTasks
  .filter((t) => t.status === "running" || t.status === "pending")
  .sort((a, b) => {
    if (a.status === "running" && b.status !== "running") return -1;
    if (b.status === "running" && a.status !== "running") return 1;
    return b.createdAt - a.createdAt;
  })
  .slice(0, 3);

const allActiveIds = new Set(
  allTasks.filter((t) => t.status === "running" || t.status === "pending").map((t) => t.id)
);
const historyTasks = allTasks
  .filter((t) => !allActiveIds.has(t.id))
  .sort((a, b) => b.createdAt - a.createdAt);
```

**Add recording guards** — add `isProcessing` state and `recordingError`:

```tsx
const [isProcessing, setIsProcessing] = useState(false);
const [recordingError, setRecordingError] = useState<string | null>(null);
```

**Fix startRecording** — add reentrancy guard:

```tsx
const startRecording = useCallback(async () => {
  if (hasPermission === false || recordingRef.current || isProcessing) return;
  setRecordingError(null);
  try {
    await configureAudioMode();
    const METERING_OPTIONS: Audio.RecordingOptions = {
      ...RECORDING_OPTIONS,
      isMeteringEnabled: true,
    };
    const { recording } = await Audio.Recording.createAsync(METERING_OPTIONS);
    recordingRef.current = recording;
    setIsRecording(true);
    setDuration(0);
    setMetering(-160);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    durationIntervalRef.current = setInterval(() => {
      setDuration((d) => d + 1);
    }, 1000);

    meteringIntervalRef.current = setInterval(async () => {
      if (recordingRef.current) {
        try {
          const status = await recordingRef.current.getStatusAsync();
          if (status.isRecording && status.metering !== undefined) {
            setMetering(status.metering);
          }
        } catch {}
      }
    }, 100);
  } catch (error) {
    console.error("Failed to start recording:", error);
  }
}, [hasPermission, isProcessing]);
```

**Fix cancelRecording** — add iOS audio mode reset:

```tsx
const cancelRecording = useCallback(async () => {
  if (durationIntervalRef.current) {
    clearInterval(durationIntervalRef.current);
    durationIntervalRef.current = null;
  }
  if (meteringIntervalRef.current) {
    clearInterval(meteringIntervalRef.current);
    meteringIntervalRef.current = null;
  }
  if (recordingRef.current) {
    try {
      await recordingRef.current.stopAndUnloadAsync();
    } catch {}
  }
  recordingRef.current = null;
  // NEW: Reset iOS audio mode (was missing before)
  await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
  setIsRecording(false);
  setDuration(0);
  setMetering(-160);
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
}, []);
```

**Fix stopRecording** — add isProcessing flag and error handling:

```tsx
const stopRecording = useCallback(async () => {
  const recording = recordingRef.current;
  if (!recording) return;
  recordingRef.current = null;

  setIsSaving(true);
  setIsProcessing(true);
  setIsRecording(false);

  if (durationIntervalRef.current) {
    clearInterval(durationIntervalRef.current);
    durationIntervalRef.current = null;
  }
  if (meteringIntervalRef.current) {
    clearInterval(meteringIntervalRef.current);
    meteringIntervalRef.current = null;
  }

  try {
    const status = await recording.getStatusAsync();
    if (status.canRecord) {
      await recording.stopAndUnloadAsync();
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

    const tempId = id();
    const { filePath } = await saveRecordingLocally(recording, tempId);

    const transcription = await transcribeAudio(filePath);
    if (!transcription || transcription.trim().length === 0) {
      // NEW: Show error in sheet
      setRecordingError("No speech detected");
      setTimeout(() => {
        setIsSaving(false);
        setIsProcessing(false);
        setRecordingError(null);
        setDuration(0);
        setMetering(-160);
      }, 1500);
      return;
    }

    const taskId = id();
    const messageId = id();
    const now = Date.now();
    const trimmedInput = transcription.trim();

    await db.transact([
      db.tx.tasks[taskId].update({
        input: trimmedInput,
        status: "pending",
        source: "phone",
        createdAt: now,
      }),
      db.tx.messages[messageId]
        .update({
          role: "user",
          content: trimmedInput,
          createdAt: now,
        })
        .link({ task: taskId }),
    ]);

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    summarizeInput(trimmedInput).then((summary) => {
      if (summary) {
        db.transact(db.tx.tasks[taskId].update({ summary }));
      }
    });
  } catch (error) {
    console.error("Failed to save recording:", error);
    setRecordingError("Transcription failed");
    setTimeout(() => {
      setRecordingError(null);
    }, 1500);
  }

  setIsSaving(false);
  setIsProcessing(false);
  setDuration(0);
  setMetering(-160);
}, []);
```

**Remove** the `pauseRecording` and `resumeRecording` callbacks (no longer needed — sheet has no pause).

**Remove** `isPaused` state (no longer used).

**New render** — replace the return JSX. Keep `GestureHandlerRootView` and `SafeAreaView` wrapper. Replace everything inside:

```tsx
const insets = useSafeAreaInsets();
const isActive = isRecording || isSaving;

// Cancel task handler (moved from detail modal — keep for ActiveTaskCard too)
const cancelTask = useCallback(async (taskId: string) => {
  try {
    await db.transact(db.tx.tasks[taskId].update({ cancelRequested: true }));
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch (error) {
    console.error("Failed to cancel task:", error);
  }
}, []);

return (
  <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["top"]}
    >
      {/* Header */}
      <View
        style={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.md,
          paddingBottom: spacing.lg,
        }}
      >
        <Text
          style={{
            fontSize: typography.xxl,
            fontFamily: fontFamily.bold,
            color: colors.textPrimary,
            letterSpacing: typography.tracking.tight,
          }}
        >
          Exec
        </Text>
      </View>

      {/* Active Tasks (fixed, non-scrolling) */}
      {activeTasks.length > 0 && (
        <View
          style={{
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.md,
            gap: spacing.sm,
          }}
        >
          {activeTasks.map((task) => (
            <ActiveTaskCard
              key={task.id}
              title={task.summary || task.input}
              status={task.status as "running" | "pending"}
              startedAt={(task as any).startedAt}
              createdAt={task.createdAt}
              cancelRequested={(task as any).cancelRequested}
              onView={() => {
                setSelectedTask(task);
                setFollowUpText("");
              }}
              onCancel={() => cancelTask(task.id)}
            />
          ))}
        </View>
      )}

      {/* History list */}
      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : historyTasks.length === 0 && activeTasks.length === 0 ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: spacing.xxl,
          }}
        >
          <Text
            style={{
              color: colors.textTertiary,
              fontSize: typography.base,
              fontFamily: fontFamily.regular,
              textAlign: "center",
              lineHeight: 22,
            }}
          >
            No tasks yet. Tap the mic to get started.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={scrollRef}
          data={historyTasks}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TaskListItem
              title={item.summary || item.input}
              status={item.status as "done" | "failed" | "cancelled"}
              createdAt={item.createdAt}
              onPress={() => {
                setSelectedTask(item);
                setFollowUpText("");
              }}
            />
          )}
          ListHeaderComponent={
            historyTasks.length > 0 ? (
              <Text
                style={{
                  color: colors.textTertiary,
                  fontSize: typography.xs,
                  fontFamily: fontFamily.semibold,
                  textTransform: "uppercase",
                  letterSpacing: typography.tracking.wider,
                  marginBottom: spacing.sm,
                  paddingHorizontal: spacing.lg,
                }}
              >
                Recent
              </Text>
            ) : null
          }
          contentContainerStyle={{
            paddingTop: spacing.sm,
            paddingBottom: insets.bottom + 64 + 32,
          }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* FAB */}
      <RecordFAB
        isRecording={isRecording}
        isProcessing={isProcessing}
        bottomInset={insets.bottom}
        onPress={() => {
          if (isRecording) {
            stopRecording();
          } else {
            startRecording();
          }
        }}
      />

      {/* Recording bottom sheet */}
      <RecordingSheet
        isVisible={isActive}
        duration={duration}
        metering={metering}
        isRecording={isRecording}
        isSaving={isSaving}
        error={recordingError}
        onDone={stopRecording}
        onDelete={cancelRecording}
      />

      {/* Detail modal — UNCHANGED from current implementation */}
      {/* Keep the entire <Modal> block exactly as-is from the current file */}

    </SafeAreaView>
  </GestureHandlerRootView>
);
```

**For the detail modal:** Copy the entire `<Modal>` block (current lines 998-1439) verbatim into the new render. Changes needed inside the modal:
1. Update the cancel button's `onPress` from `onPress={cancelTask}` to `onPress={() => cancelTask(selectedTask.id)}`
2. Keep the `selectedTask.cancelRequested` check and "Cancelling..." display as-is
3. Everything else (messages list, follow-up input, markdown rendering) stays identical

- [ ] **Step 2: Remove unused code**

Delete these from the file since they're no longer needed in the HomeScreen:
- `isPaused` state
- `pauseRecording` callback
- `resumeRecording` callback  
- The `showOverlay` computed value
- The `RecordingOverlay` import and usage
- The inline record button JSX
- The old single-list `renderTask` function

Keep `LiveActivityFeed` and `RunningLabel` — they're still used inside the detail modal.

- [ ] **Step 3: Verify it compiles**

Run: `cd /Users/rock/ai/projects/exec && npx tsc --noEmit --pretty 2>&1 | head -40`
Expected: No type errors

- [ ] **Step 4: Test on device**

Run: `cd /Users/rock/ai/projects/exec && pnpm start`

Verify:
1. App loads with header + empty state (or active cards if tasks exist)
2. FAB is visible at bottom center with gold background
3. Tapping FAB starts recording, bottom sheet slides up
4. Waveform animates during recording
5. "Done" shows transcribing spinner, then creates task
6. "Delete" cancels and dismisses sheet
7. Active tasks appear as cards at top
8. History shows as compact rows below
9. Tapping any task opens the detail modal (unchanged)
10. Swipe down on sheet dismisses it

- [ ] **Step 5: Commit**

```bash
git add app/index.tsx
git commit -m "Rewrite HomeScreen as command center with active tasks, history list, FAB, and recording sheet"
```

---

### Task 6: Cleanup and final verification

**Files:**
- Modify: `app/index.tsx` (if any issues from Task 5)

- [ ] **Step 1: Run full type check**

Run: `cd /Users/rock/ai/projects/exec && npx tsc --noEmit --pretty 2>&1`
Fix any remaining type errors.

- [ ] **Step 2: Verify no unused imports**

Check that `RecordingOverlay` import is removed from `app/index.tsx`. The component file itself (`components/RecordingOverlay.tsx`) stays — it's just not imported anymore.

- [ ] **Step 3: Push OTA update**

Run: `cd /Users/rock/ai/projects/exec && pnpm update:preview "Redesign home screen as command center with active tasks, FAB, and recording sheet"`

- [ ] **Step 4: Commit any final fixes**

```bash
git add -p  # Review each change
git commit -m "Final cleanup for home screen redesign"
```
