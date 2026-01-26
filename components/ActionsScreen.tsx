import { View, Text, SectionList, StyleSheet, Pressable, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ActionItem, type Action } from "./ActionItem";
import { colors, spacing, typography, radii } from "@/constants/Colors";

interface ActionsScreenProps {
  actions: Action[];
  onActionPress?: (action: Action) => void;
}

type ActionType = "bug" | "feature" | "todo" | "note" | "question" | "command" | "idea";

const TYPE_ORDER: ActionType[] = ["idea", "bug", "todo", "feature", "question", "command", "note"];
const TYPE_LABELS: Record<ActionType, string> = {
  bug: "Bugs",
  feature: "Features",
  todo: "To-Do",
  note: "Notes",
  question: "Questions",
  command: "Commands",
  idea: "Ideas",
};

type Section = {
  title: string;
  type: ActionType;
  data: Action[];
};

function groupActionsByType(actions: Action[]): Section[] {
  const grouped = new Map<ActionType, Action[]>();

  for (const action of actions) {
    const type = action.type as ActionType;
    const existing = grouped.get(type) || [];
    grouped.set(type, [...existing, action]);
  }

  return TYPE_ORDER
    .filter((type) => grouped.has(type))
    .map((type) => ({
      title: TYPE_LABELS[type],
      type,
      data: grouped.get(type) || [],
    }));
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function ActionCard({ action, onPress }: { action: Action; onPress?: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      onLongPress={() => {
        Alert.alert(
          action.title,
          action.description || "No description",
          [{ text: "OK" }]
        );
      }}
    >
      <ActionItem action={action} />
      <Text style={styles.cardTime}>{formatRelativeTime(action.extractedAt)}</Text>
    </Pressable>
  );
}

export function ActionsScreen({ actions, onActionPress }: ActionsScreenProps) {
  const sections = groupActionsByType(actions);
  const totalCount = actions.length;
  const pendingCount = actions.filter((a) => a.status === "pending").length;

  if (actions.length === 0) {
    return (
      <View style={styles.empty}>
        <View style={styles.emptyIcon}>
          <Ionicons name="flash-outline" size={48} color={colors.textTertiary} />
        </View>
        <Text style={styles.emptyTitle}>No actions yet</Text>
        <Text style={styles.emptySubtitle}>
          Record a voice note and actions{"\n"}will be extracted automatically
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Stats Header */}
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{totalCount}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: colors.warning }]}>{pendingCount}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ActionCard action={item} onPress={() => onActionPress?.(item)} />
        )}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>{section.title}</Text>
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionBadgeText}>{section.data.length}</Text>
            </View>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        SectionSeparatorComponent={() => <View style={styles.sectionSeparator} />}
        stickySectionHeadersEnabled
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  statsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    gap: spacing.xl,
  },
  statItem: {
    alignItems: "center",
  },
  statNumber: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  statLabel: {
    fontSize: typography.xs,
    color: colors.textTertiary,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
  },
  list: {
    paddingBottom: 160,
    paddingHorizontal: spacing.lg,
  },
  sectionHeader: {
    backgroundColor: colors.background,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  sectionHeaderText: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontWeight: typography.semibold,
    letterSpacing: 0.3,
  },
  sectionBadge: {
    backgroundColor: colors.backgroundElevated,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  sectionBadgeText: {
    color: colors.textTertiary,
    fontSize: typography.xs,
    fontWeight: typography.medium,
  },
  separator: {
    height: spacing.sm,
  },
  sectionSeparator: {
    height: spacing.sm,
  },
  card: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: radii.lg,
    overflow: "hidden",
  },
  cardPressed: {
    opacity: 0.8,
  },
  cardTime: {
    color: colors.textMuted,
    fontSize: typography.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    marginTop: -spacing.xs,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    paddingBottom: 120,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.backgroundElevated,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: typography.lg,
    fontWeight: typography.medium,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    color: colors.textTertiary,
    fontSize: typography.base,
    textAlign: "center",
    lineHeight: typography.base * 1.5,
  },
});
