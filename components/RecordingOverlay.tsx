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
import { colors, spacing, typography, radii } from "@/constants/Colors";

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
  const tenths = 0;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${tenths}`;
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
  const recordingDotOpacity = useSharedValue(1);
  const buttonScale = useSharedValue(1);

  useEffect(() => {
    if (isRecording && !isPaused) {
      recordingDotOpacity.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: 500, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
    } else {
      recordingDotOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [isRecording, isPaused, recordingDotOpacity]);

  const dotAnimatedStyle = useAnimatedStyle(() => ({
    opacity: recordingDotOpacity.value,
  }));

  const handlePauseResume = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    buttonScale.value = withSequence(
      withTiming(0.9, { duration: 50 }),
      withTiming(1, { duration: 100 })
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
      style={styles.overlay}
    >
      <View style={styles.topSection}>
        <View style={styles.speechIndicator}>
          <Text style={styles.speechText}>
            {isPaused ? "Paused" : "Audio"}
          </Text>
        </View>
      </View>

      <View style={styles.waveformSection}>
        <Waveform
          metering={metering}
          isActive={isRecording && !isPaused}
          barCount={50}
          height={140}
          color={colors.primary}
        />
      </View>

      <View style={styles.bottomSection}>
        <View style={styles.audioBadge}>
          <View style={styles.audioBadgeIcon}>
            <View style={styles.soundBars}>
              <View style={[styles.soundBar, styles.soundBar1]} />
              <View style={[styles.soundBar, styles.soundBar2]} />
              <View style={[styles.soundBar, styles.soundBar3]} />
            </View>
          </View>
          <Text style={styles.audioBadgeText}>Audio</Text>
        </View>

        <View style={styles.durationContainer}>
          <Animated.View style={[styles.recordingDot, dotAnimatedStyle]} />
          <Text style={styles.durationText}>{formatDuration(duration)}</Text>
        </View>

        <View style={styles.controls}>
          <Pressable
            onPress={handleDelete}
            disabled={isSaving}
            style={styles.textButton}
          >
            <Text style={[styles.textButtonLabel, styles.deleteLabel]}>
              Delete
            </Text>
          </Pressable>

          <Pressable
            onPress={handlePauseResume}
            disabled={isSaving}
            style={({ pressed }) => [
              styles.mainButton,
              pressed && styles.buttonPressed,
              isSaving && styles.buttonDisabled,
            ]}
          >
            {isSaving ? (
              <ActivityIndicator color={colors.white} size="large" />
            ) : isPaused ? (
              <View style={styles.playIcon} />
            ) : (
              <View style={styles.pauseIcon}>
                <View style={styles.pauseBar} />
                <View style={styles.pauseBar} />
              </View>
            )}
          </Pressable>

          <Pressable
            onPress={handleStop}
            disabled={isSaving}
            style={styles.textButton}
          >
            <Text style={[styles.textButtonLabel, styles.doneLabel]}>
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
    backgroundColor: colors.background,
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
    color: colors.primary,
    fontSize: typography.base,
    fontWeight: typography.medium,
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
  audioBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.backgroundElevated,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  audioBadgeIcon: {
    width: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  soundBars: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  soundBar: {
    width: 2,
    backgroundColor: colors.primary,
    borderRadius: 1,
  },
  soundBar1: {
    height: 6,
  },
  soundBar2: {
    height: 10,
  },
  soundBar3: {
    height: 6,
  },
  audioBadgeText: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontWeight: typography.medium,
  },
  durationContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error,
  },
  durationText: {
    color: colors.textPrimary,
    fontSize: typography.lg,
    fontWeight: typography.medium,
    fontVariant: ["tabular-nums"],
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xl,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
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
  deleteLabel: {
    color: colors.error,
  },
  doneLabel: {
    color: colors.primary,
  },
  mainButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.error,
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
    height: 32,
    backgroundColor: colors.white,
    borderRadius: 3,
  },
  playIcon: {
    width: 0,
    height: 0,
    marginLeft: 6,
    borderLeftWidth: 28,
    borderTopWidth: 18,
    borderBottomWidth: 18,
    borderLeftColor: colors.white,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
  },
});
