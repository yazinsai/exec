import { useEffect, useRef } from "react";
import { View, Text, Pressable, Animated, Easing } from "react-native";
import { useColors } from "@/hooks/useThemeColors";
import { spacing, typography, fontFamily, radii } from "@/constants/Colors";
import { formatTaskStatusLabel, TASK_STATUSES } from "@/lib/workflow";

interface TaskListItemProps {
  title: string;
  status: string;
  projectLabel?: string | null;
  createdAt: number;
  onPress: () => void;
}

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function getStatusDotColor(status: string, colors: ReturnType<typeof useColors>) {
  switch (status) {
    case TASK_STATUSES.running:
      return colors.statusRunning;
    case TASK_STATUSES.done:
      return colors.statusDone;
    case TASK_STATUSES.failed:
      return colors.statusFailed;
    case TASK_STATUSES.cancelled:
      return colors.statusCancelled;
    case TASK_STATUSES.pending:
    case TASK_STATUSES.blocked:
      return colors.statusPending;
    default:
      return colors.statusPending;
  }
}

function PulsingDot({ color }: { color: string }) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: color,
        opacity,
      }}
    />
  );
}

export function TaskListItem({
  title,
  status,
  projectLabel,
  createdAt,
  onPress,
}: TaskListItemProps) {
  const colors = useColors();
  const isRunning = status === TASK_STATUSES.running;
  const isDone = status === TASK_STATUSES.done;
  const dotColor = getStatusDotColor(status, colors);
  const metaParts = [projectLabel, formatTaskStatusLabel(status)].filter(Boolean);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        position: "relative",
        alignSelf: "stretch",
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.lg,
        borderRadius: radii.sm,
        backgroundColor: isRunning
          ? "rgba(59, 130, 246, 0.08)"
          : "transparent",
        opacity: pressed ? 0.7 : isDone ? 0.6 : 1,
      })}
    >
      <View
        style={{
          width: 20,
          alignItems: "center",
          justifyContent: "center",
          marginRight: spacing.sm,
        }}
      >
        {isRunning ? (
          <PulsingDot color={dotColor} />
        ) : (
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: dotColor,
            }}
          />
        )}
      </View>

      <View style={{ flex: 1, paddingRight: 72 }}>
        <Text
          numberOfLines={1}
          style={{
            color: isDone ? colors.textTertiary : colors.textPrimary,
            fontSize: typography.base,
            fontFamily: fontFamily.medium,
            lineHeight: 21,
            textDecorationLine: isDone ? "line-through" : "none",
          }}
        >
          {title}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: isRunning ? colors.statusRunning : colors.textTertiary,
            fontSize: typography.xs,
            fontFamily: fontFamily.regular,
            marginTop: spacing.xs,
          }}
        >
          {metaParts.join(" • ")}
        </Text>
      </View>

      <View
        style={{
          position: "absolute",
          right: spacing.sm,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <Text
          style={{
            color: colors.textTertiary,
            fontSize: typography.xs,
            fontFamily: fontFamily.regular,
          }}
        >
          {relativeTime(createdAt)}
        </Text>
      </View>
    </Pressable>
  );
}
