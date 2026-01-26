import { useState, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { RecordingOverlay } from "@/components/RecordingOverlay";
import { QueueStatus } from "@/components/QueueStatus";
import { RecordingsList } from "@/components/RecordingsList";
import { ActionsScreen } from "@/components/ActionsScreen";
import { BottomNavBar } from "@/components/BottomNavBar";
import { useQueue } from "@/hooks/useQueue";
import { useRecorder } from "@/hooks/useRecorder";
import type { Recording } from "@/lib/queue";
import type { Action } from "@/components/ActionItem";
import { colors, spacing, typography, radii } from "@/constants/Colors";
import { db } from "@/lib/db";

type TabKey = "actions" | "recordings";

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

  // Collect all actions from all recordings
  const allActions = useMemo(() => {
    const actions: Action[] = [];
    for (const recording of recordings) {
      if (recording.actions) {
        actions.push(...recording.actions);
      }
    }
    // Sort by extractedAt descending (newest first)
    return actions.sort((a, b) => b.extractedAt - a.extractedAt);
  }, [recordings]);

  // Action detail/feedback modal state
  const [selectedAction, setSelectedAction] = useState<Action | null>(null);
  const [feedbackText, setFeedbackText] = useState("");

  const handleActionPress = (action: Action) => {
    setSelectedAction(action);
    setFeedbackText("");
  };

  const handleCloseModal = () => {
    setSelectedAction(null);
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

  const soundRef = useRef<Audio.Sound | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState<number>(1);

  const cyclePlaybackRate = async () => {
    const rates = [1, 1.5, 2];
    const currentIndex = rates.indexOf(playbackRate);
    const nextRate = rates[(currentIndex + 1) % rates.length];
    setPlaybackRate(nextRate);
    if (soundRef.current) {
      await soundRef.current.setRateAsync(nextRate, true);
    }
  };

  const handlePlay = async (recording: Recording) => {
    try {
      // If same recording is playing, stop it
      if (playingId === recording.id && soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
        setPlayingId(null);
        return;
      }

      // Stop any existing playback
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
        setPlayingId(null);
      }

      if (!recording.localFilePath) {
        Alert.alert("Error", "Recording file not found");
        return;
      }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const { sound } = await Audio.Sound.createAsync(
        { uri: recording.localFilePath },
        { shouldPlay: true, rate: playbackRate, shouldCorrectPitch: true }
      );
      soundRef.current = sound;
      setPlayingId(recording.id);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync();
          soundRef.current = null;
          setPlayingId(null);
        }
      });
    } catch (error) {
      console.error("Playback error:", error);
      Alert.alert("Error", "Could not play recording");
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
            onPlay={handlePlay}
            playingId={playingId}
            playbackRate={playbackRate}
            onCyclePlaybackRate={cyclePlaybackRate}
          />
        )}
      </View>

      <BottomNavBar
        activeTab={activeTab}
        onTabPress={setActiveTab}
        onRecordPress={handleStartRecording}
        recordDisabled={hasPermission === false}
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
          <KeyboardAvoidingView
            style={styles.modalContainer}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <View style={styles.modalHeader}>
              <Pressable onPress={handleCloseModal} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </Pressable>
              <View style={styles.typeBadge}>
                <Text style={styles.typeBadgeText}>
                  {selectedAction.type.toUpperCase()}
                </Text>
              </View>
              <View style={styles.headerSpacer} />
            </View>

            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
              <Text style={styles.modalTitle}>{selectedAction.title}</Text>
              {selectedAction.description && (
                <Text style={styles.modalDescription}>{selectedAction.description}</Text>
              )}
              {selectedAction.errorMessage && (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={18} color={colors.error} />
                  <Text style={styles.errorText}>{selectedAction.errorMessage}</Text>
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
    marginBottom: spacing.lg,
  },
  resultBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.lg,
  },
  resultText: {
    flex: 1,
    color: colors.success,
    fontSize: typography.sm,
    lineHeight: typography.sm * 1.4,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.lg,
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
