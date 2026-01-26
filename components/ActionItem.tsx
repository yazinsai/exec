import { View, Text, StyleSheet } from "react-native";
import type { InstaQLEntity } from "@instantdb/react-native";
import type { AppSchema } from "@/instant.schema";
import { colors, spacing, typography, radii } from "@/constants/Colors";

export type Action = InstaQLEntity<AppSchema, "actions">;

type ActionType = "bug" | "feature" | "todo" | "note" | "question" | "command" | "idea";
type ActionStatus = "pending" | "in_progress" | "completed" | "failed";

const TYPE_CONFIG: Record<ActionType, { label: string; color: string; bg: string }> = {
  bug: { label: "BUG", color: "#fca5a5", bg: "#7f1d1d" },
  feature: { label: "FEATURE", color: "#93c5fd", bg: "#1e3a5f" },
  todo: { label: "TODO", color: "#86efac", bg: "#14532d" },
  note: { label: "NOTE", color: "#d1d5db", bg: "#374151" },
  question: { label: "?", color: "#fcd34d", bg: "#78350f" },
  command: { label: "CMD", color: "#c4b5fd", bg: "#4c1d95" },
  idea: { label: "IDEA", color: "#fbbf24", bg: "#92400e" },
};

interface StatusDisplay {
  label: string;
  color: string;
  bg: string;
}

function getStatusDisplay(action: Action): StatusDisplay {
  const status = action.status as ActionStatus;

  // Check if awaiting user feedback (has assistant message, user hasn't replied)
  if (action.messages) {
    try {
      const messages = JSON.parse(action.messages) as { role: string }[];
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage.role === "assistant" && status === "completed") {
          return { label: "Review", color: "#fbbf24", bg: "#78350f" };
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  switch (status) {
    case "pending":
      return { label: "Queued", color: colors.textTertiary, bg: colors.backgroundElevated };
    case "in_progress":
      return { label: "Running", color: colors.primary, bg: colors.primary + "20" };
    case "completed":
      return { label: "Done", color: colors.success, bg: colors.success + "20" };
    case "failed":
      return { label: "Failed", color: colors.error, bg: colors.error + "20" };
    default:
      return { label: "Queued", color: colors.textTertiary, bg: colors.backgroundElevated };
  }
}

interface ActionItemProps {
  action: Action;
}

export function ActionItem({ action }: ActionItemProps) {
  const typeConfig = TYPE_CONFIG[action.type as ActionType] ?? TYPE_CONFIG.note;
  const statusDisplay = getStatusDisplay(action);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.badges}>
          <View style={[styles.typeBadge, { backgroundColor: typeConfig.bg }]}>
            <Text style={[styles.typeBadgeText, { color: typeConfig.color }]}>
              {typeConfig.label}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusDisplay.bg }]}>
            <Text style={[styles.statusBadgeText, { color: statusDisplay.color }]}>
              {statusDisplay.label}
            </Text>
          </View>
        </View>
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {action.title}
      </Text>
      {action.description && (
        <Text style={styles.description} numberOfLines={2}>
          {action.description}
        </Text>
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
  badges: {
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
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  statusBadgeText: {
    fontSize: typography.xs,
    fontWeight: typography.medium,
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
});
