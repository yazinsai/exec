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
import { spacing, typography, shadows, radii } from "@/constants/Colors";
import { useColors } from "@/hooks/useThemeColors";

interface RecordButtonProps {
  onRecordingComplete?: () => void;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function RecordButton({ onRecordingComplete }: RecordButtonProps) {
  const colors = useColors();
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
        <View style={[styles.recordButton, styles.buttonDisabled, { backgroundColor: colors.border, borderColor: colors.borderLight }]}>
          <Text style={[styles.permissionText, { color: colors.textTertiary }]}>Microphone access required</Text>
        </View>
      </View>
    );
  }

  // Active recording state - show controls
  if (isActive || isSaving) {
    return (
      <View style={styles.container}>
        <Text style={[styles.durationText, { color: colors.textPrimary }]}>{formatDuration(duration)}</Text>

        {isPaused && <Text style={[styles.pausedLabel, { color: colors.warning }]}>Paused</Text>}

        <View style={styles.controlsContainer}>
          {/* Pause/Resume Button */}
          <Pressable
            onPress={handlePauseResume}
            disabled={isSaving}
            style={({ pressed }) => [
              styles.controlButton,
              styles.pauseButton,
              { backgroundColor: colors.backgroundElevated, borderColor: colors.border },
              pressed && styles.controlButtonPressed,
              isSaving && styles.controlButtonDisabled,
            ]}
          >
            <View
              style={isPaused ? styles.resumeIcon : styles.pauseIcon}
            >
              {isPaused ? (
                <View style={[styles.playTriangle, { borderLeftColor: colors.success }]} />
              ) : (
                <>
                  <View style={[styles.pauseBar, { backgroundColor: colors.textPrimary }]} />
                  <View style={[styles.pauseBar, { backgroundColor: colors.textPrimary }]} />
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
              { backgroundColor: colors.error },
              pressed && styles.controlButtonPressed,
            ]}
          >
            {isSaving ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <View style={[styles.stopSquare, { backgroundColor: colors.white }]} />
            )}
          </Pressable>
        </View>

        <Text style={[styles.instructionText, { color: colors.textTertiary }]}>
          {isSaving ? "Saving..." : isPaused ? "Tap to resume or stop" : "Recording..."}
        </Text>
      </View>
    );
  }

  // Idle state - show record button (premium gold aesthetic)
  return (
    <View style={styles.container}>
      <View style={styles.buttonContainer}>
        <Animated.View style={[styles.pulseRing, { backgroundColor: colors.primary }, pulseAnimatedStyle]} />

        <Pressable
          onPress={handleStartRecording}
          style={({ pressed }) => [
            styles.recordButton,
            { backgroundColor: colors.backgroundElevated, borderColor: colors.primary },
            pressed && [styles.recordButtonPressed, { borderColor: colors.primaryLight }],
          ]}
        >
          <View style={[styles.innerCircle, { backgroundColor: colors.primary }]} />
        </Pressable>
      </View>

      <Text style={[styles.instructionText, { color: colors.textSecondary }]}>Tap to record</Text>
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
  },
  recordButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    ...shadows.md,
  },
  recordButtonPressed: {
    transform: [{ scale: 0.95 }],
  },
  buttonDisabled: {},
  innerCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  durationText: {
    fontSize: typography.display,
    fontWeight: typography.light,
    marginBottom: spacing.sm,
    fontVariant: ["tabular-nums"],
  },
  pausedLabel: {
    fontSize: typography.sm,
    fontWeight: typography.semibold,
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
    borderWidth: 2,
  },
  stopButton: {
    width: 88,
    height: 88,
    borderRadius: 44,
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
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
  },
  stopSquare: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
  },
  instructionText: {
    fontSize: typography.lg,
    marginTop: spacing.xl,
  },
  permissionText: {
    fontSize: typography.xs,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
});
