import { useEffect } from "react";
import { View, Pressable, Text, StyleSheet, ActivityIndicator } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  cancelAnimation,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useRecorder } from "@/hooks/useRecorder";
import { colors, spacing, typography, shadows, radii } from "@/constants/Colors";

interface RecordButtonProps {
  onRecordingComplete?: () => void;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function RecordButton({ onRecordingComplete }: RecordButtonProps) {
  const {
    duration,
    hasPermission,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    isRecording,
    isPaused,
    isSaving,
    isActive,
  } = useRecorder(onRecordingComplete);

  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0);

  useEffect(() => {
    if (isRecording) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.15, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
      pulseOpacity.value = withTiming(0.4, { duration: 300 });
    } else {
      cancelAnimation(pulseScale);
      pulseScale.value = withTiming(1, { duration: 200 });
      pulseOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [isRecording, pulseScale, pulseOpacity]);

  const pulseAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const handleStartRecording = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    startRecording();
  };

  const handleStopRecording = async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    stopRecording();
  };

  const handlePauseResume = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isPaused) {
      resumeRecording();
    } else {
      pauseRecording();
    }
  };

  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <View style={[styles.recordButton, styles.buttonDisabled]}>
          <Text style={styles.permissionText}>Microphone access required</Text>
        </View>
      </View>
    );
  }

  // Active recording state - show controls
  if (isActive || isSaving) {
    return (
      <View style={styles.container}>
        <Text style={styles.durationText}>{formatDuration(duration)}</Text>

        {isPaused && <Text style={styles.pausedLabel}>Paused</Text>}

        <View style={styles.controlsContainer}>
          {/* Pause/Resume Button */}
          <Pressable
            onPress={handlePauseResume}
            disabled={isSaving}
            style={({ pressed }) => [
              styles.controlButton,
              styles.pauseButton,
              pressed && styles.controlButtonPressed,
              isSaving && styles.controlButtonDisabled,
            ]}
          >
            <View
              style={isPaused ? styles.resumeIcon : styles.pauseIcon}
            >
              {isPaused ? (
                <View style={styles.playTriangle} />
              ) : (
                <>
                  <View style={styles.pauseBar} />
                  <View style={styles.pauseBar} />
                </>
              )}
            </View>
          </Pressable>

          {/* Stop Button */}
          <Pressable
            onPress={handleStopRecording}
            disabled={isSaving}
            style={({ pressed }) => [
              styles.controlButton,
              styles.stopButton,
              pressed && styles.controlButtonPressed,
            ]}
          >
            {isSaving ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <View style={styles.stopSquare} />
            )}
          </Pressable>
        </View>

        <Text style={styles.instructionText}>
          {isSaving ? "Saving..." : isPaused ? "Tap to resume or stop" : "Recording..."}
        </Text>
      </View>
    );
  }

  // Idle state - show record button
  return (
    <View style={styles.container}>
      <View style={styles.buttonContainer}>
        <Animated.View style={[styles.pulseRing, pulseAnimatedStyle]} />

        <Pressable
          onPress={handleStartRecording}
          style={({ pressed }) => [
            styles.recordButton,
            pressed && styles.recordButtonPressed,
          ]}
        >
          <View style={styles.innerCircle} />
        </Pressable>
      </View>

      <Text style={styles.instructionText}>Tap to record</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  buttonContainer: {
    alignItems: "center",
    justifyContent: "center",
    width: 160,
    height: 160,
  },
  pulseRing: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: colors.error,
  },
  recordButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.backgroundElevated,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: colors.border,
    ...shadows.md,
  },
  recordButtonPressed: {
    transform: [{ scale: 0.95 }],
    borderColor: colors.error,
  },
  buttonDisabled: {
    backgroundColor: colors.border,
    borderColor: colors.borderLight,
  },
  innerCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.error,
  },
  durationText: {
    fontSize: typography.display,
    fontWeight: typography.light,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    fontVariant: ["tabular-nums"],
  },
  pausedLabel: {
    fontSize: typography.sm,
    fontWeight: typography.semibold,
    color: colors.warning,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: spacing.xl,
  },
  controlsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    marginTop: spacing.lg,
  },
  controlButton: {
    alignItems: "center",
    justifyContent: "center",
    ...shadows.sm,
  },
  controlButtonPressed: {
    transform: [{ scale: 0.95 }],
    opacity: 0.9,
  },
  controlButtonDisabled: {
    opacity: 0.5,
  },
  pauseButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.backgroundElevated,
    borderWidth: 2,
    borderColor: colors.border,
  },
  stopButton: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.error,
  },
  pauseIcon: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  pauseBar: {
    width: 5,
    height: 18,
    backgroundColor: colors.textPrimary,
    borderRadius: 2,
  },
  resumeIcon: {
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 3,
  },
  playTriangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 16,
    borderTopWidth: 10,
    borderBottomWidth: 10,
    borderLeftColor: colors.success,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
  },
  stopSquare: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    backgroundColor: colors.white,
  },
  instructionText: {
    fontSize: typography.lg,
    color: colors.textTertiary,
    marginTop: spacing.xl,
  },
  permissionText: {
    fontSize: typography.xs,
    color: colors.textTertiary,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
});
