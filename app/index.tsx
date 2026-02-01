import { useState, useMemo, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Alert,
} from "react-native";
import Markdown from "react-native-markdown-display";
import { SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { RecordingOverlay } from "@/components/RecordingOverlay";
import { QueueStatus } from "@/components/QueueStatus";
import { RecordingsList } from "@/components/RecordingsList";
import { ActionsScreen } from "@/components/ActionsScreen";
import { BottomNavBar } from "@/components/BottomNavBar";
import { AudioPlayer } from "@/components/AudioPlayer";
import { VersionBadge } from "@/components/VersionBadge";
import { WorkerStatusBadge } from "@/components/WorkerStatusBadge";
import { RatingSection } from "@/components/RatingSection";
import { SettingsModal } from "@/components/SettingsModal";
import { VocabularyScreen } from "@/components/VocabularyScreen";
import { useQueue } from "@/hooks/useQueue";
import { useRecorder } from "@/hooks/useRecorder";
import { useVocabulary } from "@/hooks/useVocabulary";
import { useShareIntentState } from "@/hooks/useShareIntent";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import type { Recording } from "@/lib/queue";
import type { Action } from "@/components/ActionItem";

// Extended action type that includes the parent recording data
export interface ActionWithRecording extends Action {
  _recording?: {
    id: string;
    audioUrl?: string;
    duration: number;
    title?: string | null;
  };
}
import { spacing, typography, radii, fontFamily, actionTypeColorsDark, actionTypeColorsLight, type ActionType } from "@/constants/Colors";
import { useThemeColors, type ThemeColors } from "@/hooks/useThemeColors";
import { db } from "@/lib/db";

type TabKey = "actions" | "recordings";
type ActionStatus = "pending" | "in_progress" | "awaiting_feedback" | "completed" | "failed" | "cancelled";

function getStatusDisplay(action: Action, colors: ThemeColors, isDark: boolean): { label: string; color: string; bg: string } {
  const status = action.status as ActionStatus;
  const typeColors = isDark ? actionTypeColorsDark : actionTypeColorsLight;

  // Check if awaiting user feedback
  if (action.messages) {
    try {
      const messages = JSON.parse(action.messages) as { role: string }[];
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage.role === "assistant" && status === "completed") {
          return { label: typeColors.review.label, color: typeColors.review.color, bg: typeColors.review.bg };
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  // Light mode needs higher alpha for visibility
  const alpha = isDark ? "20" : "30";

  switch (status) {
    case "pending":
      return { label: "Queued", color: colors.textTertiary, bg: colors.textMuted + alpha };
    case "in_progress":
      return { label: "Running", color: colors.primary, bg: colors.primary + alpha };
    case "awaiting_feedback":
      return { label: "Awaiting Reply", color: colors.warning, bg: colors.warning + alpha };
    case "completed":
      return { label: "Done", color: colors.success, bg: colors.success + alpha };
    case "failed":
      return { label: "Failed", color: colors.error, bg: colors.error + alpha };
    case "cancelled":
      return { label: "Stopped", color: colors.warning, bg: colors.warning + alpha };
    default:
      return { label: "Queued", color: colors.textTertiary, bg: colors.textMuted + alpha };
  }
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

function formatDuration(ms: number | undefined, startedAt?: number): string {
  // If no duration provided but we have startedAt, compute running duration
  const duration = ms ?? (startedAt ? Date.now() - startedAt : 0);
  if (duration < 1000) return "<1s";
  const seconds = Math.floor(duration / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }
  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

interface ThreadMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

function parseMessages(json: string | undefined | null): ThreadMessage[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as ThreadMessage[];
  } catch {
    return [];
  }
}

// Activity types for the whimsical timeline
type ActivityType = "skill" | "tool" | "agent" | "message" | "milestone";

interface Activity {
  id: string;
  type: ActivityType;
  icon: string; // Emoji
  label: string;
  detail?: string;
  timestamp: number;
  duration?: number;
  status: "active" | "done" | "error";
}

interface Progress {
  currentActivity?: string;
  skills: string[];
  currentTask?: string;
  taskProgress?: { done: number; total: number };
  activities: Activity[];
  lastUpdate: number;
}

function parseProgress(json: string | undefined | null): Progress | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    // Provide defaults for required array fields
    return {
      ...parsed,
      skills: parsed.skills ?? [],
      activities: parsed.activities ?? [],
    } as Progress;
  } catch {
    return null;
  }
}

export default function HomeScreen() {
  const { colors, isDark } = useThemeColors();
  const [activeTab, setActiveTab] = useState<TabKey>("recordings");
  const [showSettings, setShowSettings] = useState(false);
  const [showVocabulary, setShowVocabulary] = useState(false);

  const { terms: vocabularyTerms } = useVocabulary();
  const { pendingImages, showRecordingOverlay, clearPendingImages } = useShareIntentState();
  const { lastActionId: notificationActionId, clearLastActionId } = usePushNotifications();

  const {
    recordings,
    pendingCount,
    failedCount,
    triggerProcessing,
    retry,
    remove,
    share,
  } = useQueue();

  const {
    duration,
    hasPermission,
    metering,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    cancelRecording,
    isRecording,
    isPaused,
    isSaving,
    isActive,
  } = useRecorder(() => {
    triggerProcessing();
    clearPendingImages();
  });

  // Collect all actions from all recordings, including parent recording data
  const allActions = useMemo(() => {
    const actions: ActionWithRecording[] = [];
    for (const recording of recordings) {
      if (recording.actions) {
        for (const action of recording.actions) {
          actions.push({
            ...action,
            _recording: {
              id: recording.id,
              audioUrl: recording.audioFile?.url,
              duration: recording.duration,
              title: recording.title,
            },
          });
        }
      }
    }
    // Sort by extractedAt descending (newest first)
    return actions.sort((a, b) => b.extractedAt - a.extractedAt);
  }, [recordings]);

  // Count running actions
  const runningActionsCount = useMemo(() => {
    return allActions.filter((a) => a.status === "in_progress").length;
  }, [allActions]);

  // Auto-start recording when images are shared
  const hasTriggeredRecording = useRef(false);
  useEffect(() => {
    if (showRecordingOverlay && pendingImages.length > 0 && !isActive && !hasTriggeredRecording.current) {
      hasTriggeredRecording.current = true;
      handleStartRecording(true);
    }
    if (!showRecordingOverlay) {
      hasTriggeredRecording.current = false;
    }
  }, [showRecordingOverlay, pendingImages.length, isActive]);

  // Action detail/feedback modal state - store ID for real-time updates
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState("");

  // Handle notification taps - open action modal when tapped
  useEffect(() => {
    if (notificationActionId && allActions.length > 0) {
      // Check if the action exists in our list
      const actionExists = allActions.some((a) => a.id === notificationActionId);
      if (actionExists) {
        setSelectedActionId(notificationActionId);
        setActiveTab("actions"); // Switch to actions tab
        clearLastActionId();
      }
    }
  }, [notificationActionId, allActions, clearLastActionId]);

  // Look up action from allActions to get real-time updates
  const selectedAction: ActionWithRecording | null = selectedActionId
    ? allActions.find((a) => a.id === selectedActionId) ?? null
    : null;

  const handleActionPress = async (action: ActionWithRecording) => {
    setSelectedActionId(action.id);
    setFeedbackText("");

    // Mark as read if it's a completed/cancelled action that hasn't been viewed yet
    if ((action.status === "completed" || action.status === "cancelled") && !action.readAt) {
      await db.transact(
        db.tx.actions[action.id].update({
          readAt: Date.now(),
        })
      );
    }
  };

  const handleCloseModal = () => {
    setSelectedActionId(null);
    setFeedbackText("");
  };

  const handleSubmitFeedback = async () => {
    if (!selectedAction || !feedbackText.trim()) return;

    const existingMessages = parseMessages(selectedAction.messages);
    const newMessage: ThreadMessage = {
      role: "user",
      content: feedbackText.trim(),
      timestamp: Date.now(),
    };
    const updatedMessages = [...existingMessages, newMessage];

    // Build update object - always include messages
    const updateFields: Record<string, unknown> = {
      messages: JSON.stringify(updatedMessages),
    };

    // If the action is completed, failed, or cancelled, requeue it for re-processing
    // This allows the executor to pick it up and resume the session with the new feedback
    if (selectedAction.status === "completed" || selectedAction.status === "failed" || selectedAction.status === "cancelled") {
      updateFields.status = "pending";
      updateFields.startedAt = null;
      updateFields.completedAt = null;
      updateFields.errorMessage = null;
      updateFields.cancelRequested = null; // Clear any previous cancel request
    }

    await db.transact(
      db.tx.actions[selectedAction.id].update(updateFields)
    );
    setFeedbackText("");
  };

  const handleStopAction = () => {
    if (!selectedAction) return;

    Alert.alert(
      "Stop Action",
      `Are you sure you want to stop "${selectedAction.title}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Stop",
          style: "destructive",
          onPress: async () => {
            await db.transact(
              db.tx.actions[selectedAction.id].update({
                cancelRequested: true,
              })
            );
          },
        },
      ]
    );
  };

  const handleMarkDone = async () => {
    if (!selectedAction) return;

    await db.transact(
      db.tx.actions[selectedAction.id].update({
        status: "completed",
        completedAt: Date.now(),
      })
    );
  };

  const handleStartRecording = async (withPendingImages?: boolean) => {
    if (hasPermission === false) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    startRecording(withPendingImages ? pendingImages : undefined);
  };

  const handlePauseResume = () => {
    if (isPaused) {
      resumeRecording();
    } else {
      pauseRecording();
    }
  };

  const headerTitle = activeTab === "actions" ? "Actions" : "Recordings";

  // Create markdown styles dynamically based on current theme
  const markdownStyles = {
    body: {
      color: colors.textSecondary,
      fontSize: typography.sm,
      lineHeight: typography.sm * 1.6,
    },
    heading1: {
      color: colors.textPrimary,
      fontSize: typography.xl,
      fontWeight: "700" as const,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
    heading2: {
      color: colors.textPrimary,
      fontSize: typography.lg,
      fontWeight: "600" as const,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
    heading3: {
      color: colors.textPrimary,
      fontSize: typography.base,
      fontWeight: "600" as const,
      marginTop: spacing.sm,
      marginBottom: spacing.xs,
    },
    paragraph: {
      marginBottom: spacing.sm,
    },
    strong: {
      fontWeight: "600" as const,
      color: colors.textPrimary,
    },
    em: {
      fontStyle: "italic" as const,
    },
    bullet_list: {
      marginBottom: spacing.sm,
    },
    ordered_list: {
      marginBottom: spacing.sm,
    },
    list_item: {
      marginBottom: spacing.xs,
    },
    code_inline: {
      backgroundColor: colors.backgroundElevated,
      color: colors.primary,
      paddingHorizontal: 4,
      borderRadius: 4,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
      fontSize: typography.xs,
    },
    fence: {
      backgroundColor: colors.backgroundElevated,
      padding: spacing.sm,
      borderRadius: radii.sm,
      marginVertical: spacing.sm,
    },
    code_block: {
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
      fontSize: typography.xs,
      color: colors.textSecondary,
    },
    blockquote: {
      backgroundColor: colors.backgroundElevated,
      borderLeftColor: colors.primary,
      borderLeftWidth: 3,
      paddingLeft: spacing.md,
      paddingVertical: spacing.sm,
      marginVertical: spacing.sm,
    },
    link: {
      color: colors.primary,
    },
    hr: {
      backgroundColor: colors.border,
      height: 1,
      marginVertical: spacing.md,
    },
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{headerTitle}</Text>
        <View style={styles.headerRight}>
          {(pendingCount > 0 || failedCount > 0) && (
            <QueueStatus pendingCount={pendingCount} failedCount={failedCount} />
          )}
          <WorkerStatusBadge />
          <VersionBadge />
          <Pressable
            onPress={() => setShowSettings(true)}
            style={({ pressed }) => [
              styles.settingsButton,
              { backgroundColor: colors.backgroundElevated },
              pressed && { opacity: 0.7 },
              !isDark && [styles.settingsButtonLight, { borderColor: colors.border }],
            ]}
          >
            <Ionicons name="settings-outline" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      <View style={styles.content}>
        {activeTab === "actions" ? (
          <ActionsScreen actions={allActions} onActionPress={handleActionPress} />
        ) : (
          <RecordingsList
            recordings={recordings}
            onRetry={retry}
            onDelete={remove}
            onShare={share}
            onActionPress={handleActionPress}
          />
        )}
      </View>

      <BottomNavBar
        activeTab={activeTab}
        onTabPress={setActiveTab}
        onRecordPress={handleStartRecording}
        recordDisabled={hasPermission === false}
        runningCount={runningActionsCount}
      />

      <RecordingOverlay
        isVisible={isActive || isSaving}
        duration={duration}
        metering={metering}
        isRecording={isRecording}
        isPaused={isPaused}
        isSaving={isSaving}
        onPauseResume={handlePauseResume}
        onStop={stopRecording}
        onDelete={() => {
          cancelRecording();
          clearPendingImages();
        }}
        pendingImages={pendingImages}
      />

      {/* Settings Modal */}
      <SettingsModal
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        onVocabularyPress={() => setShowVocabulary(true)}
        vocabularyCount={vocabularyTerms.length}
      />

      {/* Vocabulary Screen */}
      <VocabularyScreen
        visible={showVocabulary}
        onClose={() => setShowVocabulary(false)}
      />

      {/* Action Detail/Feedback Modal */}
      <Modal
        visible={selectedAction !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseModal}
      >
        {selectedAction && (
          <GestureHandlerRootView style={[styles.modalContainer, { backgroundColor: colors.background }]}>
            <SafeAreaView style={styles.flex1} edges={["top"]}>
            <KeyboardAvoidingView
              style={styles.flex1}
              behavior={Platform.OS === "ios" ? "padding" : "height"}
            >
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Pressable onPress={handleCloseModal} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </Pressable>
              <View style={styles.headerBadges}>
                {(() => {
                  const typeColors = isDark ? actionTypeColorsDark : actionTypeColorsLight;
                  const typeConfig = typeColors[selectedAction.type as ActionType] ?? typeColors.note;
                  return (
                    <View style={[styles.typeBadgeColored, { backgroundColor: typeConfig.bg }]}>
                      <Text style={[styles.typeBadgeColoredText, { color: typeConfig.color }]}>
                        {typeConfig.label}
                      </Text>
                    </View>
                  );
                })()}
                {selectedAction.type === "CodeChange" && selectedAction.subtype && (
                  <View style={[styles.subtypeBadge, { backgroundColor: colors.textMuted + "20" }]}>
                    <Text style={[styles.subtypeBadgeText, { color: colors.textSecondary }]}>
                      {selectedAction.subtype}
                    </Text>
                  </View>
                )}
                {selectedAction.type === "CodeChange" && (
                  <View style={[
                    styles.deployModeBadge,
                    {
                      backgroundColor: selectedAction.prOnly
                        ? colors.warning + "20"
                        : colors.success + "20",
                    },
                  ]}>
                    <Ionicons
                      name={selectedAction.prOnly ? "git-pull-request-outline" : "rocket-outline"}
                      size={12}
                      color={selectedAction.prOnly ? colors.warning : colors.success}
                    />
                    <Text style={[
                      styles.deployModeBadgeText,
                      { color: selectedAction.prOnly ? colors.warning : colors.success },
                    ]}>
                      {selectedAction.prOnly ? "PR Only" : "Deploy"}
                    </Text>
                  </View>
                )}
                {(() => {
                  const statusDisplay = getStatusDisplay(selectedAction, colors, isDark);
                  return (
                    <View style={[styles.statusBadge, { backgroundColor: statusDisplay.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: statusDisplay.color }]}>
                        {statusDisplay.label}
                      </Text>
                    </View>
                  );
                })()}
              </View>
              {selectedAction.status === "in_progress" ? (
                <Pressable
                  onPress={handleStopAction}
                  style={({ pressed }) => [styles.stopButton, { backgroundColor: colors.error + "20" }, pressed && styles.buttonPressed]}
                >
                  <View style={styles.stopButtonContent}>
                    <Ionicons name="stop-circle" size={20} color={colors.error} />
                    <Text style={[styles.stopButtonText, { color: colors.error }]}>Stop</Text>
                  </View>
                </Pressable>
              ) : selectedAction.status === "awaiting_feedback" ? (
                <Pressable
                  onPress={handleMarkDone}
                  style={({ pressed }) => [styles.doneButton, { backgroundColor: colors.success + "20" }, pressed && styles.buttonPressed]}
                >
                  <View style={styles.stopButtonContent}>
                    <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                    <Text style={[styles.stopButtonText, { color: colors.success }]}>Done</Text>
                  </View>
                </Pressable>
              ) : (
                <View style={styles.headerSpacer} />
              )}
            </View>

            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{selectedAction.title}</Text>
              {selectedAction.description && (
                <Text style={[styles.modalDescription, { color: colors.textSecondary }]}>{selectedAction.description}</Text>
              )}

              {/* Dependency Info */}
              {selectedAction.dependsOn && selectedAction.dependsOn.length > 0 && (
                <View style={[styles.dependencySection, { backgroundColor: colors.warning + "15", borderColor: colors.warning + "30" }]}>
                  <View style={styles.dependencyHeader}>
                    <Ionicons name="git-branch-outline" size={16} color={colors.warning} />
                    <Text style={[styles.dependencySectionLabel, { color: colors.warning }]}>
                      {selectedAction.status === "pending" ? "Waiting for:" : "Depends on:"}
                    </Text>
                  </View>
                  <View style={[styles.dependencyItem, { backgroundColor: colors.background }]}>
                    <Text style={[styles.dependencyTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                      {selectedAction.dependsOn[0].title}
                    </Text>
                    <View style={[
                      styles.dependencyStatus,
                      { backgroundColor: selectedAction.dependsOn[0].status === "completed" ? colors.success + "20" : colors.warning + "20" }
                    ]}>
                      <Text style={[
                        styles.dependencyStatusText,
                        { color: selectedAction.dependsOn[0].status === "completed" ? colors.success : colors.warning }
                      ]}>
                        {selectedAction.dependsOn[0].status === "completed" ? "Done" : selectedAction.dependsOn[0].status === "in_progress" ? "Running" : "Queued"}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Timestamps */}
              <View style={[styles.timestampSection, { borderColor: colors.border }]}>
                <View style={styles.timestampItem}>
                  <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                  <Text style={[styles.timestampText, { color: colors.textMuted }]}>
                    Created {formatRelativeTime(selectedAction.extractedAt)}
                  </Text>
                </View>
                {selectedAction.startedAt && (
                  <View style={styles.timestampItem}>
                    <Ionicons name="play-outline" size={14} color={colors.textMuted} />
                    <Text style={[styles.timestampText, { color: colors.textMuted }]}>
                      Started {formatRelativeTime(selectedAction.startedAt)}
                    </Text>
                  </View>
                )}
                {selectedAction.completedAt && (
                  <View style={styles.timestampItem}>
                    <Ionicons name="checkmark-outline" size={14} color={colors.textMuted} />
                    <Text style={[styles.timestampText, { color: colors.textMuted }]}>
                      Completed {formatRelativeTime(selectedAction.completedAt)}
                    </Text>
                  </View>
                )}
              </View>

              {/* Live Progress (for running actions) */}
              {selectedAction.status === "in_progress" && (() => {
                const progress = parseProgress(selectedAction.progress);
                if (!progress) {
                  return (
                    <View style={[styles.progressSection, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
                      <View style={styles.progressHeader}>
                        <View style={[styles.progressDot, { backgroundColor: colors.primary }]} />
                        <Text style={[styles.progressLabel, { color: colors.primary }]}>Running...</Text>
                      </View>
                      <Text style={[styles.progressWaiting, { color: colors.textMuted }]}>Waiting for updates...</Text>
                    </View>
                  );
                }
                return (
                  <View style={[styles.progressSection, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
                    {/* Header with task progress */}
                    <View style={styles.progressHeader}>
                      <View style={[styles.progressDot, { backgroundColor: colors.primary }]} />
                      <Text style={[styles.progressLabel, { color: colors.primary }]}>
                        {progress.taskProgress
                          ? `Working... ${progress.taskProgress.done}/${progress.taskProgress.total}`
                          : "Working..."}
                      </Text>
                    </View>

                    {/* Skills badges (prominent!) */}
                    {progress.skills && progress.skills.length > 0 && (
                      <View style={styles.skillsBadges}>
                        {progress.skills.map((skill, idx) => (
                          <View key={idx} style={[styles.skillBadge, { backgroundColor: colors.primary + "20" }]}>
                            <Text style={styles.skillBadgeIcon}>✨</Text>
                            <Text style={[styles.skillBadgeText, { color: colors.primary }]}>{skill}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Current activity (what's happening now) */}
                    {progress.currentActivity && (
                      <View style={[styles.currentActivityBox, { backgroundColor: colors.background }]}>
                        <Text style={[styles.currentActivityText, { color: colors.textPrimary }]}>
                          {progress.currentActivity}
                        </Text>
                      </View>
                    )}

                    {/* Activity feed (whimsical timeline) */}
                    {progress.activities && progress.activities.length > 0 && (
                      <View style={styles.activityFeed}>
                        {progress.activities.slice(-12).reverse().map((activity) => {
                          const isActive = activity.status === "active";
                          const isError = activity.status === "error";
                          const opacity = isActive ? 1 : 0.7;
                          return (
                            <View key={activity.id} style={[styles.activityRow, { opacity }]}>
                              <Text style={styles.activityIcon}>{activity.icon}</Text>
                              <View style={styles.activityContent}>
                                <Text
                                  style={[
                                    styles.activityLabel,
                                    { color: isError ? colors.error : isActive ? colors.textPrimary : colors.textSecondary },
                                  ]}
                                  numberOfLines={2}
                                >
                                  {activity.detail ? `${activity.label}: ${activity.detail}` : activity.label}
                                </Text>
                              </View>
                              {activity.duration && (
                                <Text style={[styles.activityDuration, { color: colors.textMuted }]}>
                                  {formatDuration(activity.duration)}
                                </Text>
                              )}
                              {isActive && (
                                <View style={[styles.activityPulse, { backgroundColor: colors.primary }]} />
                              )}
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })()}

              {/* Activity History (for completed/failed/cancelled actions) */}
              {selectedAction.status !== "in_progress" && (() => {
                const progress = parseProgress(selectedAction.progress);
                if (!progress?.activities || progress.activities.length === 0) return null;
                return (
                  <View style={[styles.activityHistorySection, { borderColor: colors.border }]}>
                    <View style={styles.historyHeader}>
                      <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Activity Log</Text>
                      {progress.skills && progress.skills.length > 0 && (
                        <View style={styles.skillsBadgesSmall}>
                          {progress.skills.map((skill, idx) => (
                            <View key={idx} style={[styles.skillBadgeSmall, { backgroundColor: colors.primary + "15" }]}>
                              <Text style={[styles.skillBadgeTextSmall, { color: colors.primary }]}>✨ {skill}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                    <View style={styles.activityFeed}>
                      {progress.activities.slice(-15).reverse().map((activity) => {
                        const isError = activity.status === "error";
                        return (
                          <View key={activity.id} style={styles.activityRow}>
                            <Text style={styles.activityIcon}>{activity.icon}</Text>
                            <View style={styles.activityContent}>
                              <Text
                                style={[
                                  styles.activityLabel,
                                  { color: isError ? colors.error : colors.textSecondary },
                                ]}
                                numberOfLines={2}
                              >
                                {activity.detail ? `${activity.label}: ${activity.detail}` : activity.label}
                              </Text>
                            </View>
                            {activity.duration && (
                              <Text style={[styles.activityDuration, { color: colors.textMuted }]}>
                                {formatDuration(activity.duration)}
                              </Text>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              })()}

              {/* Original Voice Note */}
              {selectedAction._recording?.audioUrl && (
                <View style={styles.voiceNoteSection}>
                  <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Original Voice Note</Text>
                  <AudioPlayer
                    uri={selectedAction._recording.audioUrl}
                    duration={selectedAction._recording.duration}
                    title={selectedAction._recording.title ?? undefined}
                  />
                </View>
              )}

              {/* Prominent Result URL Button */}
              {selectedAction.deployUrl && (
                <Pressable
                  style={({ pressed }) => [styles.resultUrlButton, { backgroundColor: colors.primary }, pressed && styles.buttonPressed]}
                  onPress={() => Linking.openURL(selectedAction.deployUrl!)}
                >
                  <Ionicons name="open-outline" size={20} color={colors.white} />
                  <Text style={[styles.resultUrlButtonText, { color: colors.white }]}>
                    {selectedAction.deployUrlLabel || "Open App"}
                  </Text>
                </Pressable>
              )}

              {/* Result */}
              {selectedAction.result && (
                <View style={styles.resultSection}>
                  <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Result</Text>
                  <View style={[styles.resultBox, { backgroundColor: colors.success + "20" }]}>
                    <Markdown style={markdownStyles}>
                      {selectedAction.result}
                    </Markdown>
                  </View>
                </View>
              )}

              {/* Error */}
              {selectedAction.errorMessage && (
                <View style={styles.errorSection}>
                  <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Error</Text>
                  <View style={[styles.errorBox, { backgroundColor: colors.error + "20" }]}>
                    <Ionicons name="alert-circle" size={18} color={colors.error} />
                    <Text style={[styles.errorText, { color: colors.error }]}>{selectedAction.errorMessage}</Text>
                  </View>
                </View>
              )}

              {/* Thread Messages */}
              {parseMessages(selectedAction.messages).length > 0 && (
                <View style={styles.threadSection}>
                  <Text style={[styles.threadLabel, { color: colors.textPrimary }]}>Thread</Text>
                  {parseMessages(selectedAction.messages).map((msg, idx) => (
                    <View
                      key={idx}
                      style={[
                        styles.messageBubble,
                        msg.role === "user"
                          ? [styles.userBubble, { backgroundColor: colors.primary + "20" }]
                          : [styles.assistantBubble, { backgroundColor: colors.backgroundElevated }],
                      ]}
                    >
                      <Text style={[styles.messageRole, { color: colors.textTertiary }]}>
                        {msg.role === "user" ? "You" : "Claude"}
                      </Text>
                      <Text style={[styles.messageContent, { color: colors.textPrimary }]}>{msg.content}</Text>
                      <Text style={[styles.messageTime, { color: colors.textMuted }]}>
                        {new Date(msg.timestamp).toLocaleString()}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Input for new message */}
              <View style={styles.feedbackSection}>
                <Text style={[styles.feedbackLabel, { color: colors.textPrimary }]}>
                  {parseMessages(selectedAction.messages).length > 0 ? "Reply" : "Start a thread"}
                </Text>
                <TextInput
                  style={[styles.feedbackInput, { backgroundColor: colors.backgroundElevated, color: colors.textPrimary }]}
                  placeholder="Type your message..."
                  placeholderTextColor={colors.textMuted}
                  multiline
                  value={feedbackText}
                  onChangeText={setFeedbackText}
                />
                <View style={{ alignItems: "flex-end", marginTop: spacing.lg }}>
                  <Pressable
                    onPress={handleSubmitFeedback}
                    disabled={!feedbackText.trim()}
                    style={({ pressed }) => ({
                      paddingVertical: spacing.md,
                      paddingHorizontal: spacing.xl,
                      backgroundColor: feedbackText.trim() ? colors.primary : colors.backgroundElevated,
                      borderRadius: radii.lg,
                      opacity: pressed ? 0.8 : 1,
                    })}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Ionicons
                        name="send"
                        size={16}
                        color={feedbackText.trim() ? colors.white : colors.textMuted}
                      />
                      <Text style={{
                        color: feedbackText.trim() ? colors.white : colors.textMuted,
                        fontSize: typography.md,
                        fontWeight: "600",
                        marginLeft: spacing.sm,
                      }}>
                        Send
                      </Text>
                    </View>
                  </Pressable>
                </View>
              </View>

              {/* Rating Section - only for completed/failed actions */}
              {(selectedAction.status === "completed" || selectedAction.status === "failed") && (
                <RatingSection
                  actionId={selectedAction.id}
                  existingRating={selectedAction.rating}
                  existingTags={selectedAction.ratingTags ? JSON.parse(selectedAction.ratingTags) : []}
                  existingComment={selectedAction.ratingComment}
                />
              )}
            </ScrollView>
            </KeyboardAvoidingView>
            </SafeAreaView>
          </GestureHandlerRootView>
        )}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex1: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: fontFamily.bold,
    fontWeight: "700",
    letterSpacing: typography.tracking.tight,
    textTransform: "uppercase",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  settingsButton: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsButtonLight: {
    borderWidth: 1,
    // borderColor set dynamically via colors.border
  },
  content: {
    flex: 1,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  stopButton: {
    borderRadius: radii.md,
  },
  doneButton: {
    borderRadius: radii.md,
  },
  stopButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  stopButtonText: {
    fontSize: typography.sm,
    fontWeight: "600",
  },
  typeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  typeBadgeText: {
    fontSize: typography.xs,
    fontWeight: "600",
  },
  headerSpacer: {
    width: 40,
  },
  headerBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  typeBadgeColored: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  typeBadgeColoredText: {
    fontSize: typography.xs,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  subtypeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  subtypeBadgeText: {
    fontSize: typography.xs,
    fontWeight: "500",
    textTransform: "capitalize",
  },
  deployModeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  deployModeBadgeText: {
    fontSize: typography.xs,
    fontWeight: "500",
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  statusBadgeText: {
    fontSize: typography.xs,
    fontWeight: "500",
  },
  modalScroll: {
    flex: 1,
  },
  modalContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  modalTitle: {
    fontSize: typography.xl,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  modalDescription: {
    fontSize: typography.base,
    lineHeight: typography.base * 1.5,
    marginBottom: spacing.md,
  },
  dependencySection: {
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  dependencyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  dependencySectionLabel: {
    fontSize: typography.sm,
    fontWeight: "600",
  },
  dependencyItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.sm,
    borderRadius: radii.sm,
    gap: spacing.sm,
  },
  dependencyTitle: {
    fontSize: typography.sm,
    flex: 1,
  },
  dependencyStatus: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  dependencyStatusText: {
    fontSize: typography.xs,
    fontWeight: "500",
  },
  timestampSection: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginBottom: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  timestampItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  timestampText: {
    fontSize: typography.xs,
  },
  // Progress section styles
  progressSection: {
    marginBottom: spacing.lg,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  progressLabel: {
    fontSize: typography.sm,
    fontWeight: "600",
  },
  progressWaiting: {
    fontSize: typography.sm,
    fontStyle: "italic",
  },
  // Skills badges (prominent!)
  skillsBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  skillBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  skillBadgeIcon: {
    fontSize: 12,
  },
  skillBadgeText: {
    fontSize: typography.xs,
    fontWeight: "600",
  },
  skillsBadgesSmall: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  skillBadgeSmall: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  skillBadgeTextSmall: {
    fontSize: typography.xs,
    fontWeight: "500",
  },
  // Current activity (what's happening now)
  currentActivityBox: {
    padding: spacing.sm,
    borderRadius: radii.sm,
    marginBottom: spacing.md,
  },
  currentActivityText: {
    fontSize: typography.sm,
    fontWeight: "500",
    lineHeight: typography.sm * 1.4,
  },
  // Whimsical activity feed
  activityFeed: {
    gap: spacing.xs,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  activityIcon: {
    fontSize: 16,
    width: 22,
    textAlign: "center",
  },
  activityContent: {
    flex: 1,
  },
  activityLabel: {
    fontSize: typography.sm,
    lineHeight: typography.sm * 1.4,
  },
  activityDuration: {
    fontSize: typography.xs,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  activityPulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
  },
  // Activity history section
  activityHistorySection: {
    marginBottom: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  // Legacy styles kept for backward compat
  thinkingBox: {
    borderRadius: radii.sm,
    padding: spacing.sm,
  },
  thinkingLabel: {
    fontSize: typography.xs,
    marginBottom: spacing.xs,
  },
  thinkingText: {
    fontSize: typography.sm,
    fontStyle: "italic",
    lineHeight: typography.sm * 1.4,
  },
  sectionLabel: {
    fontSize: typography.sm,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  voiceNoteSection: {
    marginBottom: spacing.lg,
  },
  resultSection: {
    marginBottom: spacing.lg,
  },
  errorSection: {
    marginBottom: spacing.lg,
  },
  resultUrlButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.lg,
    marginBottom: spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  resultUrlButtonText: {
    fontSize: typography.lg,
    fontWeight: "700",
  },
  resultBox: {
    padding: spacing.md,
    borderRadius: radii.md,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
  },
  errorText: {
    flex: 1,
    fontSize: typography.sm,
    lineHeight: typography.sm * 1.4,
  },
  threadSection: {
    marginBottom: spacing.lg,
  },
  threadLabel: {
    fontSize: typography.sm,
    fontWeight: "600",
    marginBottom: spacing.md,
  },
  messageBubble: {
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.sm,
  },
  userBubble: {
    marginLeft: spacing.xl,
  },
  assistantBubble: {
    marginRight: spacing.xl,
  },
  messageRole: {
    fontSize: typography.xs,
    fontWeight: "600",
    marginBottom: spacing.xs,
  },
  messageContent: {
    fontSize: typography.sm,
    lineHeight: typography.sm * 1.5,
  },
  messageTime: {
    fontSize: typography.xs,
    marginTop: spacing.xs,
  },
  feedbackSection: {
    marginTop: spacing.md,
    alignItems: "stretch",
  },
  feedbackLabel: {
    fontSize: typography.sm,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  feedbackInput: {
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: typography.base,
    minHeight: 80,
    textAlignVertical: "top",
  },
  buttonPressed: {
    opacity: 0.8,
  },
});
