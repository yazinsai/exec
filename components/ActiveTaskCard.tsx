import { useState, useEffect, useRef } from "react";
import { View, Text, Pressable } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useThemeColors";
import {
  spacing,
  typography,
  radii,
  fontFamily,
  shadows,
} from "@/constants/Colors";

interface ActiveTaskCardProps {
  title: string;
  status: "running" | "pending" | "transcribing" | "transcription_failed";
  startedAt?: number | null;
  createdAt: number;
  cancelRequested?: boolean | null;
  errorMessage?: string | null;
  onView: () => void;
  onRetry?: () => void;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m ${totalSeconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function ActiveTaskCard({
  title,
  status,
  startedAt,
  createdAt,
  cancelRequested,
  errorMessage,
  onView,
  onRetry,
}: ActiveTaskCardProps) {
  const colors = useColors();
  const isRunning = status === "running";
  const isTranscribing = status === "transcribing";
  const isTranscriptionFailed = status === "transcription_failed";
  const borderColor = isTranscriptionFailed
    ? colors.statusFailed
    : isTranscribing
      ? colors.warning
      : isRunning
        ? colors.statusRunning
        : colors.statusPending;

  // Pulse animation for running/transcribing tasks
  const borderOpacity = useSharedValue(1);
  useEffect(() => {
    if (isRunning || isTranscribing) {
      borderOpacity.value = withRepeat(
        withSequence(
          withTiming(0.4, { duration: 400, easing: Easing.out(Easing.exp) }),
          withTiming(1, { duration: 400, easing: Easing.out(Easing.exp) })
        ),
        -1,
        false
      );
    } else {
      borderOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [isRunning, isTranscribing, borderOpacity]);

  const borderAnimatedStyle = useAnimatedStyle(() => ({
    opacity: borderOpacity.value,
  }));

  // Elapsed time ticker (only for running tasks)
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isRunning) {
      const origin = startedAt ?? createdAt;
      setElapsed(Date.now() - origin);
      intervalRef.current = setInterval(() => {
        setElapsed(Date.now() - origin);
      }, 1000);
    } else {
      setElapsed(0);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, startedAt, createdAt]);

  const statusLabel = isTranscriptionFailed
    ? "Transcription Failed"
    : isTranscribing
      ? "Transcribing..."
      : isRunning
        ? "Executing"
        : "Queued";
  const statusColor = borderColor;

  return (
    <Pressable
      onPress={onView}
      style={({ pressed }) => ({
        flexDirection: "row",
        backgroundColor: colors.backgroundElevated,
        borderRadius: radii.lg,
        overflow: "hidden",
        ...shadows.sm,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {/* Animated left border */}
      <Animated.View
        style={[
          {
            width: 3,
            backgroundColor: borderColor,
          },
          borderAnimatedStyle,
        ]}
      />

      {/* Card content */}
      <View style={{ flex: 1, padding: spacing.md, gap: spacing.xs }}>
        {/* Title */}
        <Text
          numberOfLines={2}
          style={{
            color: colors.textPrimary,
            fontSize: typography.base,
            fontFamily: fontFamily.medium,
            lineHeight: 21,
          }}
        >
          {title}
        </Text>

        {/* Status line + actions */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              style={{
                color: statusColor,
                fontSize: typography.xs,
                fontFamily: fontFamily.medium,
                letterSpacing: 0.3,
              }}
            >
              {statusLabel}
              {isRunning ? ` · ${formatElapsed(elapsed)}` : ""}
            </Text>
            {isTranscriptionFailed && errorMessage && (
              <Text
                numberOfLines={1}
                style={{
                  color: colors.textTertiary,
                  fontSize: typography.xs,
                  fontFamily: fontFamily.regular,
                }}
              >
                {errorMessage}
              </Text>
            )}
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            {isTranscriptionFailed && onRetry && (
              <Pressable onPress={onRetry} hitSlop={8}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="refresh" size={14} color={colors.primary} />
                  <Text
                    style={{
                      color: colors.primary,
                      fontSize: typography.xs,
                      fontFamily: fontFamily.medium,
                    }}
                  >
                    Retry
                  </Text>
                </View>
              </Pressable>
            )}

            {cancelRequested && (
              <Text
                style={{
                  color: colors.warning,
                  fontSize: typography.xs,
                  fontFamily: fontFamily.regular,
                }}
              >
                Cancelling...
              </Text>
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );
}
