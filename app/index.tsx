import { useState, useRef } from "react";
import { View, StyleSheet, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { RecordingOverlay } from "@/components/RecordingOverlay";
import { QueueStatus } from "@/components/QueueStatus";
import { RecordingsList } from "@/components/RecordingsList";
import { useQueue } from "@/hooks/useQueue";
import { useRecorder } from "@/hooks/useRecorder";
import type { Recording } from "@/lib/queue";
import { colors, spacing, shadows } from "@/constants/Colors";

export default function HomeScreen() {
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

  return (
    <SafeAreaView style={styles.container}>
      {(pendingCount > 0 || failedCount > 0) && (
        <View style={styles.statusBar}>
          <QueueStatus pendingCount={pendingCount} failedCount={failedCount} />
        </View>
      )}

      <View style={styles.content}>
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
      </View>

      <View style={styles.fabRow}>
        <View style={styles.fabSpacer} />
        <Pressable
          onPress={handleStartRecording}
          disabled={hasPermission === false}
          style={({ pressed }) => [
            styles.fab,
            pressed && styles.fabPressed,
            hasPermission === false && styles.fabDisabled,
          ]}
        >
          <View style={styles.fabInner} />
        </Pressable>
        <View style={styles.fabSpacer}>
          <Link href="/settings" asChild>
            <Pressable style={styles.settingsButton}>
              <Ionicons name="settings-outline" size={24} color={colors.textSecondary} />
            </Pressable>
          </Link>
        </View>
      </View>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  statusBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  content: {
    flex: 1,
  },
  fabRow: {
    position: "absolute",
    bottom: 80,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  fabSpacer: {
    flex: 1,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  fab: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: colors.backgroundElevated,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 6,
    borderColor: colors.borderLight,
    ...shadows.md,
  },
  fabPressed: {
    transform: [{ scale: 0.95 }],
    borderColor: colors.error,
  },
  fabDisabled: {
    opacity: 0.5,
  },
  fabInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.error,
  },
  settingsButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.backgroundElevated,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
});
