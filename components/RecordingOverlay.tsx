import { useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Waveform } from "./Waveform";
import { spacing, typography, radii, fontFamily } from "@/constants/Colors";
import { useColors } from "@/hooks/useThemeColors";

interface RecordingOverlayProps {
  isVisible: boolean;
  duration: number;
  metering: number;
  isRecording: boolean;
  isPaused: boolean;
  isSaving: boolean;
  onPauseResume: () => void;
  onStop: () => void;
  onDelete: () => void;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.0`;
}

export function RecordingOverlay({
  isVisible,
  duration,
  metering,
  isRecording,
  isPaused,
  isSaving,
  onPauseResume,
  onStop,
  onDelete,
}: RecordingOverlayProps) {
  const colors = useColors();
  const recordingDotOpacity = useSharedValue(1);
  const buttonScale = useSharedValue(1);

  useEffect(() => {
    if (isRecording && !isPaused) {
      recordingDotOpacity.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: 500, easing: Easing.out(Easing.exp) }),
          withTiming(1, { duration: 500, easing: Easing.out(Easing.exp) })
        ),
        -1,
        false
      );
    } else {
      recordingDotOpacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.exp) });
    }
  }, [isRecording, isPaused, recordingDotOpacity]);

  const dotAnimatedStyle = useAnimatedStyle(() => ({
    opacity: recordingDotOpacity.value,
  }));

  const handlePauseResume = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    buttonScale.value = withSequence(
      withTiming(0.9, { duration: 50, easing: Easing.out(Easing.exp) }),
      withTiming(1, { duration: 150, easing: Easing.out(Easing.exp) })
    );
    onPauseResume();
  };

  const handleStop = async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onStop();
  };

  const handleDelete = async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    onDelete();
  };

  if (!isVisible) {
    return null;
  }

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={[styles.overlay, { backgroundColor: colors.background }]}
    >
      <View style={styles.topSection}>
        <View style={styles.speechIndicator}>
          <Text style={[styles.speechText, { color: colors.primary }]}>
            {isPaused ? "Paused" : "Audio"}
          </Text>
        </View>
      </View>

      <View style={styles.waveformSection}>
        <Waveform
          metering={metering}
          isActive={isRecording && !isPaused}
          height={140}
          color={colors.primary}
        />
      </View>

      <View style={styles.bottomSection}>
        <View style={styles.durationContainer}>
          <Animated.View style={[styles.recordingDot, { backgroundColor: colors.error }, dotAnimatedStyle]} />
          <Text style={[styles.durationText, { color: colors.textPrimary }]}>{formatDuration(duration)}</Text>
        </View>

        <View style={styles.controls}>
          <Pressable
            onPress={handleDelete}
            disabled={isSaving}
            style={styles.textButton}
          >
            <Text style={[styles.textButtonLabel, { color: colors.error }]}>
              Delete
            </Text>
          </Pressable>

          <View style={styles.mainButtonContainer}>
            <Pressable
              onPress={handlePauseResume}
              disabled={isSaving}
              style={({ pressed }) => [
                styles.mainButton,
                { backgroundColor: colors.backgroundElevated, borderColor: colors.primary },
                pressed && styles.buttonPressed,
                isSaving && styles.buttonDisabled,
              ]}
            >
              <View style={[styles.mainButtonInner, { backgroundColor: colors.primary }]}>
                {isSaving ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : isPaused ? (
                  <View style={[styles.playIcon, { borderLeftColor: colors.white }]} />
                ) : (
                  <View style={styles.pauseIcon}>
                    <View style={[styles.pauseBar, { backgroundColor: colors.white }]} />
                    <View style={[styles.pauseBar, { backgroundColor: colors.white }]} />
                  </View>
                )}
              </View>
            </Pressable>
          </View>

          <Pressable
            onPress={handleStop}
            disabled={isSaving}
            style={styles.textButton}
          >
            <Text style={[styles.textButtonLabel, { color: colors.primary }]}>
              {isSaving ? "Saving..." : "Done"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    paddingTop: 60,
    paddingBottom: 40,
  },
  topSection: {
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  speechIndicator: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  speechText: {
    fontSize: typography.xs,
    fontFamily: fontFamily.semibold,
    fontWeight: typography.semibold,
    letterSpacing: typography.tracking.wider,
    textTransform: "uppercase",
  },
  waveformSection: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  bottomSection: {
    alignItems: "center",
    gap: spacing.lg,
  },
  durationContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  durationText: {
    fontSize: 36,
    fontFamily: fontFamily.light,
    fontWeight: typography.light,
    fontVariant: ["tabular-nums"],
    letterSpacing: typography.tracking.wide,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    width: "100%",
  },
  textButton: {
    width: 80,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  textButtonLabel: {
    fontSize: typography.lg,
    fontWeight: typography.medium,
  },
  mainButtonContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  mainButton: {
    width: 160,
    height: 160,
    borderRadius: 80,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 6,
  },
  mainButtonInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonPressed: {
    transform: [{ scale: 0.95 }],
    opacity: 0.9,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  pauseIcon: {
    flexDirection: "row",
    gap: 8,
  },
  pauseBar: {
    width: 8,
    height: 28,
    borderRadius: 3,
  },
  playIcon: {
    width: 0,
    height: 0,
    marginLeft: 5,
    borderLeftWidth: 24,
    borderTopWidth: 15,
    borderBottomWidth: 15,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
  },
});
