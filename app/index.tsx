import { useState, useMemo } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Link } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { RecordingOverlay } from "@/components/RecordingOverlay";
import { QueueStatus } from "@/components/QueueStatus";
import { RecordingsList } from "@/components/RecordingsList";
import { ActionsScreen } from "@/components/ActionsScreen";
import { BottomNavBar } from "@/components/BottomNavBar";
import { AudioPlayer } from "@/components/AudioPlayer";
import { useQueue } from "@/hooks/useQueue";
import { useRecorder } from "@/hooks/useRecorder";
import type { Recording } from "@/lib/queue";
import type { Action } from "@/components/ActionItem";

// Extended action type that includes the parent recording data
export interface ActionWithRecording extends Action {
  _recording?: {
    id: string;
    localFilePath: string;
    duration: number;
    title?: string | null;
  };
}
import { colors, spacing, typography, radii } from "@/constants/Colors";
import { db } from "@/lib/db";

type TabKey = "actions" | "recordings";
type ActionType = "bug" | "feature" | "todo" | "note" | "question" | "command" | "idea";
type ActionStatus = "pending" | "in_progress" | "completed" | "failed";

const TYPE_CONFIG: Record<ActionType, { label: string; color: string; bg: string }> = {
  bug: { label: "BUG", color: "#fca5a5", bg: "#7f1d1d" },
  feature: { label: "FEATURE", color: "#93c5fd", bg: "#1e3a5f" },
  todo: { label: "TODO", color: "#86efac", bg: "#14532d" },
  note: { label: "NOTE", color: "#d1d5db", bg: "#374151" },
  question: { label: "?", color: "#fcd34d", bg: "#78350f" },
  command: { label: "CMD", color: "#c4b5fd", bg: "#4c1d95" },
  idea: { label: "IDEA", color: "#fbbf24", bg: "#92400e" },
};

