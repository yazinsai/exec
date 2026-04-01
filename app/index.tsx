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
import {
  requestAudioPermissions,
  configureAudioMode,
  saveRecordingLocally,
  RECORDING_OPTIONS,
} from "@/lib/audio";
import { Audio } from "expo-av";
import { RecordingOverlay } from "@/components/RecordingOverlay";
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

type Task = InstaQLEntity<AppSchema, "tasks", { messages: {} }>;
type Message = InstaQLEntity<AppSchema, "messages">;

// Status dot colors
const STATUS_COLORS: Record<string, string> = {
  pending: "#71717a",
  running: "#3b82f6",
  done: "#22c55e",
  failed: "#ef4444",
  cancelled: "#f59e0b",
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

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.0`;
}

export default function HomeScreen() {
  const { colors, isDark } = useThemeColors();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [followUpText, setFollowUpText] = useState("");
  const [sendingFollowUp, setSendingFollowUp] = useState(false);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [duration, setDuration] = useState(0);
  const [metering, setMetering] = useState(-160);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const meteringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<FlatList>(null);

  const isActive = isRecording || isPaused;

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
  const { data, isLoading } = db.useQuery({
    tasks: {
      $: { order: { createdAt: "desc" }, limit: 50 },
      messages: {},
    },
  });

  const tasks = data?.tasks ?? [];

  // Keep selectedTask in sync with live data
  useEffect(() => {
    if (selectedTask) {
      const updated = tasks.find((t) => t.id === selectedTask.id);
      if (updated) {
        setSelectedTask(updated);
      }
    }
  }, [tasks]);

  // Recording handlers
  const startRecording = useCallback(async () => {
    if (hasPermission === false) return;
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
  }, [hasPermission]);

  const pauseRecording = useCallback(async () => {
    if (!isRecording || !recordingRef.current) return;
    try {
      await recordingRef.current.pauseAsync();
      setIsPaused(true);
      setIsRecording(false);
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      if (meteringIntervalRef.current) {
        clearInterval(meteringIntervalRef.current);
        meteringIntervalRef.current = null;
      }
    } catch (error) {
      console.error("Failed to pause:", error);
    }
  }, [isRecording]);

  const resumeRecording = useCallback(async () => {
    if (!isPaused || !recordingRef.current) return;
    try {
      await recordingRef.current.startAsync();
      setIsPaused(false);
      setIsRecording(true);
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
      console.error("Failed to resume:", error);
    }
  }, [isPaused]);

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
    setIsRecording(false);
    setIsPaused(false);
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
    setIsPaused(false);

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
        setIsSaving(false);
        setDuration(0);
        setMetering(-160);
        return;
      }

      // Create task + first message in InstantDB
      const taskId = id();
      const messageId = id();
      const now = Date.now();

      await db.transact([
        db.tx.tasks[taskId].update({
          input: transcription.trim(),
          status: "pending",
          source: "phone",
          createdAt: now,
        }),
        db.tx.messages[messageId]
          .update({
            role: "user",
            content: transcription.trim(),
            createdAt: now,
          })
          .link({ task: taskId }),
      ]);

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("Failed to save recording:", error);
    }

    setIsSaving(false);
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

  // Cancel task handler
  const cancelTask = useCallback(async () => {
    if (!selectedTask) return;
    try {
      await db.transact(
        db.tx.tasks[selectedTask.id].update({ cancelRequested: true })
      );
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch (error) {
      console.error("Failed to cancel task:", error);
    }
  }, [selectedTask]);

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

  // Task row
  const renderTask = ({ item }: { item: Task }) => {
    const statusColor = STATUS_COLORS[item.status] ?? "#71717a";
    return (
      <Pressable
        onPress={() => {
          setSelectedTask(item);
          setFollowUpText("");
        }}
        style={({ pressed }) => [
          {
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: spacing.xl,
            paddingVertical: 14,
            gap: spacing.md,
            backgroundColor: pressed
              ? colors.backgroundPressed
              : "transparent",
          },
        ]}
      >
        {/* Status dot */}
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: statusColor,
            flexShrink: 0,
          }}
        />

        {/* Text content */}
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            numberOfLines={2}
            style={{
              color: colors.textPrimary,
              fontSize: typography.base,
              fontFamily: fontFamily.regular,
              lineHeight: 20,
            }}
          >
            {item.input}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <Text
              style={{
                color: colors.textTertiary,
                fontSize: typography.xs,
                fontFamily: fontFamily.regular,
              }}
            >
              {relativeTime(item.createdAt)}
            </Text>
            {item.status === "running" && (
              <Text
                style={{
                  color: STATUS_COLORS.running,
                  fontSize: typography.xs,
                  fontFamily: fontFamily.medium,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                Running
              </Text>
            )}
            {item.status === "failed" && (
              <Text
                style={{
                  color: STATUS_COLORS.failed,
                  fontSize: typography.xs,
                  fontFamily: fontFamily.medium,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                Failed
              </Text>
            )}
          </View>
        </View>

        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </Pressable>
    );
  };

  const showOverlay = isActive || isSaving;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: colors.background,
        }}
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

        {/* Main content */}
        {!showOverlay && (
          <View style={{ flex: 1 }}>
            {/* Record button area */}
            <View
              style={{
                alignItems: "center",
                paddingVertical: spacing.xxl,
              }}
            >
              <Pressable
                onPress={startRecording}
                disabled={hasPermission === false}
                style={({ pressed }) => [
                  {
                    width: 88,
                    height: 88,
                    borderRadius: 44,
                    backgroundColor: colors.backgroundElevated,
                    borderWidth: 3,
                    borderColor: colors.primary,
                    alignItems: "center",
                    justifyContent: "center",
                    ...shadows.md,
                  },
                  pressed && { transform: [{ scale: 0.95 }], borderColor: colors.primaryLight },
                ]}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: colors.primary,
                  }}
                />
              </Pressable>
              <Text
                style={{
                  color: colors.textTertiary,
                  fontSize: typography.sm,
                  fontFamily: fontFamily.regular,
                  marginTop: spacing.md,
                }}
              >
                {hasPermission === false ? "Microphone access required" : "Tap to record"}
              </Text>
            </View>

            {/* Divider */}
            <View
              style={{
                height: 1,
                backgroundColor: colors.border,
                marginHorizontal: spacing.xl,
              }}
            />

            {/* Task list */}
            {isLoading ? (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : tasks.length === 0 ? (
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
                  No tasks yet. Record a voice note to get started.
                </Text>
              </View>
            ) : (
              <FlatList
                ref={scrollRef}
                data={tasks}
                keyExtractor={(item) => item.id}
                renderItem={renderTask}
                contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: 20 }}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>
        )}

        {/* Recording overlay */}
        {showOverlay && (
          <RecordingOverlay
            isVisible={true}
            duration={duration}
            metering={metering}
            isRecording={isRecording}
            isPaused={isPaused}
            isSaving={isSaving}
            onPauseResume={() => {
              if (isPaused) resumeRecording();
              else pauseRecording();
            }}
            onStop={stopRecording}
            onDelete={cancelRecording}
          />
        )}

        {/* Task detail bottom sheet (Modal) */}
        <Modal
          visible={!!selectedTask}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setSelectedTask(null)}
        >
          <KeyboardAvoidingView
            style={{ flex: 1, backgroundColor: colors.background }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
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
                    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                      <View
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 5,
                          backgroundColor: STATUS_COLORS[selectedTask.status] ?? "#71717a",
                        }}
                      />
                      <Text
                        style={{
                          fontSize: typography.xs,
                          fontFamily: fontFamily.semibold,
                          color: STATUS_COLORS[selectedTask.status] ?? colors.textTertiary,
                          textTransform: "uppercase",
                          letterSpacing: typography.tracking.wider,
                        }}
                      >
                        {selectedTask.status}
                      </Text>
                    </View>

                    <Pressable
                      onPress={() => setSelectedTask(null)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="close" size={24} color={colors.textSecondary} />
                    </Pressable>
                  </View>
                </SafeAreaView>

                {/* Scrollable content */}
                <FlatList
                  data={[...(selectedTask.messages ?? [])].sort((a, b) => a.createdAt - b.createdAt)}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={{
                    padding: spacing.xl,
                    paddingBottom: 100,
                  }}
                  showsVerticalScrollIndicator={false}
                  ListHeaderComponent={
                    <>
                      {/* Task input */}
                      <Text
                        style={{
                          color: colors.textPrimary,
                          fontSize: typography.lg,
                          fontFamily: fontFamily.medium,
                          lineHeight: 26,
                          marginBottom: spacing.lg,
                        }}
                      >
                        {selectedTask.input}
                      </Text>

                      {/* Error message */}
                      {selectedTask.errorMessage && (
                        <View
                          style={{
                            backgroundColor: "rgba(239, 68, 68, 0.1)",
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

                      {/* Live output (while running) */}
                      {selectedTask.status === "running" && selectedTask.liveOutput && (
                        <View
                          style={{
                            backgroundColor: colors.backgroundElevated,
                            borderRadius: radii.md,
                            padding: spacing.md,
                            marginBottom: spacing.lg,
                            borderLeftWidth: 3,
                            borderLeftColor: STATUS_COLORS.running,
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
                            {selectedTask.liveOutput}
                          </Text>
                        </View>
                      )}

                      {/* Result (markdown) */}
                      {selectedTask.result && (
                        <View style={{ marginBottom: spacing.lg }}>
                          <Markdown style={mdStyles}>
                            {selectedTask.result}
                          </Markdown>
                        </View>
                      )}

                      {/* Cancel button */}
                      {selectedTask.status === "running" && !selectedTask.cancelRequested && (
                        <Pressable
                          onPress={cancelTask}
                          style={{
                            alignSelf: "flex-start",
                            flexDirection: "row",
                            alignItems: "center",
                            gap: spacing.xs,
                            paddingHorizontal: spacing.md,
                            paddingVertical: spacing.sm,
                            backgroundColor: "rgba(239, 68, 68, 0.1)",
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

                      {/* Messages header */}
                      {(selectedTask.messages?.length ?? 0) > 0 && (
                        <View
                          style={{
                            borderTopWidth: 1,
                            borderTopColor: colors.border,
                            paddingTop: spacing.lg,
                            marginBottom: spacing.md,
                          }}
                        >
                          <Text
                            style={{
                              color: colors.textTertiary,
                              fontSize: typography.xs,
                              fontFamily: fontFamily.semibold,
                              textTransform: "uppercase",
                              letterSpacing: typography.tracking.label,
                            }}
                          >
                            Thread
                          </Text>
                        </View>
                      )}
                    </>
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
                              ? colors.primary + "20"
                              : colors.backgroundElevated,
                            borderRadius: radii.lg,
                            paddingHorizontal: spacing.md,
                            paddingVertical: spacing.sm,
                            borderWidth: 1,
                            borderColor: isUser
                              ? colors.primary + "30"
                              : colors.borderLight,
                          }}
                        >
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
                    <TextInput
                      value={followUpText}
                      onChangeText={setFollowUpText}
                      placeholder="Follow up..."
                      placeholderTextColor={colors.textMuted}
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
                      style={({ pressed }) => [
                        {
                          width: 36,
                          height: 36,
                          borderRadius: 18,
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
