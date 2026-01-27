import { useState, useMemo } from "react";
import { View, Text, SectionList, StyleSheet, Pressable, Alert, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ActionItem, type Action } from "./ActionItem";
import { spacing, typography, radii } from "@/constants/Colors";
import { useThemeColors } from "@/hooks/useThemeColors";

interface ActionsScreenProps {
  actions: Action[];
  onActionPress?: (action: Action) => void;
}

type ViewMode = "timeline" | "type" | "status";
type ActionType = "bug" | "feature" | "todo" | "note" | "question" | "command" | "idea";
type ActionStatus = "pending" | "in_progress" | "completed" | "failed" | "cancelled";

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

const STATUS_ORDER: ActionStatus[] = ["in_progress", "pending", "completed", "cancelled", "failed"];
const STATUS_LABELS: Record<ActionStatus, string> = {
  pending: "Pending",
  in_progress: "Running",
  completed: "Completed",
  cancelled: "Stopped",
  failed: "Failed",
};

type Section = {
  title: string;
  type?: ActionType;
  key: string;
  data: Action[];
  isRunning?: boolean;
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
      key: type,
      data: grouped.get(type) || [],
    }));
}

function groupActionsByStatus(actions: Action[]): Section[] {
  const grouped = new Map<ActionStatus, Action[]>();

  for (const action of actions) {
    const status = action.status as ActionStatus;
    const existing = grouped.get(status) || [];
    grouped.set(status, [...existing, action]);
  }

  return STATUS_ORDER
    .filter((status) => grouped.has(status))
    .map((status) => ({
      title: STATUS_LABELS[status],
      key: `status-${status}`,
      data: grouped.get(status) || [],
      isRunning: status === "in_progress",
    }));
}

function groupActionsForTimeline(actions: Action[]): Section[] {
  const running: Action[] = [];
  const rest: Action[] = [];

  for (const action of actions) {
    if (action.status === "in_progress") {
      running.push(action);
    } else {
      rest.push(action);
    }
  }

  // Sort running by startedAt (most recent first), rest by extractedAt
  running.sort((a, b) => (b.startedAt ?? b.extractedAt) - (a.startedAt ?? a.extractedAt));
  rest.sort((a, b) => b.extractedAt - a.extractedAt);

  const sections: Section[] = [];

  if (running.length > 0) {
    sections.push({
      title: "Running",
      key: "running",
      data: running,
      isRunning: true,
    });
  }

  if (rest.length > 0) {
    sections.push({
      title: "All Actions",
      key: "all",
      data: rest,
    });
  }

  return sections;
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
  const { colors, isDark } = useThemeColors();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.backgroundElevated },
        !isDark && styles.cardLightShadow,
        pressed && styles.cardPressed,
      ]}
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
      <Text style={[styles.cardTime, { color: colors.textMuted }]}>{formatRelativeTime(action.extractedAt)}</Text>
    </Pressable>
  );
}

interface ViewToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

function ViewToggle({ value, onChange }: ViewToggleProps) {
  const { colors, isDark } = useThemeColors();
  return (
    <View style={[styles.toggleContainer, { backgroundColor: colors.backgroundElevated }, !isDark && styles.toggleLightBorder]}>
      <Pressable
        style={[styles.toggleOption, value === "timeline" && { backgroundColor: colors.background }]}
        onPress={() => onChange("timeline")}
      >
        <Ionicons
          name="time-outline"
          size={16}
          color={value === "timeline" ? colors.primary : colors.textTertiary}
        />
        <Text style={[styles.toggleText, { color: colors.textTertiary }, value === "timeline" && { color: colors.primary }]}>
          Timeline
        </Text>
      </Pressable>
      <Pressable
        style={[styles.toggleOption, value === "type" && { backgroundColor: colors.background }]}
        onPress={() => onChange("type")}
      >
        <Ionicons
          name="layers-outline"
          size={16}
          color={value === "type" ? colors.primary : colors.textTertiary}
        />
        <Text style={[styles.toggleText, { color: colors.textTertiary }, value === "type" && { color: colors.primary }]}>
          By Type
        </Text>
      </Pressable>
      <Pressable
        style={[styles.toggleOption, value === "status" && { backgroundColor: colors.background }]}
        onPress={() => onChange("status")}
      >
        <Ionicons
          name="pulse-outline"
          size={16}
          color={value === "status" ? colors.primary : colors.textTertiary}
        />
        <Text style={[styles.toggleText, { color: colors.textTertiary }, value === "status" && { color: colors.primary }]}>
          By Status
        </Text>
      </Pressable>
    </View>
  );
}

