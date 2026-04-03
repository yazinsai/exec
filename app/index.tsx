import { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Markdown from "react-native-markdown-display";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { id } from "@instantdb/react-native";
import { db } from "@/lib/db";
import { transcribeAudio } from "@/lib/transcription";
import { summarizeInput } from "@/lib/summarize";
import {
  requestAudioPermissions,
  configureAudioMode,
  saveRecordingLocally,
  RECORDING_OPTIONS,
} from "@/lib/audio";
import { Audio } from "expo-av";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActiveTaskCard } from "@/components/ActiveTaskCard";
import { TaskListItem } from "@/components/TaskListItem";
import { RecordFAB } from "@/components/RecordFAB";
import { RecordingSheet } from "@/components/RecordingSheet";
import { useThemeColors } from "@/hooks/useThemeColors";
import {
  spacing,
  typography,
  radii,
  fontFamily,
  shadows,
} from "@/constants/Colors";
import type { InstaQLEntity } from "@instantdb/react-native";
import type { AppSchema } from "@/instant.schema";
import type { ThemeColors } from "@/constants/Colors";

type Task = InstaQLEntity<AppSchema, "tasks", { messages: {} }>;
type Message = InstaQLEntity<AppSchema, "messages">;

type TaskStatus = "pending" | "running" | "done" | "failed" | "cancelled";

