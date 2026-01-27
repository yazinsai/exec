import { View, Text, StyleSheet } from "react-native";
import type { InstaQLEntity } from "@instantdb/react-native";
import type { AppSchema } from "@/instant.schema";
import { spacing, typography, radii, actionTypeColors, type ActionType } from "@/constants/Colors";
import { useColors } from "@/hooks/useThemeColors";

export type Action = InstaQLEntity<AppSchema, "actions">;

type ActionStatus = "pending" | "in_progress" | "completed" | "failed" | "cancelled";

interface StatusDisplay {
  label: string;
  color: string;
  bg: string;
}

interface ThemeColors {
  textTertiary: string;
  backgroundElevated: string;
  primary: string;
  success: string;
  error: string;
  warning: string;
}

function getStatusDisplay(action: Action, colors: ThemeColors): StatusDisplay {
  const status = action.status as ActionStatus;

  // Check if awaiting user feedback (has assistant message, user hasn't replied)
  if (action.messages) {
    try {
      const messages = JSON.parse(action.messages) as { role: string }[];
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage.role === "assistant" && status === "completed") {
          return { label: actionTypeColors.review.label, color: actionTypeColors.review.color, bg: actionTypeColors.review.bg };
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  switch (status) {
    case "pending":
      return { label: "Queued", color: colors.textTertiary, bg: colors.textMuted + "20" };
    case "in_progress":
      return { label: "Running", color: colors.primary, bg: colors.primary + "20" };
    case "completed":
      return { label: "Done", color: colors.success, bg: colors.success + "20" };
    case "failed":
      return { label: "Failed", color: colors.error, bg: colors.error + "20" };
    case "cancelled":
      return { label: "Stopped", color: colors.warning, bg: colors.warning + "20" };
    default:
      return { label: "Queued", color: colors.textTertiary, bg: colors.textMuted + "20" };
  }
}

interface ActionItemProps {
  action: Action;
}

export function ActionItem({ action }: ActionItemProps) {
  const colors = useColors();
  const typeConfig = actionTypeColors[action.type as ActionType] ?? actionTypeColors.note;
  const statusDisplay = getStatusDisplay(action, colors);

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
      <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
        {action.title}
      </Text>
      {action.description && (
        <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
          {action.description}
        </Text>
      )}
      {action.errorMessage && (
        <Text style={[styles.error, { color: colors.error }]} numberOfLines={2}>
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
    fontSize: typography.base,
    fontWeight: typography.medium,
    lineHeight: typography.base * 1.4,
  },
  description: {
    fontSize: typography.sm,
    marginTop: spacing.xs,
    lineHeight: typography.sm * 1.4,
  },
  error: {
    fontSize: typography.sm,
    marginTop: spacing.xs,
    lineHeight: typography.sm * 1.4,
  },
});
