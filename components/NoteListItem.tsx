import { useEffect, useRef } from "react";
import { Pressable, Text, View, Animated, Easing } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useThemeColors";
import { fontFamily, radii, spacing, typography } from "@/constants/Colors";
import { TaskListItem } from "@/components/TaskListItem";
import {
  computeTaskStatusCounts,
  formatNoteAggregateSummary,
  NOTE_STATUSES,
  TASK_STATUSES,
} from "@/lib/workflow";

type ChildTask = {
  id: string;
  title: string;
  status: string;
  createdAt: number;
  projectLabel?: string | null;
  read?: boolean;
};

interface NoteListItemProps {
  title: string;
  transcript: string;
  status: string;
  createdAt: number;
  tasks: ChildTask[];
  expanded: boolean;
  onToggle: () => void;
  onOpenTask: (taskId: string) => void;
  onRetryTranscription?: () => void;
  onRetryExtraction?: () => void;
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

function RunningIndicator({ count, colors }: { count: number; colors: ReturnType<typeof useColors> }) {
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
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginTop: spacing.sm,
      }}
    >
      <Animated.View
        style={{
          width: 7,
          height: 7,
          borderRadius: 3.5,
          backgroundColor: colors.statusRunning,
          opacity,
        }}
      />
      <Text
        style={{
          color: colors.statusRunning,
          fontSize: typography.xs,
          fontFamily: fontFamily.medium,
        }}
      >
        {count} {count === 1 ? "task" : "tasks"} running
      </Text>
    </View>
  );
}

export function NoteListItem({
  title,
  transcript,
  status,
  createdAt,
  tasks,
  expanded,
  onToggle,
  onOpenTask,
  onRetryTranscription,
  onRetryExtraction,
}: NoteListItemProps) {
  const colors = useColors();
  const counts = computeTaskStatusCounts(tasks);
  const hasRunning = counts.running > 0;
  const unreadCount = tasks.filter((t) => t.read === false).length;
  const aggregate = formatNoteAggregateSummary(status, counts);

  // Build compact meta: "4 / 5 done • 2h ago" or status summary for non-done states
  const taskSummary = counts.total > 0
    ? (counts.running > 0
        ? `${counts.running} running`
        : counts.failed > 0
          ? `${counts.failed} failed`
          : counts.blocked > 0
            ? `${counts.blocked} blocked`
            : `${counts.done} / ${counts.total} done`)
    : aggregate;
  const metaParts = [
    taskSummary,
    relativeTime(createdAt),
  ].filter(Boolean);

  return (
    <View
      style={{
        backgroundColor: colors.backgroundElevated,
        borderRadius: radii.md,
        borderWidth: expanded ? 1 : hasRunning ? 1 : 0,
        borderColor: hasRunning ? "rgba(59, 130, 246, 0.25)" : colors.border,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.lg,
          paddingBottom: expanded ? 0 : spacing.lg,
        }}
      >
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => ({
          paddingVertical: spacing.sm,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: spacing.sm,
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={2}
              style={{
                color: colors.textPrimary,
                fontSize: typography.md,
                fontFamily: fontFamily.medium,
                lineHeight: 21,
              }}
            >
              {title}
            </Text>

            <Text
              numberOfLines={1}
              style={{
                color: colors.textSecondary,
                fontSize: typography.xs,
                fontFamily: fontFamily.regular,
                lineHeight: 16,
                marginTop: 6,
              }}
            >
              {metaParts.join(" • ")}
            </Text>

            {hasRunning && !expanded && (
              <RunningIndicator count={counts.running} colors={colors} />
            )}
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {unreadCount > 0 && !expanded && (
              <View
                style={{
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 5,
                }}
              >
                <Text
                  style={{
                    color: colors.black,
                    fontSize: 11,
                    fontFamily: fontFamily.semibold,
                    lineHeight: 14,
                  }}
                >
                  {unreadCount}
                </Text>
              </View>
            )}
            <Ionicons
              name={expanded ? "chevron-up" : "chevron-down"}
              size={18}
              color={colors.textTertiary}
            />
          </View>
        </View>
      </Pressable>

      {expanded && (
        <View
          style={{
            paddingBottom: spacing.lg,
          }}
        >
          {tasks.length > 0 ? (
            <View
              style={{
                marginTop: spacing.sm,
                backgroundColor: colors.backgroundSubtle,
                borderRadius: radii.md,
                borderWidth: 1,
                borderColor: colors.borderLight,
                overflow: "hidden",
              }}
            >
              {tasks.map((task, index) => (
                <View
                  key={task.id}
                  style={{
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: colors.borderLight,
                  }}
                >
                  <TaskListItem
                    density="nested"
                    title={task.title}
                    status={task.status}
                    projectLabel={task.projectLabel}
                    createdAt={task.createdAt}
                    read={task.read}
                    onPress={() => onOpenTask(task.id)}
                  />
                </View>
              ))}
            </View>
          ) : (
            <View
              style={{
                marginTop: spacing.md,
                backgroundColor: colors.backgroundSubtle,
                borderRadius: radii.md,
                borderWidth: 1,
                borderColor: colors.borderLight,
                padding: spacing.lg,
              }}
            >
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: typography.sm,
                  fontFamily: fontFamily.regular,
                  lineHeight: 20,
                }}
              >
                {transcript || "No transcript available yet."}
              </Text>

              {status === NOTE_STATUSES.transcriptionFailed && onRetryTranscription ? (
                <Pressable
                  onPress={onRetryTranscription}
                  style={({ pressed }) => ({
                    alignSelf: "flex-start",
                    marginTop: spacing.md,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                    borderRadius: radii.md,
                    backgroundColor: colors.primaryAlpha20,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Text
                    style={{
                      color: colors.primary,
                      fontSize: typography.sm,
                      fontFamily: fontFamily.medium,
                    }}
                  >
                    Retry transcription
                  </Text>
                </Pressable>
              ) : status === NOTE_STATUSES.triageFailed && onRetryExtraction ? (
                <Pressable
                  onPress={onRetryExtraction}
                  style={({ pressed }) => ({
                    alignSelf: "flex-start",
                    marginTop: spacing.md,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                    borderRadius: radii.md,
                    backgroundColor: colors.primaryAlpha20,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Text
                    style={{
                      color: colors.primary,
                      fontSize: typography.sm,
                      fontFamily: fontFamily.medium,
                    }}
                  >
                    Retry extraction
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </View>
      )}
      </View>
    </View>
  );
}