function getStatusDisplay(action: Action): { label: string; color: string; bg: string } {
  const status = action.status as ActionStatus;

  // Check if awaiting user feedback
  if (action.messages) {
    try {
      const messages = JSON.parse(action.messages) as { role: string }[];
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage.role === "assistant" && status === "completed") {
          return { label: "Review", color: "#fbbf24", bg: "#78350f" };
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  switch (status) {
    case "pending":
      return { label: "Queued", color: colors.textTertiary, bg: colors.backgroundElevated };
    case "in_progress":
      return { label: "Running", color: colors.primary, bg: colors.primary + "20" };
    case "completed":
      return { label: "Done", color: colors.success, bg: colors.success + "20" };
    case "failed":
      return { label: "Failed", color: colors.error, bg: colors.error + "20" };
    default:
      return { label: "Queued", color: colors.textTertiary, bg: colors.backgroundElevated };
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

export default function HomeScreen() {
  const [activeTab, setActiveTab] = useState<TabKey>("actions");

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
              localFilePath: recording.localFilePath,
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

  // Action detail/feedback modal state - store ID for real-time updates
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState("");

  // Look up action from allActions to get real-time updates
  const selectedAction: ActionWithRecording | null = selectedActionId
    ? allActions.find((a) => a.id === selectedActionId) ?? null
    : null;

  const handleActionPress = (action: ActionWithRecording) => {
    setSelectedActionId(action.id);
    setFeedbackText("");
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

    await db.transact(
      db.tx.actions[selectedAction.id].update({
        messages: JSON.stringify(updatedMessages),
      })
    );
    setFeedbackText("");
  };

  const handleStartRecording = async () => {
    if (hasPermission === false) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    startRecording();
  };

  const handlePauseResume = () => {
    if (isPaused) {
      resumeRecording();
    } else {
      pauseRecording();
    }
  };

  const headerTitle = activeTab === "actions" ? "Actions" : "Recordings";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{headerTitle}</Text>
        <View style={styles.headerRight}>
          {(pendingCount > 0 || failedCount > 0) && (
            <QueueStatus pendingCount={pendingCount} failedCount={failedCount} />
          )}
          <Link href="/settings" asChild>
            <Pressable style={styles.settingsButton}>
              <Ionicons name="settings-outline" size={22} color={colors.textSecondary} />
            </Pressable>
          </Link>
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
        onDelete={cancelRecording}
      />

      {/* Action Detail/Feedback Modal */}
      <Modal
        visible={selectedAction !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseModal}
      >
        {selectedAction && (
          <GestureHandlerRootView style={styles.modalContainer}>
            <KeyboardAvoidingView
              style={styles.flex1}
              behavior={Platform.OS === "ios" ? "padding" : "height"}
            >
            <View style={styles.modalHeader}>
              <Pressable onPress={handleCloseModal} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </Pressable>
              <View style={styles.headerBadges}>
                {(() => {
                  const typeConfig = TYPE_CONFIG[selectedAction.type as ActionType] ?? TYPE_CONFIG.note;
                  return (
                    <View style={[styles.typeBadgeColored, { backgroundColor: typeConfig.bg }]}>
                      <Text style={[styles.typeBadgeColoredText, { color: typeConfig.color }]}>
                        {typeConfig.label}
                      </Text>
                    </View>
                  );
                })()}
                {(() => {
                  const statusDisplay = getStatusDisplay(selectedAction);
                  return (
                    <View style={[styles.statusBadge, { backgroundColor: statusDisplay.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: statusDisplay.color }]}>
                        {statusDisplay.label}
                      </Text>
                    </View>
                  );
                })()}
              </View>
              <View style={styles.headerSpacer} />
            </View>

            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
              <Text style={styles.modalTitle}>{selectedAction.title}</Text>
              {selectedAction.description && (
                <Text style={styles.modalDescription}>{selectedAction.description}</Text>
              )}

              {/* Timestamps */}
              <View style={styles.timestampSection}>
                <View style={styles.timestampItem}>
                  <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                  <Text style={styles.timestampText}>
                    Created {formatRelativeTime(selectedAction.extractedAt)}
                  </Text>
                </View>
                {selectedAction.startedAt && (
                  <View style={styles.timestampItem}>
                    <Ionicons name="play-outline" size={14} color={colors.textMuted} />
                    <Text style={styles.timestampText}>
                      Started {formatRelativeTime(selectedAction.startedAt)}
                    </Text>
                  </View>
                )}
                {selectedAction.completedAt && (
                  <View style={styles.timestampItem}>
                    <Ionicons name="checkmark-outline" size={14} color={colors.textMuted} />
                    <Text style={styles.timestampText}>
                      Completed {formatRelativeTime(selectedAction.completedAt)}
                    </Text>
                  </View>
                )}
              </View>

              {/* Original Voice Note */}
              {selectedAction._recording && (
                <View style={styles.voiceNoteSection}>
                  <Text style={styles.sectionLabel}>Original Voice Note</Text>
                  <AudioPlayer
                    uri={selectedAction._recording.localFilePath}
                    duration={selectedAction._recording.duration}
                    title={selectedAction._recording.title ?? undefined}
                  />
                </View>
              )}

              {/* Open App Button */}
              {selectedAction.deployUrl && (
                <Pressable
                  style={({ pressed }) => [styles.openAppButton, pressed && styles.buttonPressed]}
                  onPress={() => Linking.openURL(selectedAction.deployUrl!)}
                >
                  <Ionicons name="open-outline" size={18} color={colors.background} />
                  <Text style={styles.openAppButtonText}>Open App</Text>
                </Pressable>
              )}

              {/* Result */}
              {selectedAction.result && (
                <View style={styles.resultSection}>
                  <Text style={styles.sectionLabel}>Result</Text>
                  <View style={styles.resultBox}>
                    <Text style={styles.resultText}>{selectedAction.result}</Text>
                  </View>
                </View>
              )}

              {/* Error */}
              {selectedAction.errorMessage && (
                <View style={styles.errorSection}>
                  <Text style={styles.sectionLabel}>Error</Text>
                  <View style={styles.errorBox}>
                    <Ionicons name="alert-circle" size={18} color={colors.error} />
                    <Text style={styles.errorText}>{selectedAction.errorMessage}</Text>
                  </View>
                </View>
              )}

              {/* Thread Messages */}
              {parseMessages(selectedAction.messages).length > 0 && (
                <View style={styles.threadSection}>
                  <Text style={styles.threadLabel}>Thread</Text>
                  {parseMessages(selectedAction.messages).map((msg, idx) => (
                    <View
                      key={idx}
                      style={[
                        styles.messageBubble,
                        msg.role === "user" ? styles.userBubble : styles.assistantBubble,
                      ]}
                    >
                      <Text style={styles.messageRole}>
                        {msg.role === "user" ? "You" : "Claude"}
                      </Text>
                      <Text style={styles.messageContent}>{msg.content}</Text>
                      <Text style={styles.messageTime}>
                        {new Date(msg.timestamp).toLocaleString()}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Input for new message */}
              <View style={styles.feedbackSection}>
                <Text style={styles.feedbackLabel}>
                  {parseMessages(selectedAction.messages).length > 0 ? "Reply" : "Start a thread"}
                </Text>
                <TextInput
                  style={styles.feedbackInput}
                  placeholder="Type your message..."
                  placeholderTextColor={colors.textMuted}
                  multiline
                  value={feedbackText}
                  onChangeText={setFeedbackText}
                />
                <Pressable
                  style={({ pressed }) => [
                    styles.submitButton,
                    !feedbackText.trim() && styles.submitButtonDisabled,
                    pressed && styles.buttonPressed,
                  ]}
                  onPress={handleSubmitFeedback}
                  disabled={!feedbackText.trim()}
                >
                  <Text style={styles.submitButtonText}>Send</Text>
                </Pressable>
              </View>
            </ScrollView>
            </KeyboardAvoidingView>
          </GestureHandlerRootView>
        )}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    color: colors.textPrimary,
    fontSize: 32,
    fontWeight: "700",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  content: {
    flex: 1,
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.backgroundElevated,
    justifyContent: "center",
    alignItems: "center",
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  typeBadge: {
    backgroundColor: colors.backgroundElevated,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  typeBadgeText: {
    color: colors.textSecondary,
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
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  modalDescription: {
    fontSize: typography.base,
    color: colors.textSecondary,
    lineHeight: typography.base * 1.5,
    marginBottom: spacing.md,
  },
  timestampSection: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginBottom: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  timestampItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  timestampText: {
    fontSize: typography.xs,
    color: colors.textMuted,
  },
  sectionLabel: {
    fontSize: typography.sm,
    fontWeight: "600",
    color: colors.textPrimary,
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
  openAppButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.success,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    marginBottom: spacing.lg,
  },
  openAppButtonText: {
    color: colors.background,
    fontSize: typography.base,
    fontWeight: "600",
  },
  resultBox: {
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    padding: spacing.md,
    borderRadius: radii.md,
  },
  resultText: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    lineHeight: typography.sm * 1.6,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    padding: spacing.md,
    borderRadius: radii.md,
  },
  errorText: {
    flex: 1,
    color: colors.error,
    fontSize: typography.sm,
    lineHeight: typography.sm * 1.4,
  },
  threadSection: {
    marginBottom: spacing.lg,
  },
  threadLabel: {
    fontSize: typography.sm,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  messageBubble: {
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.sm,
  },
  userBubble: {
    backgroundColor: colors.primary + "20",
    marginLeft: spacing.xl,
  },
  assistantBubble: {
    backgroundColor: colors.backgroundElevated,
    marginRight: spacing.xl,
  },
  messageRole: {
    fontSize: typography.xs,
    fontWeight: "600",
    color: colors.textTertiary,
    marginBottom: spacing.xs,
  },
  messageContent: {
    fontSize: typography.sm,
    color: colors.textPrimary,
    lineHeight: typography.sm * 1.5,
  },
  messageTime: {
    fontSize: typography.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  feedbackSection: {
    marginTop: spacing.md,
  },
  feedbackLabel: {
    fontSize: typography.sm,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  feedbackInput: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: radii.md,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: typography.base,
    minHeight: 80,
    textAlignVertical: "top",
  },
  submitButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    alignItems: "center",
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: colors.background,
    fontSize: typography.base,
    fontWeight: "600",
  },
  buttonPressed: {
    opacity: 0.8,
  },
});