export function ActionsScreen({ actions, onActionPress }: ActionsScreenProps) {
  const { colors, isDark } = useThemeColors();
  const [viewMode, setViewMode] = useState<ViewMode>("timeline");
  const [searchQuery, setSearchQuery] = useState("");

  // Filter actions by search query
  const filteredActions = useMemo(() => {
    if (!searchQuery.trim()) return actions;
    const query = searchQuery.toLowerCase();
    return actions.filter((action) => {
      return (
        action.title.toLowerCase().includes(query) ||
        action.description?.toLowerCase().includes(query) ||
        action.type.toLowerCase().includes(query) ||
        action.result?.toLowerCase().includes(query)
      );
    });
  }, [actions, searchQuery]);

  const sections = useMemo(() => {
    switch (viewMode) {
      case "timeline":
        return groupActionsForTimeline(filteredActions);
      case "type":
        return groupActionsByType(filteredActions);
      case "status":
        return groupActionsByStatus(filteredActions);
    }
  }, [viewMode, filteredActions]);

  if (actions.length === 0) {
    return (
      <View style={styles.empty}>
        <View style={[styles.emptyIcon, { backgroundColor: colors.backgroundElevated }]}>
          <Ionicons name="flash-outline" size={48} color={colors.textTertiary} />
        </View>
        <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No actions yet</Text>
        <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
          Record a voice note and actions{"\n"}will be extracted automatically
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={[styles.searchInputWrapper, { backgroundColor: colors.backgroundElevated }, !isDark && styles.searchLightBorder]}>
          <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder="Search actions..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")} style={styles.clearButton}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* View Toggle */}
      <ViewToggle value={viewMode} onChange={setViewMode} />

      {filteredActions.length === 0 ? (
        <View style={styles.noResults}>
          <Text style={[styles.noResultsText, { color: colors.textTertiary }]}>No actions match "{searchQuery}"</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ActionCard action={item} onPress={() => onActionPress?.(item)} />
          )}
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHeader, { backgroundColor: colors.background }, section.isRunning && styles.sectionHeaderRunning]}>
              {section.isRunning && (
                <View style={[styles.runningIndicator, { backgroundColor: colors.primary + "30" }]}>
                  <View style={[styles.runningDot, { backgroundColor: colors.primary }]} />
                </View>
              )}
              <Text style={[styles.sectionHeaderText, { color: colors.textSecondary }, section.isRunning && { color: colors.primary }]}>
                {section.title}
              </Text>
              <View style={[
                styles.sectionBadge,
                { backgroundColor: isDark ? colors.backgroundElevated : colors.textMuted + "25" },
                section.isRunning && { backgroundColor: colors.primary + "20" },
              ]}>
                <Text style={[styles.sectionBadgeText, { color: colors.textTertiary }, section.isRunning && { color: colors.primary }]}>
                  {section.data.length}
                </Text>
              </View>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          SectionSeparatorComponent={() => <View style={styles.sectionSeparator} />}
          stickySectionHeadersEnabled
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
  },
  searchLightBorder: {
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.08)",
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.md,
    fontSize: typography.base,
  },
  clearButton: {
    padding: spacing.xs,
  },
  toggleContainer: {
    flexDirection: "row",
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radii.lg,
    padding: 4,
  },
  toggleLightBorder: {
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.08)",
  },
  toggleOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
  toggleText: {
    fontSize: typography.sm,
    fontWeight: "500",
  },
  list: {
    paddingBottom: 160,
  },
  sectionHeader: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  sectionHeaderRunning: {
    // Running section has subtle highlight
  },
  sectionHeaderText: {
    fontSize: typography.sm,
    fontWeight: typography.semibold,
    letterSpacing: 0.3,
  },
  runningIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  runningDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  sectionBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  sectionBadgeText: {
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
    borderRadius: radii.lg,
    overflow: "hidden",
  },
  cardLightShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  cardPressed: {
    opacity: 0.8,
  },
  cardTime: {
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
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: typography.lg,
    fontWeight: typography.medium,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    fontSize: typography.base,
    textAlign: "center",
    lineHeight: typography.base * 1.5,
  },
  noResults: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
  },
  noResultsText: {
    fontSize: typography.base,
    textAlign: "center",
  },
});