function getStatusColor(status: string, colors: ThemeColors): string {
  const map: Record<string, string> = {
    pending: colors.statusPending,
    running: colors.statusRunning,
    done: colors.statusDone,
    failed: colors.statusFailed,
    cancelled: colors.statusCancelled,
  };
  return map[status] ?? colors.statusPending;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  running: "Running",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

// Tool icon mapping
const TOOL_ICONS: Record<string, { icon: string; label: string }> = {
  Read: { icon: "document-text-outline", label: "Reading" },
  Write: { icon: "create-outline", label: "Writing" },
  Edit: { icon: "pencil-outline", label: "Editing" },
  Glob: { icon: "search-outline", label: "Finding files" },
  Grep: { icon: "code-slash-outline", label: "Searching" },
  Bash: { icon: "terminal-outline", label: "Running" },
  Agent: { icon: "git-branch-outline", label: "Subagent" },
  WebSearch: { icon: "globe-outline", label: "Searching web" },
  WebFetch: { icon: "cloud-download-outline", label: "Fetching" },
  Skill: { icon: "flash-outline", label: "Using skill" },
};

type ActivityItem = {
  type: "tool" | "text" | "thinking";
  name?: string;
  detail?: string;
  content?: string;
  ts: number;
};

function LiveActivityFeed({
  liveOutput,
  colors,
}: {
  liveOutput: string;
  colors: ThemeColors;
}) {
  let items: ActivityItem[] = [];
  try {
    items = JSON.parse(liveOutput);
  } catch {
    // Fallback for plain text liveOutput (backward compat)
    return (
      <View
        style={{
          backgroundColor: colors.backgroundElevated,
          borderRadius: radii.md,
          padding: spacing.md,
          marginBottom: spacing.lg,
          borderLeftWidth: 3,
          borderLeftColor: colors.statusRunning,
        }}
      >
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: typography.sm,
            fontFamily: fontFamily.mono,
            lineHeight: 20,
          }}
        >
          {liveOutput}
        </Text>
      </View>
    );
  }

  if (!Array.isArray(items) || items.length === 0) return null;

  // Show last 8 items, most recent at bottom
  const visible = items.slice(-8);

  return (
    <View
      style={{
        marginBottom: spacing.lg,
        gap: 6,
      }}
    >
      {/* Activity header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.xs,
          marginBottom: 4,
        }}
      >
        <ActivityIndicator size="small" color={colors.statusRunning} />
        <Text
          style={{
            color: colors.statusRunning,
            fontSize: typography.xs,
            fontFamily: fontFamily.semibold,
            textTransform: "uppercase",
            letterSpacing: typography.tracking.wider,
          }}
        >
          Working
        </Text>
      </View>

      {visible.map((item, i) => {
        const isLatest = i === visible.length - 1;
        const opacity = isLatest ? 1 : 0.5 + (i / visible.length) * 0.5;

        if (item.type === "tool") {
          const toolInfo = TOOL_ICONS[item.name || ""] || {
            icon: "ellipsis-horizontal-outline",
            label: item.name || "Tool",
          };
          return (
            <View
              key={`${item.ts}-${i}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
                opacity,
                paddingVertical: 3,
              }}
            >
              <Ionicons
                name={toolInfo.icon as any}
                size={14}
                color={isLatest ? colors.statusRunning : colors.textTertiary}
              />
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  color: isLatest ? colors.textPrimary : colors.textSecondary,
                  fontSize: typography.sm,
                  fontFamily: isLatest ? fontFamily.medium : fontFamily.regular,
                  lineHeight: 18,
                }}
              >
                <Text style={{ color: isLatest ? colors.statusRunning : colors.textTertiary }}>
                  {toolInfo.label}
                </Text>
                {item.detail ? (
                  <Text style={{ color: isLatest ? colors.textSecondary : colors.textTertiary }}>
                    {"  "}
                    {item.detail}
                  </Text>
                ) : null}
              </Text>
            </View>
          );
        }

        if (item.type === "thinking") {
          return (
            <View
              key={`${item.ts}-${i}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
                opacity,
                paddingVertical: 3,
              }}
            >
              <Ionicons
                name="bulb-outline"
                size={14}
                color={isLatest ? colors.thinking : colors.textTertiary}
              />
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  color: isLatest ? colors.textSecondary : colors.textTertiary,
                  fontSize: typography.sm,
                  fontFamily: fontFamily.regular,
                  fontStyle: "italic",
                  lineHeight: 18,
                }}
              >
                {item.content}
              </Text>
            </View>
          );
        }

        // text type
        return (
          <View
            key={`${item.ts}-${i}`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.sm,
              opacity,
              paddingVertical: 3,
            }}
          >
            <Ionicons
              name="chatbubble-outline"
              size={14}
              color={isLatest ? colors.textSecondary : colors.textTertiary}
            />
            <Text
              numberOfLines={2}
              style={{
                flex: 1,
                color: isLatest ? colors.textSecondary : colors.textTertiary,
                fontSize: typography.sm,
                fontFamily: fontFamily.regular,
                lineHeight: 18,
              }}
            >
              {item.content}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function RunningLabel({
  liveOutput,
  colors,
}: {
  liveOutput?: string | null;
  colors: ThemeColors;
}) {
  let label = "Running";

  if (liveOutput) {
    try {
      const items: ActivityItem[] = JSON.parse(liveOutput);
      if (Array.isArray(items) && items.length > 0) {
        const last = items[items.length - 1];
        if (last.type === "tool" && last.name) {
          const toolInfo = TOOL_ICONS[last.name];
          label = toolInfo ? toolInfo.label : last.name;
          if (last.detail) {
            // Show truncated detail
            const short = last.detail.length > 25
              ? last.detail.slice(0, 25) + "..."
              : last.detail;
            label += ` ${short}`;
          }
        } else if (last.type === "thinking") {
          label = "Thinking...";
        }
      }
    } catch {
      // plain text fallback
    }
  }

  return (
    <Text
      numberOfLines={1}
      style={{
        color: colors.statusRunning,
        fontSize: typography.xs,
        fontFamily: fontFamily.medium,
        letterSpacing: 0.3,
        flexShrink: 1,
      }}
    >
      {label}
    </Text>
  );
}

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

export default function HomeScreen() {
  const { colors, isDark } = useThemeColors();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [followUpText, setFollowUpText] = useState("");
  const [sendingFollowUp, setSendingFollowUp] = useState(false);
  const [isRecordingFollowUp, setIsRecordingFollowUp] = useState(false);
  const [isTranscribingFollowUp, setIsTranscribingFollowUp] = useState(false);
  const followUpRecordingRef = useRef<Audio.Recording | null>(null);

  const insets = useSafeAreaInsets();

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [metering, setMetering] = useState(-160);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const meteringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<FlatList>(null);
  const modalListRef = useRef<FlatList>(null);
  const [showJumpToEnd, setShowJumpToEnd] = useState(false);

  const isActive = isRecording || isSaving;

  // Check permission on mount
  useEffect(() => {
    requestAudioPermissions().then(setHasPermission);
  }, []);

  // Cleanup intervals
  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
      if (meteringIntervalRef.current) clearInterval(meteringIntervalRef.current);
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, []);

  // Query tasks
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

  // Merge and deduplicate (active query wins on conflict)
  const allTasks = (() => {
    const recentTasks = recentData?.tasks ?? [];
    const activeTsks = activeData?.tasks ?? [];
    const taskMap = new Map<string, Task>();
    for (const t of recentTasks) taskMap.set(t.id, t);
    for (const t of activeTsks) taskMap.set(t.id, t);
    return Array.from(taskMap.values());
  })();

  // Split into active + history
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

  // Keep selectedTask in sync with live data
  useEffect(() => {
    if (selectedTask) {
      const updated = allTasks.find((t) => t.id === selectedTask.id);
      if (updated) {
        setSelectedTask(updated);
      }
    }
  }, [allTasks]);

  // Recording handlers
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
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    }
    recordingRef.current = null;
    setIsRecording(false);
    setDuration(0);
    setMetering(-160);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, []);

  const stopRecording = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) return;
    recordingRef.current = null;

    setIsSaving(true);
    setIsRecording(false);
    setIsProcessing(true);

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

      // Transcribe
      const transcription = await transcribeAudio(filePath);
      if (!transcription || transcription.trim().length === 0) {
        setRecordingError("No speech detected");
        setTimeout(() => setRecordingError(null), 1500);
        setIsSaving(false);
        setIsProcessing(false);
        setDuration(0);
        setMetering(-160);
        return;
      }

      // Create task + first message in InstantDB
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

      // Generate summary in background (non-blocking)
      summarizeInput(trimmedInput).then((summary) => {
        if (summary) {
          db.transact(db.tx.tasks[taskId].update({ summary }));
        }
      });
    } catch (error) {
      console.error("Failed to save recording:", error);
      setRecordingError("Transcription failed");
      setTimeout(() => setRecordingError(null), 1500);
    }

    setIsSaving(false);
    setIsProcessing(false);
    setDuration(0);
    setMetering(-160);
  }, []);

  // Follow-up message handler
  const sendFollowUp = useCallback(async () => {
    if (!selectedTask || !followUpText.trim()) return;
    setSendingFollowUp(true);
    try {
      const messageId = id();
      await db.transact([
        db.tx.messages[messageId]
          .update({
            role: "user",
            content: followUpText.trim(),
            createdAt: Date.now(),
          })
          .link({ task: selectedTask.id }),
      ]);
      setFollowUpText("");
      Keyboard.dismiss();
    } catch (error) {
      console.error("Failed to send follow-up:", error);
    }
    setSendingFollowUp(false);
  }, [selectedTask, followUpText]);

  // Voice follow-up recording
  const toggleFollowUpRecording = useCallback(async () => {
    if (isRecordingFollowUp) {
      // Stop recording and transcribe
      const recording = followUpRecordingRef.current;
      if (!recording) return;
      followUpRecordingRef.current = null;
      setIsRecordingFollowUp(false);
      setIsTranscribingFollowUp(true);

      try {
        const status = await recording.getStatusAsync();
        if (status.canRecord) {
          await recording.stopAndUnloadAsync();
        }
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

        const tempId = id();
        const { filePath } = await saveRecordingLocally(recording, tempId);
        const transcription = await transcribeAudio(filePath);
        if (transcription.trim()) {
          setFollowUpText((prev) => (prev ? prev + " " + transcription.trim() : transcription.trim()));
        }
      } catch (error) {
        console.error("Failed to transcribe follow-up:", error);
      }
      setIsTranscribingFollowUp(false);
    } else {
      // Start recording
      if (hasPermission === false) return;
      try {
        await configureAudioMode();
        const { recording } = await Audio.Recording.createAsync(RECORDING_OPTIONS);
        followUpRecordingRef.current = recording;
        setIsRecordingFollowUp(true);
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (error) {
        console.error("Failed to start follow-up recording:", error);
      }
    }
  }, [isRecordingFollowUp, hasPermission]);

  // Cancel task handler
  const cancelTask = useCallback(async (taskId: string) => {
    try {
      await db.transact(
        db.tx.tasks[taskId].update({ cancelRequested: true })
      );
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch (error) {
      console.error("Failed to cancel task:", error);
    }
  }, []);

  // Markdown styles
  const mdStyles = {
    body: {
      color: colors.textPrimary,
      fontSize: typography.base,
      fontFamily: fontFamily.regular,
      lineHeight: 22,
    },
    heading1: {
      color: colors.textPrimary,
      fontSize: typography.xl,
      fontFamily: fontFamily.bold,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    heading2: {
      color: colors.textPrimary,
      fontSize: typography.lg,
      fontFamily: fontFamily.semibold,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    heading3: {
      color: colors.textPrimary,
      fontSize: typography.md,
      fontFamily: fontFamily.semibold,
      marginTop: spacing.md,
      marginBottom: spacing.xs,
    },
    code_inline: {
      backgroundColor: colors.backgroundElevated,
      color: colors.primaryLight,
      fontFamily: fontFamily.mono,
      fontSize: typography.sm,
      paddingHorizontal: 4,
      borderRadius: radii.xs,
    },
    code_block: {
      backgroundColor: colors.backgroundElevated,
      padding: spacing.md,
      borderRadius: radii.md,
      fontFamily: fontFamily.mono,
      fontSize: typography.sm,
      color: colors.textSecondary,
    },
    fence: {
      backgroundColor: colors.backgroundElevated,
      padding: spacing.md,
      borderRadius: radii.md,
      fontFamily: fontFamily.mono,
      fontSize: typography.sm,
      color: colors.textSecondary,
    },
    pre: {
      backgroundColor: colors.backgroundElevated,
      borderRadius: radii.md,
    },
    link: {
      color: colors.primary,
    },
    blockquote: {
      backgroundColor: colors.backgroundElevated,
      borderLeftColor: colors.primary,
      borderLeftWidth: 3,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.xs,
    },
    bullet_list_icon: {
      color: colors.textTertiary,
    },
    ordered_list_icon: {
      color: colors.textTertiary,
    },
    list_item: {
      marginBottom: spacing.xs,
    },
    hr: {
      backgroundColor: colors.border,
    },
  };

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
              paddingHorizontal: spacing.xl,
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
                  setShowJumpToEnd(false);
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
                  setShowJumpToEnd(false);
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
                  }}
                >
                  Recent
                </Text>
              ) : null
            }
            contentContainerStyle={{
              paddingTop: spacing.sm,
              paddingHorizontal: spacing.xl,
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

        {/* Task detail bottom sheet (Modal) */}
        <Modal
          visible={!!selectedTask}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => {
            if (followUpRecordingRef.current) {
              followUpRecordingRef.current.stopAndUnloadAsync().catch(() => {});
              followUpRecordingRef.current = null;
              setIsRecordingFollowUp(false);
              setIsTranscribingFollowUp(false);
            }
            setSelectedTask(null);
          }}
        >
          <KeyboardAvoidingView
            style={{ flex: 1, backgroundColor: colors.background }}
            behavior="padding"
          >
            {selectedTask && (
              <>
                {/* Modal header */}
                <SafeAreaView edges={["top"]}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingHorizontal: spacing.xl,
                      paddingVertical: spacing.md,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <View
                      accessibilityLabel={`Status: ${STATUS_LABELS[selectedTask.status] ?? "Pending"}`}
                      style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
                    >
                      <View
                        accessibilityElementsHidden
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 5,
                          backgroundColor: getStatusColor(selectedTask.status, colors),
                        }}
                      />
                      <Text
                        style={{
                          fontSize: typography.xs,
                          fontFamily: fontFamily.semibold,
                          color: getStatusColor(selectedTask.status, colors),
                          textTransform: "uppercase",
                          letterSpacing: typography.tracking.wider,
                        }}
                      >
                        {selectedTask.status}
                      </Text>
                    </View>

                    <Pressable
                      onPress={() => {
                        if (followUpRecordingRef.current) {
                          followUpRecordingRef.current.stopAndUnloadAsync().catch(() => {});
                          followUpRecordingRef.current = null;
                          setIsRecordingFollowUp(false);
                          setIsTranscribingFollowUp(false);
                        }
                        setSelectedTask(null);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Close task details"
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="close" size={24} color={colors.textSecondary} />
                    </Pressable>
                  </View>
                </SafeAreaView>

                {/* Scrollable content */}
                <FlatList
                  ref={modalListRef}
                  data={[...(selectedTask.messages ?? [])].sort((a, b) => a.createdAt - b.createdAt)}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={{
                    padding: spacing.xl,
                    paddingBottom: 100,
                  }}
                  showsVerticalScrollIndicator={false}
                  onScroll={(e) => {
                    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                    const distanceFromEnd = contentSize.height - layoutMeasurement.height - contentOffset.y;
                    setShowJumpToEnd(distanceFromEnd > 300);
                  }}
                  scrollEventThrottle={100}
                  ListHeaderComponent={
                    <>
                      {/* Task input */}
                      <Text
                        style={{
                          color: colors.textPrimary,
                          fontSize: typography.lg,
                          fontFamily: fontFamily.medium,
                          lineHeight: 26,
                          marginBottom: spacing.xs,
                        }}
                      >
                        {selectedTask.summary || selectedTask.input}
                      </Text>
                      <Text
                        style={{
                          color: colors.textTertiary,
                          fontSize: typography.xs,
                          fontFamily: fontFamily.regular,
                          marginBottom: spacing.lg,
                        }}
                      >
                        {relativeTime(selectedTask.createdAt)}
                      </Text>

                      {/* Error message */}
                      {selectedTask.errorMessage && (
                        <View
                          style={{
                            backgroundColor: colors.errorBgAlpha,
                            borderRadius: radii.md,
                            padding: spacing.md,
                            marginBottom: spacing.lg,
                          }}
                        >
                          <Text
                            style={{
                              color: colors.error,
                              fontSize: typography.sm,
                              fontFamily: fontFamily.regular,
                            }}
                          >
                            {selectedTask.errorMessage}
                          </Text>
                        </View>
                      )}

                      {/* Live activity feed (while running) */}
                      {selectedTask.status === "running" && selectedTask.liveOutput && (
                        <LiveActivityFeed
                          liveOutput={selectedTask.liveOutput}
                          colors={colors}
                        />
                      )}

                      {/* Cancel button */}
                      {selectedTask.status === "running" && !selectedTask.cancelRequested && (
                        <Pressable
                          onPress={() => cancelTask(selectedTask.id)}
                          accessibilityRole="button"
                          accessibilityLabel="Cancel task"
                          style={{
                            alignSelf: "flex-start",
                            flexDirection: "row",
                            alignItems: "center",
                            gap: spacing.xs,
                            paddingHorizontal: spacing.md,
                            paddingVertical: spacing.sm,
                            backgroundColor: colors.errorBgAlpha,
                            borderRadius: radii.md,
                            marginBottom: spacing.xl,
                          }}
                        >
                          <Ionicons name="close-circle-outline" size={16} color={colors.error} />
                          <Text
                            style={{
                              color: colors.error,
                              fontSize: typography.sm,
                              fontFamily: fontFamily.medium,
                            }}
                          >
                            Cancel
                          </Text>
                        </Pressable>
                      )}

                      {selectedTask.cancelRequested && selectedTask.status === "running" && (
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: spacing.sm,
                            marginBottom: spacing.xl,
                          }}
                        >
                          <ActivityIndicator size="small" color={colors.warning} />
                          <Text
                            style={{
                              color: colors.warning,
                              fontSize: typography.sm,
                              fontFamily: fontFamily.regular,
                            }}
                          >
                            Cancelling...
                          </Text>
                        </View>
                      )}

                      {/* Divider before thread */}
                      {((selectedTask.messages?.length ?? 0) > 0 || selectedTask.result) && (
                        <View
                          style={{
                            borderTopWidth: 1,
                            borderTopColor: colors.border,
                            paddingTop: spacing.lg,
                            marginBottom: spacing.md,
                          }}
                        />
                      )}
                    </>
                  }
                  ListFooterComponent={
                    selectedTask.result ? (
                      <View style={{ marginTop: spacing.md }}>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: spacing.sm,
                            marginBottom: spacing.sm,
                          }}
                        >
                          <Ionicons name="checkmark-circle" size={14} color={colors.statusDone} />
                          <Text
                            style={{
                              color: colors.textTertiary,
                              fontSize: typography.xs,
                              fontFamily: fontFamily.semibold,
                              textTransform: "uppercase",
                              letterSpacing: typography.tracking.label,
                            }}
                          >
                            Result
                          </Text>
                        </View>
                        <Markdown style={mdStyles}>
                          {selectedTask.result}
                        </Markdown>
                      </View>
                    ) : null
                  }
                  renderItem={({ item: msg }: { item: Message }) => {
                    const isUser = msg.role === "user";
                    return (
                      <View
                        style={{
                          alignSelf: isUser ? "flex-end" : "flex-start",
                          maxWidth: "85%",
                          marginBottom: spacing.sm,
                        }}
                      >
                        <View
                          style={{
                            backgroundColor: isUser
                              ? colors.primaryAlpha20
                              : colors.backgroundElevated,
                            borderRadius: radii.lg,
                            paddingHorizontal: spacing.md,
                            paddingVertical: spacing.sm,
                            borderWidth: 1,
                            borderColor: isUser
                              ? colors.primaryAlpha30
                              : colors.borderLight,
                          }}
                        >
                          {isUser ? (
                            <Text
                              style={{
                                color: colors.textPrimary,
                                fontSize: typography.base,
                                fontFamily: fontFamily.regular,
                                lineHeight: 20,
                              }}
                            >
                              {msg.content}
                            </Text>
                          ) : (
                            <Markdown
                              style={{
                                body: {
                                  color: colors.textPrimary,
                                  fontSize: typography.base,
                                  fontFamily: fontFamily.regular,
                                  lineHeight: 20,
                                },
                                strong: { fontFamily: fontFamily.bold },
                                code_inline: {
                                  backgroundColor: colors.backgroundElevated,
                                  color: colors.primary,
                                  fontFamily: "SpaceMono",
                                  fontSize: typography.sm,
                                  paddingHorizontal: 4,
                                  borderRadius: 4,
                                },
                                code_block: {
                                  backgroundColor: colors.backgroundElevated,
                                  padding: spacing.md,
                                  borderRadius: radii.md,
                                  fontFamily: fontFamily.mono,
                                  fontSize: typography.sm,
                                  color: colors.textSecondary,
                                },
                                fence: {
                                  backgroundColor: colors.backgroundElevated,
                                  padding: spacing.md,
                                  borderRadius: radii.md,
                                  fontFamily: fontFamily.mono,
                                  fontSize: typography.sm,
                                  color: colors.textSecondary,
                                },
                                pre: {
                                  backgroundColor: colors.backgroundElevated,
                                  borderRadius: radii.md,
                                },
                                table: { borderColor: colors.borderLight },
                                th: { borderColor: colors.borderLight, padding: 6 },
                                td: { borderColor: colors.borderLight, padding: 6 },
                              }}
                            >
                              {msg.content}
                            </Markdown>
                          )}
                        </View>
                        <Text
                          style={{
                            color: colors.textMuted,
                            fontSize: 10,
                            fontFamily: fontFamily.regular,
                            marginTop: 2,
                            alignSelf: isUser ? "flex-end" : "flex-start",
                            paddingHorizontal: spacing.xs,
                          }}
                        >
                          {relativeTime(msg.createdAt)}
                        </Text>
                      </View>
                    );
                  }}
                />

                {/* Jump to end button */}
                {showJumpToEnd && (
                  <Pressable
                    onPress={() => modalListRef.current?.scrollToEnd({ animated: true })}
                    style={{
                      position: "absolute",
                      right: spacing.xl,
                      bottom: 80,
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: colors.backgroundElevated,
                      borderWidth: 1,
                      borderColor: colors.border,
                      alignItems: "center",
                      justifyContent: "center",
                      ...shadows.sm,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Jump to end"
                  >
                    <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
                  </Pressable>
                )}

                {/* Follow-up input */}
                <SafeAreaView edges={["bottom"]}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing.sm,
                      paddingHorizontal: spacing.lg,
                      paddingVertical: spacing.sm,
                      borderTopWidth: 1,
                      borderTopColor: colors.border,
                      backgroundColor: colors.background,
                    }}
                  >
                    {/* Mic button */}
                    <Pressable
                      onPress={() => toggleFollowUpRecording()}
                      disabled={isTranscribingFollowUp}
                      accessibilityRole="button"
                      accessibilityLabel={isRecordingFollowUp ? "Stop recording" : "Record voice follow-up"}
                      accessibilityState={{ disabled: isTranscribingFollowUp }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={({ pressed }) => [
                        {
                          width: 40,
                          height: 40,
                          borderRadius: 20,
                          backgroundColor: isRecordingFollowUp
                            ? colors.error
                            : colors.backgroundElevated,
                          alignItems: "center",
                          justifyContent: "center",
                        },
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      {isTranscribingFollowUp ? (
                        <ActivityIndicator size="small" color={colors.textMuted} />
                      ) : (
                        <Ionicons
                          name={isRecordingFollowUp ? "stop" : "mic"}
                          size={isRecordingFollowUp ? 18 : 18}
                          color={isRecordingFollowUp ? colors.white : colors.textMuted}
                        />
                      )}
                    </Pressable>

                    <TextInput
                      value={followUpText}
                      onChangeText={setFollowUpText}
                      placeholder={isRecordingFollowUp ? "Recording..." : "Follow up..."}
                      placeholderTextColor={isRecordingFollowUp ? colors.error : colors.textMuted}
                      accessibilityLabel="Follow-up message"
                      accessibilityHint="Type a follow-up message to this task"
                      style={{
                        flex: 1,
                        backgroundColor: colors.backgroundElevated,
                        borderRadius: radii.lg,
                        paddingHorizontal: spacing.md,
                        paddingVertical: Platform.OS === "ios" ? 10 : 8,
                        color: colors.textPrimary,
                        fontSize: typography.base,
                        fontFamily: fontFamily.regular,
                        maxHeight: 100,
                      }}
                      multiline
                      returnKeyType="default"
                    />
                    <Pressable
                      onPress={sendFollowUp}
                      disabled={!followUpText.trim() || sendingFollowUp}
                      accessibilityRole="button"
                      accessibilityLabel="Send follow-up"
                      accessibilityState={{ disabled: !followUpText.trim() || sendingFollowUp }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={({ pressed }) => [
                        {
                          width: 40,
                          height: 40,
                          borderRadius: 20,
                          backgroundColor: followUpText.trim()
                            ? colors.primary
                            : colors.backgroundElevated,
                          alignItems: "center",
                          justifyContent: "center",
                        },
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      {sendingFollowUp ? (
                        <ActivityIndicator size="small" color={colors.white} />
                      ) : (
                        <Ionicons
                          name="arrow-up"
                          size={18}
                          color={followUpText.trim() ? colors.white : colors.textMuted}
                        />
                      )}
                    </Pressable>
                  </View>
                </SafeAreaView>
              </>
            )}
          </KeyboardAvoidingView>
        </Modal>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}
