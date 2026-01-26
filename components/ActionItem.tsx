import { View, Text, StyleSheet } from "react-native";
import type { InstaQLEntity } from "@instantdb/react-native";
import type { AppSchema } from "@/instant.schema";
import { colors, spacing, typography, radii } from "@/constants/Colors";

export type Action = InstaQLEntity<AppSchema, "actions">;

type ActionType = "bug" | "feature" | "todo" | "note" | "question" | "command" | "idea";
type ActionStatus = "pending" | "in_progress" | "completed" | "failed";
type LongrunStatus = "running" | "completed" | "awaiting_feedback" | "failed";

const TYPE_CONFIG: Record<ActionType, { label: string; color: string; bg: string }> = {
  bug: { label: "BUG", color: "#fca5a5", bg: "#7f1d1d" },
  feature: { label: "FEATURE", color: "#93c5fd", bg: "#1e3a5f" },
  todo: { label: "TODO", color: "#86efac", bg: "#14532d" },
  note: { label: "NOTE", color: "#d1d5db", bg: "#374151" },
  question: { label: "?", color: "#fcd34d", bg: "#78350f" },
  command: { label: "CMD", color: "#c4b5fd", bg: "#4c1d95" },
  idea: { label: "IDEA", color: "#fbbf24", bg: "#92400e" },
};

const LONGRUN_STATUS_CONFIG: Record<LongrunStatus, { label: string; color: string }> = {
  running: { label: "Running...", color: colors.primary },
  completed: { label: "Done", color: colors.success },
  awaiting_feedback: { label: "Awaiting Feedback", color: "#fbbf24" },
  failed: { label: "Failed", color: colors.error },
};

const STATUS_CONFIG: Record<ActionStatus, { color: string }> = {
  pending: { color: colors.textTertiary },
  in_progress: { color: colors.primary },
  completed: { color: colors.success },
  failed: { color: colors.error },
};

interface ActionItemProps {
  action: Action;
}

export function ActionItem({ action }: ActionItemProps) {
  const typeConfig = TYPE_CONFIG[action.type as ActionType] ?? TYPE_CONFIG.note;
  const statusConfig = STATUS_CONFIG[action.status as ActionStatus] ?? STATUS_CONFIG.pending;
  const longrunConfig = action.longrunStatus
    ? LONGRUN_STATUS_CONFIG[action.longrunStatus as LongrunStatus]
    : null;

  const isIdea = action.type === "idea";

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.typeBadge, { backgroundColor: typeConfig.bg }]}>
            <Text style={[styles.typeBadgeText, { color: typeConfig.color }]}>
              {typeConfig.label}
            </Text>
          </View>
          {isIdea && longrunConfig && (
            <View style={[styles.longrunBadge, { borderColor: longrunConfig.color }]}>
              <Text style={[styles.longrunBadgeText, { color: longrunConfig.color }]}>
                {longrunConfig.label}
              </Text>
            </View>
          )}
        </View>
        <View style={[styles.statusDot, { backgroundColor: statusConfig.color }]} />
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {action.title}
      </Text>
      {action.description && (
        <Text style={styles.description} numberOfLines={2}>
          {action.description}
        </Text>
      )}
      {isIdea && action.longrunStatus === "awaiting_feedback" && (
        <Text style={styles.feedbackHint}>Tap to view results and provide feedback</Text>
      )}
      {action.result && (
        <Text style={styles.result} numberOfLines={2}>
          {action.result}
        </Text>
      )}
      {action.errorMessage && (
        <Text style={styles.error} numberOfLines={2}>
          {action.errorMessage}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  typeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  typeBadgeText: {
    fontSize: typography.xs,
    fontWeight: typography.semibold,
    letterSpacing: 0.5,
  },
  longrunBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  longrunBadgeText: {
    fontSize: typography.xs,
    fontWeight: typography.medium,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.base,
    fontWeight: typography.medium,
    lineHeight: typography.base * 1.4,
  },
  description: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    marginTop: spacing.xs,
    lineHeight: typography.sm * 1.4,
  },
  result: {
    color: colors.success,
    fontSize: typography.sm,
    marginTop: spacing.xs,
    lineHeight: typography.sm * 1.4,
  },
  error: {
    color: colors.error,
    fontSize: typography.sm,
    marginTop: spacing.xs,
    lineHeight: typography.sm * 1.4,
  },
  feedbackHint: {
    color: "#fbbf24",
    fontSize: typography.xs,
    marginTop: spacing.sm,
    fontStyle: "italic",
  },
});
