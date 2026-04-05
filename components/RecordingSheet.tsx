import { useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { Waveform } from "./Waveform";
import { useColors } from "@/hooks/useThemeColors";
import { spacing, typography, radii, fontFamily } from "@/constants/Colors";

const SHEET_HEIGHT = 280;

interface RecordingSheetProps {
  isVisible: boolean;
  duration: number;
  metering: number;
  isRecording: boolean;
  isPaused: boolean;
  isSaving: boolean;
  error: string | null;
  onDone: () => void;
  onPause: () => void;
  onResume: () => void;
  onDelete: () => void;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.0`;
}

export function RecordingSheet({
  isVisible,
  duration,
  metering,
  isRecording,
  isPaused,
  isSaving,
  error,
  onDone,
  onPause,
  onResume,
  onDelete,
}: RecordingSheetProps) {
  const colors = useColors();
  const translateY = useSharedValue(SHEET_HEIGHT);
  const backdropOpacity = useSharedValue(0);

  // Pulsing recording dot
  const dotOpacity = useSharedValue(1);
  useEffect(() => {
    if (isRecording && !isPaused) {
      dotOpacity.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: 500, easing: Easing.out(Easing.exp) }),
          withTiming(1, { duration: 500, easing: Easing.out(Easing.exp) })
        ),
        -1,
        false
      );
    } else {
      dotOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [isRecording, isPaused, dotOpacity]);

  // Slide in/out
  useEffect(() => {
    if (isVisible) {
      translateY.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) });
      backdropOpacity.value = withTiming(1, { duration: 200 });
    } else {
      translateY.value = withTiming(SHEET_HEIGHT, { duration: 200, easing: Easing.in(Easing.cubic) });
      backdropOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [isVisible, translateY, backdropOpacity]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const dotStyle = useAnimatedStyle(() => ({
    opacity: dotOpacity.value,
  }));

  // Swipe down gesture to dismiss (cancel recording)
  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (e.translationY > 80) {
        translateY.value = withTiming(SHEET_HEIGHT, { duration: 200, easing: Easing.in(Easing.cubic) });
        backdropOpacity.value = withTiming(0, { duration: 200 });
        runOnJS(onDelete)();
      } else {
        translateY.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
      }
    })
    .enabled(!isSaving);

  if (!isVisible) return null;

  const controlsDisabled = isSaving || !!error;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colors.overlay },
          backdropStyle,
        ]}
        pointerEvents="auto"
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={() => {}} />
      </Animated.View>

      {/* Sheet */}
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            {
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: SHEET_HEIGHT,
              backgroundColor: colors.backgroundElevated,
              borderTopLeftRadius: radii.xl,
              borderTopRightRadius: radii.xl,
              paddingHorizontal: spacing.xl,
              paddingTop: spacing.md,
              paddingBottom: spacing.xl,
            },
            sheetStyle,
          ]}
        >
          {/* Drag handle */}
          <View style={{ alignItems: "center", marginBottom: spacing.lg }}>
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.textMuted,
              }}
            />
          </View>

          {error ? (
            /* Error state */
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
              <Text
                style={{
                  color: colors.error,
                  fontSize: typography.base,
                  fontFamily: fontFamily.medium,
                  textAlign: "center",
                }}
              >
                {error}
              </Text>
            </View>
          ) : isSaving ? (
            /* Transcribing state */
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.md }}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: typography.base,
                  fontFamily: fontFamily.medium,
                }}
              >
                Transcribing...
              </Text>
            </View>
          ) : (
            /* Recording state */
            <>
              {/* Recording indicator + duration */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: spacing.md,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <Animated.View
                    style={[
                      {
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: isPaused ? colors.warning : colors.error,
                      },
                      dotStyle,
                    ]}
                  />
                  <Text
                    style={{
                      color: colors.textPrimary,
                      fontSize: typography.sm,
                      fontFamily: fontFamily.medium,
                    }}
                  >
                    {isPaused ? "Paused" : "Recording"}
                  </Text>
                </View>
                <Text
                  style={{
                    color: colors.textPrimary,
                    fontSize: typography.lg,
                    fontFamily: fontFamily.light,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {formatDuration(duration)}
                </Text>
              </View>

              {/* Waveform */}
              <View style={{ flex: 1, justifyContent: "center" }}>
                <Waveform
                  metering={metering}
                  isActive={isRecording}
                  height={100}
                  color={colors.primary}
                />
              </View>

              {/* Controls */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingTop: spacing.md,
                }}
              >
                <Pressable onPress={onDelete} hitSlop={12} style={{ width: 60 }}>
                  <Text
                    style={{
                      color: colors.error,
                      fontSize: typography.lg,
                      fontFamily: fontFamily.medium,
                    }}
                  >
                    Delete
                  </Text>
                </Pressable>

                <Pressable
                  onPress={isPaused ? onResume : onPause}
                  hitSlop={12}
                  style={({ pressed }) => ({
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: isPaused
                      ? colors.primary
                      : colors.backgroundPressed,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Ionicons
                    name={isPaused ? "play" : "pause"}
                    size={22}
                    color={isPaused ? colors.black : colors.textPrimary}
                  />
                </Pressable>

                <Pressable onPress={onDone} hitSlop={12} style={{ width: 60, alignItems: "flex-end" }}>
                  <Text
                    style={{
                      color: colors.primary,
                      fontSize: typography.lg,
                      fontFamily: fontFamily.medium,
                    }}
                  >
                    Done
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
