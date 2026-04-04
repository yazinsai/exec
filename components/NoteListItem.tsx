import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useThemeColors";
import { fontFamily, radii, spacing, typography } from "@/constants/Colors";
import { TaskListItem } from "@/components/TaskListItem";
import {
  computeTaskStatusCounts,
  formatNoteAggregateSummary,
  NOTE_STATUSES,
} from "@/lib/workflow";

type ChildTask = {
  id: string;
  title: string;
  status: string;
  createdAt: number;
  projectLabel?: string | null;
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
}: NoteListItemProps) {
  const colors = useColors();
  const counts = computeTaskStatusCounts(tasks);
  const aggregate = formatNoteAggregateSummary(status, counts);

  return (
    <View
      style={{
        backgroundColor: colors.backgroundElevated,
        borderRadius: radii.lg,
        borderWidth: 1,
        borderColor: colors.borderLight,
        overflow: "hidden",
      }}
    >
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => ({
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.lg,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: spacing.md,
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={2}
              style={{
                color: colors.textPrimary,
                fontSize: typography.md,
                fontFamily: fontFamily.medium,
                lineHeight: 23,
              }}
            >
              {title}
            </Text>

            <Text
              numberOfLines={2}
              style={{
                color: colors.textSecondary,
                fontSize: typography.sm,
                fontFamily: fontFamily.regular,
                lineHeight: 19,
                marginTop: spacing.xs,
              }}
            >
              {aggregate}
            </Text>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
                marginTop: spacing.sm,
              }}
            >
              <Text
                style={{
                  color: colors.textTertiary,
                  fontSize: typography.xs,
                  fontFamily: fontFamily.semibold,
                  textTransform: "uppercase",
                  letterSpacing: typography.tracking.wider,
                }}
              >
                {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
              </Text>

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
          </View>

          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={colors.textTertiary}
          />
        </View>
      </Pressable>

      {expanded && (
        <View
          style={{
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.lg,
            borderTopWidth: 1,
            borderTopColor: colors.borderLight,
          }}
        >
          {tasks.length > 0 ? (
            tasks.map((task, index) => (
              <View
                key={task.id}
                style={{
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: colors.borderLight,
                }}
              >
                <TaskListItem
                  title={task.title}
                  status={task.status}
                  projectLabel={task.projectLabel}
                  createdAt={task.createdAt}
                  onPress={() => onOpenTask(task.id)}
                />
              </View>
            ))
          ) : (
            <View style={{ paddingTop: spacing.lg }}>
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
              ) : null}
            </View>
          )}
        </View>
      )}
    </View>
  );
}
