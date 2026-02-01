import { useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Image,
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
import { spacing, typography, radii } from "@/constants/Colors";
import { useColors } from "@/hooks/useThemeColors";
import type { PendingImage } from "@/hooks/useShareIntent";

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
  pendingImages?: PendingImage[];
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
  pendingImages,
}: RecordingOverlayProps) {
  const colors = useColors();
  const recordingDotOpacity = useSharedValue(1);
  const buttonScale = useSharedValue(1);

  const hasImages = pendingImages && pendingImages.length > 0;

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
      style={[styles.overlay, { backgroundColor: colors.background }]}
    >
      <View style={styles.topSection}>
        {hasImages ? (
          <View style={styles.imageContextContainer}>
            <View style={styles.thumbnailRow}>
              {pendingImages.slice(0, 3).map((img, idx) => (
                <Image
                  key={img.id}
                  source={{ uri: img.localPath }}
                  style={[
                    styles.thumbnail,
                    { borderColor: colors.primary },
                    idx > 0 && { marginLeft: -12 },
                  ]}
                />
              ))}
              {pendingImages.length > 3 && (
                <View style={[styles.thumbnailMore, { backgroundColor: colors.backgroundElevated, borderColor: colors.primary }]}>
                  <Text style={[styles.thumbnailMoreText, { color: colors.textSecondary }]}>
                    +{pendingImages.length - 3}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[styles.contextText, { color: colors.textSecondary }]}>
              Add voice context for your {pendingImages.length === 1 ? "screenshot" : "screenshots"}
            </Text>
          </View>
        ) : (
          <View style={styles.speechIndicator}>
            <Text style={[styles.speechText, { color: colors.primary }]}>
              {isPaused ? "Paused" : "Audio"}
            </Text>
          </View>
        )}
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
    fontSize: typography.base,
    fontWeight: typography.medium,
  },
  imageContextContainer: {
    alignItems: "center",
    gap: spacing.md,
  },
  thumbnailRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    borderWidth: 2,
  },
  thumbnailMore: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    borderWidth: 2,
    marginLeft: -12,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbnailMoreText: {
    fontSize: typography.sm,
    fontWeight: typography.semibold,
  },
  contextText: {
    fontSize: typography.base,
    fontWeight: typography.medium,
    textAlign: "center",
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    borderWidth: 1,
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
    fontSize: typography.sm,
    fontWeight: typography.medium,
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
    fontSize: 32,
    fontWeight: typography.medium,
    fontVariant: ["tabular-nums"],
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
