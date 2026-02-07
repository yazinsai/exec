import { View, Text, StyleSheet, Pressable, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { InstaQLEntity } from "@instantdb/react-native";
import type { AppSchema } from "@/instant.schema";
import { spacing, typography, radii, actionTypeColorsDark, actionTypeColorsLight, type ActionType } from "@/constants/Colors";
import { useThemeColors } from "@/hooks/useThemeColors";
import { getProjectLabel } from "@/lib/actionTimeline";

// Base action type from schema
type BaseAction = InstaQLEntity<AppSchema, "actions">;

// Extended action type with dependency relationship
export type Action = BaseAction & {
  dependsOn?: { id: string; title: string; status: string }[];
};

type ActionStatus = "pending" | "in_progress" | "awaiting_feedback" | "completed" | "failed" | "cancelled";

interface StatusDisplay {
  label: string;
  color: string;
  bg: string;
}

interface ThemeColors {
  textTertiary: string;
  textMuted: string;
  backgroundElevated: string;
  primary: string;
  success: string;
  error: string;
  warning: string;
}

function getStatusDisplay(action: Action, colors: ThemeColors, isDark: boolean): StatusDisplay {
  const status = action.status as ActionStatus;
  const typeColors = isDark ? actionTypeColorsDark : actionTypeColorsLight;

  // Check if awaiting user feedback (has assistant message, user hasn't replied)
  if (action.messages) {
    try {
      const messages = JSON.parse(action.messages) as { role: string }[];
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage.role === "assistant" && status === "completed") {
          return { label: typeColors.review.label, color: typeColors.review.color, bg: typeColors.review.bg };
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  // Light mode needs higher alpha for visibility
  const alpha = isDark ? "20" : "30";

  switch (status) {
    case "pending":
      return { label: "Queued", color: colors.textTertiary, bg: colors.textMuted + alpha };
    case "in_progress":
      return { label: "Running", color: colors.primary, bg: colors.primary + alpha };
    case "awaiting_feedback":
      return { label: "Awaiting Reply", color: colors.warning, bg: colors.warning + alpha };
    case "completed":
      return { label: "Done", color: colors.success, bg: colors.success + alpha };
    case "failed":
      return { label: "Failed", color: colors.error, bg: colors.error + alpha };
    case "cancelled":
      return { label: "Stopped", color: colors.warning, bg: colors.warning + alpha };
    default:
      return { label: "Queued", color: colors.textTertiary, bg: colors.textMuted + alpha };
  }
}

interface ActionItemProps {
  action: Action;
}

export function ActionItem({ action }: ActionItemProps) {
  const { colors, isDark } = useThemeColors();
  const typeColors = isDark ? actionTypeColorsDark : actionTypeColorsLight;
  const typeConfig = typeColors[action.type as ActionType] ?? typeColors.note;
  const statusDisplay = getStatusDisplay(action, colors, isDark);

  // Show unread indicator for completed/cancelled actions that haven't been viewed
  const isUnread = (action.status === "completed" || action.status === "cancelled") && !action.readAt;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.badges}>
          {isUnread && (
            <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
          )}
          <View style={[styles.typeBadge, { backgroundColor: typeConfig.bg }]}>
            <Text style={[styles.typeBadgeText, { color: typeConfig.color }]}>
              {typeConfig.label}
            </Text>
          </View>
          {action.type === "CodeChange" && action.subtype && (
            <View style={[styles.subtypeBadge, { backgroundColor: colors.textMuted + "20" }]}>
              <Text style={[styles.subtypeBadgeText, { color: colors.textSecondary }]}>
                {action.subtype}
              </Text>
            </View>
          )}
          {action.projectPath && (
            <View style={[styles.projectBadge, { backgroundColor: colors.primary + "15" }]}> 
              <Ionicons name="folder-outline" size={11} color={colors.primary} />
              <Text style={[styles.projectBadgeText, { color: colors.primary }]} numberOfLines={1}>
                {getProjectLabel(action.projectPath)}
              </Text>
            </View>
          )}
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
      {/* Show dependency info if waiting */}
      {action.dependsOn && action.dependsOn.length > 0 && action.status === "pending" && (
        <View style={[styles.dependencyInfo, { backgroundColor: colors.warning + "15" }]}>
          <Ionicons name="time-outline" size={12} color={colors.warning} />
          <Text style={[styles.dependencyText, { color: colors.warning }]} numberOfLines={1}>
            Waiting for: {action.dependsOn[0].title}
          </Text>
        </View>
      )}
      {/* Prominent result URL button */}
      {action.deployUrl && (
        <Pressable
          style={({ pressed }) => [
            styles.resultUrlButton,
            {
              // Use explicit blue color with fallback to ensure visibility
              backgroundColor: colors.primary || "#3b82f6",
              // Add subtle shadow in light mode for better visibility
              ...(isDark ? {} : {
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.15,
                shadowRadius: 4,
                elevation: 3,
              }),
            },
            pressed && styles.resultUrlButtonPressed,
          ]}
          onPress={(e) => {
            e.stopPropagation();
            Linking.openURL(action.deployUrl!);
          }}
        >
          <View style={styles.resultUrlButtonContent}>
            <Ionicons name="open-outline" size={16} color={colors.white} style={styles.resultUrlIcon} />
            <Text style={[styles.resultUrlButtonText, { color: colors.white }]}>
              {action.deployUrlLabel || "Open App"}
            </Text>
          </View>
        </Pressable>
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
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
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
  subtypeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  subtypeBadgeText: {
    fontSize: typography.xs,
    fontWeight: typography.medium,
    textTransform: "capitalize",
  },
  projectBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: 140,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  projectBadgeText: {
    fontSize: 10,
    fontWeight: "600",
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
  dependencyInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
  },
  dependencyText: {
    fontSize: typography.xs,
    flex: 1,
  },
  resultUrlButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
  },
  resultUrlButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  resultUrlIcon: {
    marginRight: spacing.sm,
  },
  resultUrlButtonPressed: {
    opacity: 0.8,
  },
  resultUrlButtonText: {
    fontSize: typography.sm,
    fontWeight: "600",
  },
});
