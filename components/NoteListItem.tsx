import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View, Animated, Easing } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useThemeColors";
import { fontFamily, radii, spacing, typography } from "@/constants/Colors";
import { StepTaskRow } from "@/components/StepTaskRow";
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
  blockedReason?: string | null;
  errorMessage?: string | null;
  extractionIndex?: number | null;
  resultSnippet?: string | null;
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
  onRetryTask?: (taskId: string) => void;
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
        {count} Running
      </Text>
    </View>
  );
}

function buildCardSubline(
  counts: ReturnType<typeof computeTaskStatusCounts>,
  createdAt: number,
  aggregate: string
): string {
  if (counts.total === 0) {
    return `${aggregate} · updated ${relativeTime(createdAt)}`;
  }
  const parts: string[] = [];
  parts.push(`${counts.total} step${counts.total === 1 ? "" : "s"}`);
  if (counts.running) parts.push(`${counts.running} Running`);
  if (counts.blocked) parts.push(`${counts.blocked} Blocked`);
  if (counts.failed) parts.push(`${counts.failed} Failed`);
  if (
    !counts.running &&
    !counts.blocked &&
    !counts.failed &&
    counts.done === counts.total
  ) {
    parts.push("All done");
  } else if (counts.done > 0 && !counts.running) {
    parts.push(`${counts.done}/${counts.total} Done`);
  }
  parts.push(`updated ${relativeTime(createdAt)}`);
  return parts.join(" · ");
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
  onRetryTask,
  onRetryTranscription,
  onRetryExtraction,
}: NoteListItemProps) {
  const colors = useColors();
  const counts = computeTaskStatusCounts(tasks);
  const hasRunning = counts.running > 0;
  const aggregate = formatNoteAggregateSummary(status, counts);
  const subline = buildCardSubline(counts, createdAt, aggregate);

  const orderedTasks = [...tasks].sort(
    (a, b) => (a.extractionIndex ?? 999) - (b.extractionIndex ?? 999)
  );
  const totalSteps = orderedTasks.length;
  const projectSlugs = orderedTasks
    .map((t) => (t.projectLabel || "").trim())
    .filter(Boolean);
  const showProjectPerRow =
    orderedTasks.length === 1 || new Set(projectSlugs).size > 1;

  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  useEffect(() => {
    if (!expanded) setExpandedStepId(null);
  }, [expanded]);

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
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          paddingBottom: expanded ? 0 : spacing.md,
        }}
      >
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => ({
          paddingVertical: spacing.xs,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
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
                fontFamily: fontFamily.semibold,
                lineHeight: 22,
              }}
            >
              {title}
            </Text>
            <Text
              numberOfLines={2}
              style={{
                marginTop: 4,
                color: colors.textSecondary,
                fontSize: typography.xs,
                fontFamily: fontFamily.regular,
                lineHeight: 16,
              }}
            >
              {subline}
            </Text>

            {(counts.failed > 0 ||
              counts.blocked > 0 ||
              counts.running > 0 ||
              counts.pending > 0) && (
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 6,
                  marginTop: spacing.sm,
                }}
              >
                {counts.running > 0 ? (
                  <View
                    style={{
                      paddingHorizontal: spacing.sm,
                      paddingVertical: 3,
                      borderRadius: 6,
                      backgroundColor: "rgba(59, 130, 246, 0.15)",
                    }}
                  >
                    <Text
                      style={{
                        color: colors.statusRunning,
                        fontSize: 10,
                        fontFamily: fontFamily.semibold,
                        letterSpacing: 0.2,
                      }}
                    >
                      {counts.running} Running
                    </Text>
                  </View>
                ) : null}
                {counts.pending > 0 ? (
                  <View
                    style={{
                      paddingHorizontal: spacing.sm,
                      paddingVertical: 3,
                      borderRadius: 6,
                      backgroundColor: "rgba(113, 113, 122, 0.2)",
                    }}
                  >
                    <Text
                      style={{
                        color: colors.textSecondary,
                        fontSize: 10,
                        fontFamily: fontFamily.semibold,
                        letterSpacing: 0.2,
                      }}
                    >
                      {counts.pending} Queued
                    </Text>
                  </View>
                ) : null}
                {counts.blocked > 0 ? (
                  <View
                    style={{
                      paddingHorizontal: spacing.sm,
                      paddingVertical: 3,
                      borderRadius: 6,
                      backgroundColor: "rgba(245, 158, 11, 0.12)",
                    }}
                  >
                    <Text
                      style={{
                        color: colors.warning,
                        fontSize: 10,
                        fontFamily: fontFamily.semibold,
                        letterSpacing: 0.2,
                      }}
                    >
                      {counts.blocked} Blocked
                    </Text>
                  </View>
                ) : null}
                {counts.failed > 0 ? (
                  <View
                    style={{
                      paddingHorizontal: spacing.sm,
                      paddingVertical: 3,
                      borderRadius: 6,
                      backgroundColor: "rgba(239, 68, 68, 0.12)",
                    }}
                  >
                    <Text
                      style={{
                        color: colors.statusFailed,
                        fontSize: 10,
                        fontFamily: fontFamily.semibold,
                        letterSpacing: 0.2,
                      }}
                    >
                      {counts.failed} Failed
                    </Text>
                  </View>
                ) : null}
              </View>
            )}

            {hasRunning && !expanded && (
              <RunningIndicator count={counts.running} colors={colors} />
            )}
          </View>

          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={colors.textTertiary}
            style={{ marginTop: 2, flexShrink: 0 }}
          />
        </View>
      </Pressable>

      {expanded && (
        <View
          style={{
            paddingBottom: spacing.md,
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
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
                gap: spacing.sm,
              }}
            >
              {orderedTasks.map((task, index) => (
                <View key={task.id}>
                  <StepTaskRow
                    title={task.title}
                    status={task.status}
                    stepIndex={index + 1}
                    totalSteps={totalSteps}
                    projectLabel={task.projectLabel}
                    showProject={showProjectPerRow}
                    blockedReason={task.blockedReason}
                    errorMessage={task.errorMessage}
                    resultSnippet={task.resultSnippet}
                    read={task.read}
                    expanded={expandedStepId === task.id}
                    onToggleExpand={() =>
                      setExpandedStepId((id) =>
                        id === task.id ? null : task.id
                      )
                    }
                    onPress={() => onOpenTask(task.id)}
                    onRetry={
                      task.status === TASK_STATUSES.failed && onRetryTask
                        ? () => onRetryTask(task.id)
                        : undefined
                    }
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
