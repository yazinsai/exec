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
import type { ThemeColors } from "@/constants/Colors";

interface ActiveTaskCardProps {
  title: string;
  status: "running" | "pending";
  startedAt?: number | null;
  createdAt: number;
  cancelRequested?: boolean | null;
  onView: () => void;
  onCancel: () => void;
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
  onView,
  onCancel,
}: ActiveTaskCardProps) {
  const colors = useColors();
  const isRunning = status === "running";
  const borderColor = isRunning ? colors.statusRunning : colors.statusPending;

  // Pulse animation for running tasks
  const borderOpacity = useSharedValue(1);
  useEffect(() => {
    if (isRunning) {
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
  }, [isRunning, borderOpacity]);

  const borderAnimatedStyle = useAnimatedStyle(() => ({
    opacity: borderOpacity.value,
  }));

  // Elapsed time ticker
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

  const statusLabel = isRunning ? "Executing" : "Queued";
  const statusColor = borderColor;

  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: colors.backgroundElevated,
        borderRadius: radii.lg,
        overflow: "hidden",
        ...shadows.sm,
      }}
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

          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <Pressable onPress={onView} hitSlop={8}>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: typography.xs,
                  fontFamily: fontFamily.medium,
                }}
              >
                View
              </Text>
            </Pressable>

            {isRunning && !cancelRequested && (
              <Pressable onPress={onCancel} hitSlop={8}>
                <Ionicons name="close" size={16} color={colors.textTertiary} />
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
    </View>
  );
}
