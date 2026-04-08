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
  read?: boolean;
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

function getStatusColor(status: string, colors: ReturnType<typeof useColors>) {
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

export function TaskListItem({
  title,
  status,
  projectLabel,
  createdAt,
  read = true,
  onPress,
}: TaskListItemProps) {
  const colors = useColors();
  const isRunning = status === TASK_STATUSES.running;
  const isDone = status === TASK_STATUSES.done;
  const isUnread = read === false;
  const statusColor = getStatusColor(status, colors);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.lg,
        borderRadius: radii.sm,
        backgroundColor: isRunning
          ? "rgba(59, 130, 246, 0.08)"
          : "transparent",
        opacity: pressed ? 0.7 : isDone ? 0.6 : 1,
      })}
    >
      {/* Unread indicator */}
      {isUnread && (
        <View
          style={{
            width: 7,
            height: 7,
            borderRadius: 3.5,
            backgroundColor: colors.primary,
            marginRight: spacing.xs,
            flexShrink: 0,
          }}
        />
      )}

      {/* Title + project label */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={2}
          style={{
            color: isDone ? colors.textTertiary : colors.textPrimary,
            fontSize: typography.base,
            fontFamily: isUnread ? fontFamily.semibold : fontFamily.medium,
            lineHeight: 21,
            textDecorationLine: isDone ? "line-through" : "none",
          }}
        >
          {title}
        </Text>
        {projectLabel && (
          <Text
            numberOfLines={1}
            style={{
              color: colors.textTertiary,
              fontSize: typography.xs,
              fontFamily: fontFamily.regular,
              marginTop: 2,
            }}
          >
            {projectLabel}
          </Text>
        )}
      </View>

      {/* Right side: timestamp + status */}
      <View
        style={{
          alignItems: "flex-end",
          marginLeft: spacing.md,
          flexShrink: 0,
        }}
      >
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: typography.sm,
            fontFamily: fontFamily.regular,
          }}
        >
          {relativeTime(createdAt)}
        </Text>
        <Text
          style={{
            color: statusColor,
            fontSize: typography.xs,
            fontFamily: fontFamily.medium,
            marginTop: 2,
          }}
        >
          {formatTaskStatusLabel(status)}
        </Text>
      </View>
    </Pressable>
  );
}
