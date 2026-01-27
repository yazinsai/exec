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
import { spacing, typography, radii, actionTypeColors, type ActionType } from "@/constants/Colors";
import { useColors, type ThemeColors } from "@/hooks/useThemeColors";
import { db } from "@/lib/db";

type TabKey = "actions" | "recordings";
type ActionStatus = "pending" | "in_progress" | "completed" | "failed" | "cancelled";

function getStatusDisplay(action: Action, colors: ThemeColors): { label: string; color: string; bg: string } {
  const status = action.status as ActionStatus;

  // Check if awaiting user feedback
  if (action.messages) {
    try {
      const messages = JSON.parse(action.messages) as { role: string }[];
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage.role === "assistant" && status === "completed") {
          return { label: actionTypeColors.review.label, color: actionTypeColors.review.color, bg: actionTypeColors.review.bg };
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  switch (status) {
    case "pending":
      return { label: "Queued", color: colors.textTertiary, bg: colors.textMuted + "20" };
    case "in_progress":
      return { label: "Running", color: colors.primary, bg: colors.primary + "20" };
    case "completed":
      return { label: "Done", color: colors.success, bg: colors.success + "20" };
    case "failed":
      return { label: "Failed", color: colors.error, bg: colors.error + "20" };
    case "cancelled":
      return { label: "Stopped", color: colors.warning, bg: colors.warning + "20" };
    default:
      return { label: "Queued", color: colors.textTertiary, bg: colors.textMuted + "20" };
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

interface Progress {
  currentTask?: string;
  todos?: Array<{ content: string; status: string }>;
  recentTools?: Array<{ name: string; timestamp: number }>;
  lastThinkingSummary?: string;
  lastUpdate: number;
}

function parseProgress(json: string | undefined | null): Progress | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as Progress;
  } catch {
    return null;
  }
}

export default function HomeScreen() {
  const colors = useColors();
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
          <VersionBadge />
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
          <GestureHandlerRootView style={[styles.modalContainer, { backgroundColor: colors.background }]}>
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
                  const typeConfig = actionTypeColors[selectedAction.type as ActionType] ?? actionTypeColors.note;
                  return (
                    <View style={[styles.typeBadgeColored, { backgroundColor: typeConfig.bg }]}>
                      <Text style={[styles.typeBadgeColoredText, { color: typeConfig.color }]}>
                        {typeConfig.label}
                      </Text>
                    </View>
                  );
                })()}
                {(() => {
                  const statusDisplay = getStatusDisplay(selectedAction, colors);
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
                  style={({ pressed }) => [styles.stopButton, { backgroundColor: colors.error + "15" }, pressed && styles.buttonPressed]}
                >
                  <View style={styles.stopButtonContent}>
                    <Ionicons name="stop-circle" size={20} color={colors.error} />
                    <Text style={[styles.stopButtonText, { color: colors.error }]}>Stop</Text>
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
                    <View style={styles.progressHeader}>
                      <View style={[styles.progressDot, { backgroundColor: colors.primary }]} />
                      <Text style={[styles.progressLabel, { color: colors.primary }]}>Live Progress</Text>
                    </View>

                    {/* Current Task */}
                    {progress.currentTask && (
                      <View style={[styles.currentTaskBox, { backgroundColor: colors.background }]}>
                        <Ionicons name="cog" size={16} color={colors.primary} />
                        <Text style={[styles.currentTaskText, { color: colors.textPrimary }]}>{progress.currentTask}</Text>
                      </View>
                    )}

                    {/* Todo List */}
                    {progress.todos && progress.todos.length > 0 && (
                      <View style={[styles.todosBox, { backgroundColor: colors.background }]}>
                        {progress.todos.map((todo, idx) => (
                          <View key={idx} style={styles.todoItem}>
                            <Ionicons
                              name={
                                todo.status === "completed"
                                  ? "checkmark-circle"
                                  : todo.status === "in_progress"
                                  ? "ellipse"
                                  : "ellipse-outline"
                              }
                              size={14}
                              color={
                                todo.status === "completed"
                                  ? colors.success
                                  : todo.status === "in_progress"
                                  ? colors.primary
                                  : colors.textMuted
                              }
                            />
                            <Text
                              style={[
                                styles.todoText,
                                { color: colors.textSecondary },
                                todo.status === "completed" && { color: colors.textMuted, textDecorationLine: "line-through" },
                                todo.status === "in_progress" && { color: colors.primary, fontWeight: "500" },
                              ]}
                            >
                              {todo.content}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Recent Tools */}
                    {progress.recentTools && progress.recentTools.length > 0 && (
                      <View style={styles.recentToolsBox}>
                        <Text style={[styles.recentToolsLabel, { color: colors.textMuted }]}>Recent tools:</Text>
                        <View style={styles.toolsRow}>
                          {progress.recentTools.slice(-5).map((tool, idx) => (
                            <View key={idx} style={[styles.toolBadge, { backgroundColor: colors.backgroundElevated }]}>
                              <Text style={[styles.toolBadgeText, { color: colors.textSecondary }]}>{tool.name}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}

                    {/* Thinking Summary */}
                    {progress.lastThinkingSummary && (
                      <View style={[styles.thinkingBox, { backgroundColor: colors.background }]}>
                        <Text style={[styles.thinkingLabel, { color: colors.textMuted }]}>Thinking:</Text>
                        <Text style={[styles.thinkingText, { color: colors.textSecondary }]} numberOfLines={3}>
                          {progress.lastThinkingSummary}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })()}

              {/* Original Voice Note */}
              {selectedAction._recording && (
                <View style={styles.voiceNoteSection}>
                  <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Original Voice Note</Text>
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
                  style={({ pressed }) => [styles.openAppButton, { backgroundColor: colors.success }, pressed && styles.buttonPressed]}
                  onPress={() => Linking.openURL(selectedAction.deployUrl!)}
                >
                  <Ionicons name="open-outline" size={18} color={colors.background} />
                  <Text style={[styles.openAppButtonText, { color: colors.background }]}>Open App</Text>
                </Pressable>
              )}

              {/* Result */}
              {selectedAction.result && (
                <View style={styles.resultSection}>
                  <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Result</Text>
                  <View style={[styles.resultBox, { backgroundColor: colors.success + "15" }]}>
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
                  <View style={[styles.errorBox, { backgroundColor: colors.error + "15" }]}>
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
  currentTaskBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.sm,
    marginBottom: spacing.md,
  },
  currentTaskText: {
    flex: 1,
    fontSize: typography.sm,
    fontWeight: "500",
  },
  todosBox: {
    borderRadius: radii.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  todoItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  todoText: {
    flex: 1,
    fontSize: typography.sm,
    lineHeight: typography.sm * 1.4,
  },
  recentToolsBox: {
    marginBottom: spacing.md,
  },
  recentToolsLabel: {
    fontSize: typography.xs,
    marginBottom: spacing.xs,
  },
  toolsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  toolBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  toolBadgeText: {
    fontSize: typography.xs,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
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
  openAppButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    marginBottom: spacing.lg,
  },
  openAppButtonText: {
    fontSize: typography.base,
    fontWeight: "600",
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
