import { useState, useRef, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, Alert, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { RecordingOverlay } from "@/components/RecordingOverlay";
import { QueueStatus } from "@/components/QueueStatus";
import { RecordingsList } from "@/components/RecordingsList";
import { ActionsScreen } from "@/components/ActionsScreen";
import { IdeaFeedbackScreen } from "@/components/IdeaFeedbackScreen";
import { BottomNavBar } from "@/components/BottomNavBar";
import { useQueue } from "@/hooks/useQueue";
import { useRecorder } from "@/hooks/useRecorder";
import type { Recording } from "@/lib/queue";
import type { Action } from "@/components/ActionItem";
import { colors, spacing } from "@/constants/Colors";
import { db } from "@/lib/db";

type TabKey = "actions" | "recordings";

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

  // Idea feedback modal state
  const [selectedIdea, setSelectedIdea] = useState<Action | null>(null);

  const handleActionPress = (action: Action) => {
    // If it's an idea awaiting feedback, show the feedback screen
    if (action.type === "idea" && action.longrunStatus === "awaiting_feedback") {
      setSelectedIdea(action);
    } else if (action.type === "idea") {
      // Show status for other idea states
      Alert.alert(
        "Idea Status",
        action.longrunStatus === "running"
          ? "This idea is currently being processed by /longrun. This may take a while."
          : action.longrunStatus === "failed"
          ? `Processing failed: ${action.errorMessage || "Unknown error"}`
          : "This idea is pending processing.",
        [{ text: "OK" }]
      );
    } else {
      // For non-idea actions, show details
      Alert.alert(action.title, action.description || "No description", [{ text: "OK" }]);
    }
  };

  const handleAcceptIdea = async () => {
    if (!selectedIdea) return;
    // Mark as completed/accepted
    await db.transact(
      db.tx.actions[selectedIdea.id].update({
        longrunStatus: "completed",
        status: "completed",
      })
    );
    setSelectedIdea(null);
    Alert.alert("Accepted", "The idea implementation has been accepted.");
  };

  const handleSelectVariant = async (variantIndex: number) => {
    if (!selectedIdea) return;
    // Update action to trigger re-processing with selected variant
    await db.transact(
      db.tx.actions[selectedIdea.id].update({
        selectedVariant: variantIndex,
        longrunStatus: "pending_variant",
        status: "pending",
      })
    );
    setSelectedIdea(null);
    Alert.alert(
      "Variant Selected",
      "The variant has been selected. Run the voice-listener with --ideas to process it."
    );
  };

  const handleSubmitFeedback = async (feedback: string) => {
    if (!selectedIdea) return;
    // Save feedback and mark for re-processing
    await db.transact(
      db.tx.actions[selectedIdea.id].update({
        userFeedback: feedback,
        longrunStatus: "pending_feedback",
        status: "pending",
      })
    );
    setSelectedIdea(null);
    Alert.alert(
      "Feedback Submitted",
      "Your feedback has been saved. Run the voice-listener with --ideas to process it."
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

      {/* Idea Feedback Modal */}
      <Modal
        visible={selectedIdea !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedIdea(null)}
      >
        {selectedIdea && (
          <IdeaFeedbackScreen
            action={selectedIdea}
            onAccept={handleAcceptIdea}
            onSelectVariant={handleSelectVariant}
            onSubmitFeedback={handleSubmitFeedback}
            onClose={() => setSelectedIdea(null)}
          />
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
});
