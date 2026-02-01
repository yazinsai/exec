import { useState, useMemo } from "react";
import { View, Text, SectionList, StyleSheet, Pressable, Alert, TextInput, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ActionItem, type Action } from "./ActionItem";
import { DotPattern } from "./DotPattern";
import { spacing, typography, radii, fontFamily, actionTypeColorsDark, actionTypeColorsLight } from "@/constants/Colors";
import { useThemeColors } from "@/hooks/useThemeColors";
import { db } from "@/lib/db";

// Action types and subtypes
const ACTION_TYPES = ["CodeChange", "Project", "Research", "Write", "UserTask"] as const;
const CODE_CHANGE_SUBTYPES = ["bug", "feature", "refactor"] as const;
type ActionTypeFilter = typeof ACTION_TYPES[number] | "all";
type CodeChangeSubtype = typeof CODE_CHANGE_SUBTYPES[number] | "all";

interface ActionsScreenProps {
  actions: Action[];
  onActionPress?: (action: Action) => void;
}

type TabMode = "review" | "active" | "done";

// Categorization helpers
function needsReview(action: Action): boolean {
  // Only explicit awaiting_feedback status needs review
  if (action.status === "awaiting_feedback") return true;

  // Failed actions need explicit dismiss
  if (action.status === "failed") return true;

  return false;
}

function isActive(action: Action): boolean {
  return action.status === "in_progress" || action.status === "pending";
}

function isDone(action: Action): boolean {
  // Completed and cancelled go directly to Done
  return action.status === "completed" || action.status === "cancelled";
}

function categorizeAction(action: Action): TabMode {
  if (needsReview(action)) return "review";
  if (isActive(action)) return "active";
  return "done";
}

type Section = {
  title: string;
  key: string;
  data: Action[];
  isRunning?: boolean;
};

function groupActionsForTab(actions: Action[], tab: TabMode): Section[] {
  // Filter actions by tab category
  const filtered = actions.filter((action) => categorizeAction(action) === tab);

  // Sort by appropriate timestamp
  const sorted = [...filtered].sort((a, b) => {
    if (tab === "active") {
      // Active: sort by startedAt or extractedAt (most recent first)
      return (b.startedAt ?? b.extractedAt) - (a.startedAt ?? a.extractedAt);
    }
    if (tab === "review") {
      // Review: sort by completedAt or extractedAt (most recent first)
      return (b.completedAt ?? b.extractedAt) - (a.completedAt ?? a.extractedAt);
    }
    // Done: sort by completedAt or extractedAt (most recent first)
    return (b.completedAt ?? b.extractedAt) - (a.completedAt ?? a.extractedAt);
  });

  if (sorted.length === 0) return [];

  // For Active tab, split running and pending
  if (tab === "active") {
    const running = sorted.filter((a) => a.status === "in_progress");
    const pending = sorted.filter((a) => a.status === "pending");

    const sections: Section[] = [];
    if (running.length > 0) {
      sections.push({
        title: "Running",
        key: "running",
        data: running,
        isRunning: true,
      });
    }
    if (pending.length > 0) {
      sections.push({
        title: "Queued",
        key: "pending",
        data: pending,
      });
    }
    return sections;
  }

  // For Review tab, split failed and awaiting review
  if (tab === "review") {
    const failed = sorted.filter((a) => a.status === "failed");
    const awaiting = sorted.filter((a) => a.status !== "failed");

    const sections: Section[] = [];
    if (failed.length > 0) {
      sections.push({
        title: "Failed",
        key: "failed",
        data: failed,
      });
    }
    if (awaiting.length > 0) {
      sections.push({
        title: "Awaiting Review",
        key: "awaiting",
        data: awaiting,
      });
    }
    return sections;
  }

  // For Done tab, single section
  return [{
    title: "Completed",
    key: "done",
    data: sorted,
  }];
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

function ActionCard({ action, onPress, onDismiss }: { action: Action; onPress?: () => void; onDismiss?: () => void }) {
  const { colors, isDark } = useThemeColors();
  const isFailed = action.status === "failed";

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.backgroundElevated },
        !isDark && [styles.cardLightShadow, { borderColor: colors.border }],
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
      <View style={styles.cardFooter}>
        <Text style={[styles.cardTime, { color: colors.textMuted }]}>{formatRelativeTime(action.extractedAt)}</Text>
        {isFailed && onDismiss && (
          <View style={styles.cardActions}>
            <Pressable
              style={[styles.dismissButton, { backgroundColor: colors.error + "15" }]}
              onPress={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
            >
              <Text style={[styles.dismissButtonText, { color: colors.error }]}>Dismiss</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Pressable>
  );
}

interface TabBarProps {
  value: TabMode;
  onChange: (mode: TabMode) => void;
  counts: { review: number; active: number; done: number };
}

function TabBar({ value, onChange, counts }: TabBarProps) {
  const { colors, isDark } = useThemeColors();

  const tabs: { key: TabMode; label: string; count: number; badgeColor: string }[] = [
    { key: "review", label: "Review", count: counts.review, badgeColor: colors.warning },
    { key: "active", label: "Active", count: counts.active, badgeColor: colors.primary },
    { key: "done", label: "Done", count: counts.done, badgeColor: colors.textMuted },
  ];

  return (
    <View style={styles.tabBarContainer}>
      <View style={[styles.tabBar, { backgroundColor: colors.backgroundElevated }, !isDark && [styles.tabBarLightBorder, { borderColor: colors.border }]]}>
        {tabs.map((tab) => {
          const isSelected = value === tab.key;
          return (
            <Pressable
              key={tab.key}
              style={[styles.tab, isSelected && styles.tabSelected]}
              onPress={() => onChange(tab.key)}
            >
              <View style={styles.tabContent}>
                <Text style={[
                  styles.tabLabel,
                  { color: isSelected ? colors.textPrimary : colors.textTertiary },
                  isSelected && { fontWeight: "600" },
                ]}>
                  {tab.label}
                </Text>
                {tab.count > 0 && (
                  <View style={[styles.badge, { backgroundColor: tab.badgeColor + "25" }]}>
                    <Text style={[styles.badgeText, { color: tab.badgeColor }]}>
                      {tab.count > 99 ? "99+" : tab.count}
                    </Text>
                  </View>
                )}
              </View>
              {isSelected && (
                <View style={[styles.tabIndicator, { backgroundColor: colors.primary }]} />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// Type filter chips
interface TypeFilterProps {
  selectedType: ActionTypeFilter;
  selectedSubtype: CodeChangeSubtype;
  onTypeChange: (type: ActionTypeFilter) => void;
  onSubtypeChange: (subtype: CodeChangeSubtype) => void;
  typeCounts: Record<ActionTypeFilter, number>;
  subtypeCounts: Record<CodeChangeSubtype, number>;
}

function TypeFilter({ selectedType, selectedSubtype, onTypeChange, onSubtypeChange, typeCounts, subtypeCounts }: TypeFilterProps) {
  const { colors, isDark } = useThemeColors();
  const typeColors = isDark ? actionTypeColorsDark : actionTypeColorsLight;

  const typeChips: { key: ActionTypeFilter; label: string; color: string; bg: string }[] = [
    { key: "all", label: "All", color: colors.textSecondary, bg: colors.textMuted + "20" },
    ...ACTION_TYPES.map((type) => ({
      key: type,
      label: typeColors[type]?.label || type,
      color: typeColors[type]?.color || colors.textSecondary,
      bg: typeColors[type]?.bg || colors.textMuted + "20",
    })),
  ];

  const subtypeChips: { key: CodeChangeSubtype; label: string }[] = [
    { key: "all", label: "All" },
    { key: "bug", label: "Bug" },
    { key: "feature", label: "Feature" },
    { key: "refactor", label: "Refactor" },
  ];

  return (
    <View style={styles.filterContainer}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterChipsRow}
      >
        {typeChips.map((chip) => {
          const isSelected = selectedType === chip.key;
          const count = typeCounts[chip.key];
          return (
            <Pressable
              key={chip.key}
              style={[
                styles.filterChip,
                { backgroundColor: isSelected ? chip.bg : colors.backgroundElevated },
                !isDark && !isSelected && styles.filterChipLightBorder,
                !isDark && !isSelected && { borderColor: colors.border },
              ]}
              onPress={() => onTypeChange(chip.key)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: isSelected ? chip.color : colors.textTertiary },
                  isSelected && styles.filterChipTextSelected,
                ]}
              >
                {chip.label}
              </Text>
              {count > 0 && (
                <View style={[styles.filterChipBadge, { backgroundColor: isSelected ? chip.color + "30" : colors.textMuted + "20" }]}>
                  <Text style={[styles.filterChipBadgeText, { color: isSelected ? chip.color : colors.textTertiary }]}>
                    {count > 99 ? "99+" : count}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Subtype filter row - only show when CodeChange is selected */}
      {selectedType === "CodeChange" && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.filterChipsRow, styles.subtypeRow]}
        >
          <Ionicons name="git-branch-outline" size={14} color={colors.textTertiary} style={styles.subtypeIcon} />
          {subtypeChips.map((chip) => {
            const isSelected = selectedSubtype === chip.key;
            const count = subtypeCounts[chip.key];
            return (
              <Pressable
                key={chip.key}
                style={[
                  styles.subtypeChip,
                  { backgroundColor: isSelected ? colors.primary + "20" : "transparent" },
                  isSelected && { borderColor: colors.primary + "40" },
                  !isSelected && { borderColor: colors.border },
                ]}
                onPress={() => onSubtypeChange(chip.key)}
              >
                <Text
                  style={[
                    styles.subtypeChipText,
                    { color: isSelected ? colors.primary : colors.textTertiary },
                  ]}
                >
                  {chip.label}
                </Text>
                {count > 0 && (
                  <Text style={[styles.subtypeChipCount, { color: isSelected ? colors.primary : colors.textMuted }]}>
                    {count}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

export function ActionsScreen({ actions, onActionPress }: ActionsScreenProps) {
  const { colors, isDark } = useThemeColors();
  const [tabMode, setTabMode] = useState<TabMode>("review");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ActionTypeFilter>("all");
  const [subtypeFilter, setSubtypeFilter] = useState<CodeChangeSubtype>("all");

  // Calculate counts for each tab (before search/type filtering)
  const tabCounts = useMemo(() => {
    return {
      review: actions.filter((a) => categorizeAction(a) === "review").length,
      active: actions.filter((a) => categorizeAction(a) === "active").length,
      done: actions.filter((a) => categorizeAction(a) === "done").length,
    };
  }, [actions]);

  // Auto-switch to active tab if review is empty but active has items
  useMemo(() => {
    if (tabCounts.review === 0 && tabCounts.active > 0 && tabMode === "review") {
      setTabMode("active");
    }
  }, [tabCounts, tabMode]);

  // Calculate type counts (for current tab)
  const typeCounts = useMemo(() => {
    const tabFiltered = actions.filter((a) => categorizeAction(a) === tabMode);
    const counts: Record<ActionTypeFilter, number> = {
      all: tabFiltered.length,
      CodeChange: 0,
      Project: 0,
      Research: 0,
      Write: 0,
      UserTask: 0,
    };
    tabFiltered.forEach((action) => {
      const type = action.type as ActionTypeFilter;
      if (type in counts) {
        counts[type]++;
      }
    });
    return counts;
  }, [actions, tabMode]);

  // Calculate subtype counts (for CodeChange in current tab)
  const subtypeCounts = useMemo(() => {
    const codeChangeActions = actions.filter(
      (a) => categorizeAction(a) === tabMode && a.type === "CodeChange"
    );
    const counts: Record<CodeChangeSubtype, number> = {
      all: codeChangeActions.length,
      bug: 0,
      feature: 0,
      refactor: 0,
    };
    codeChangeActions.forEach((action) => {
      const subtype = action.subtype as CodeChangeSubtype;
      if (subtype && subtype in counts) {
        counts[subtype]++;
      }
    });
    return counts;
  }, [actions, tabMode]);

  // Filter actions by search query and type/subtype
  const filteredActions = useMemo(() => {
    let result = actions;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((action) => {
        return (
          action.title.toLowerCase().includes(query) ||
          action.description?.toLowerCase().includes(query) ||
          action.type.toLowerCase().includes(query) ||
          action.result?.toLowerCase().includes(query)
        );
      });
    }

    // Apply type filter
    if (typeFilter !== "all") {
      result = result.filter((action) => action.type === typeFilter);
    }

    // Apply subtype filter (only when CodeChange is selected)
    if (typeFilter === "CodeChange" && subtypeFilter !== "all") {
      result = result.filter((action) => action.subtype === subtypeFilter);
    }

    return result;
  }, [actions, searchQuery, typeFilter, subtypeFilter]);

  const sections = useMemo(() => {
    return groupActionsForTab(filteredActions, tabMode);
  }, [tabMode, filteredActions]);

  // Reset subtype filter when type changes away from CodeChange
  const handleTypeChange = (type: ActionTypeFilter) => {
    setTypeFilter(type);
    if (type !== "CodeChange") {
      setSubtypeFilter("all");
    }
  };

  // Handle dismiss for failed actions
  const handleDismiss = async (actionId: string) => {
    await db.transact(
      db.tx.actions[actionId].update({
        status: "cancelled",
      })
    );
  };

  if (actions.length === 0) {
    return (
      <View style={styles.empty}>
        <View style={styles.emptyIconContainer}>
          <DotPattern
            width={120}
            height={120}
            dotSize={3}
            gap={10}
            color={colors.primary}
            opacity={0.15}
            variant="radial"
          />
          <View style={[styles.emptyIcon, { backgroundColor: colors.backgroundElevated }]}>
            <Ionicons name="flash-outline" size={40} color={colors.primary} />
          </View>
        </View>
        <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>NO ACTIONS YET</Text>
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
        <View style={[styles.searchInputWrapper, { backgroundColor: colors.backgroundElevated }, !isDark && [styles.searchLightBorder, { borderColor: colors.border }]]}>
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

      {/* Tab Bar */}
      <TabBar value={tabMode} onChange={setTabMode} counts={tabCounts} />

      {/* Type Filter */}
      <TypeFilter
        selectedType={typeFilter}
        selectedSubtype={subtypeFilter}
        onTypeChange={handleTypeChange}
        onSubtypeChange={setSubtypeFilter}
        typeCounts={typeCounts}
        subtypeCounts={subtypeCounts}
      />

      {searchQuery.trim() && filteredActions.length === 0 ? (
        <View style={styles.noResults}>
          <Text style={[styles.noResultsText, { color: colors.textTertiary }]}>No actions match &ldquo;{searchQuery}&rdquo;</Text>
        </View>
      ) : sections.length === 0 ? (
        <View style={styles.emptyTab}>
          <View style={styles.emptyTabIconContainer}>
            <DotPattern
              width={100}
              height={100}
              dotSize={2}
              gap={8}
              color={colors.primary}
              opacity={0.12}
              variant="radial"
            />
            <View style={[styles.emptyTabIcon, { backgroundColor: colors.backgroundElevated }]}>
              <Ionicons
                name={tabMode === "review" ? "checkmark-done-outline" : tabMode === "active" ? "hourglass-outline" : "archive-outline"}
                size={32}
                color={colors.primary}
              />
            </View>
          </View>
          <Text style={[styles.emptyTabTitle, { color: colors.textSecondary }]}>
            {tabMode === "review" ? "NOTHING TO REVIEW" : tabMode === "active" ? "NO ACTIVE ACTIONS" : "NO COMPLETED ACTIONS"}
          </Text>
          <Text style={[styles.emptyTabSubtitle, { color: colors.textTertiary }]}>
            {tabMode === "review"
              ? "Completed actions will appear here for review"
              : tabMode === "active"
              ? "Actions will appear here when running"
              : "Completed actions will appear here"}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ActionCard
              action={item}
              onPress={() => onActionPress?.(item)}
              onDismiss={item.status === "failed" ? () => handleDismiss(item.id) : undefined}
            />
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
                { backgroundColor: isDark ? colors.backgroundElevated : colors.textMuted + "30" },
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
    // borderColor set dynamically via colors.border
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
  // Tab Bar
  tabBarContainer: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  tabBar: {
    flexDirection: "row",
    borderRadius: radii.lg,
    overflow: "hidden",
  },
  tabBarLightBorder: {
    borderWidth: 1,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.md,
    position: "relative",
  },
  tabSelected: {},
  tabContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  tabLabel: {
    fontSize: typography.sm,
    fontWeight: "500",
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.full,
    minWidth: 20,
    alignItems: "center",
  },
  badgeText: {
    fontSize: typography.xs,
    fontWeight: "600",
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    left: spacing.lg,
    right: spacing.lg,
    height: 2,
    borderRadius: 1,
  },
  list: {
    paddingBottom: 160,
    paddingHorizontal: spacing.lg,
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
    fontSize: typography.xs,
    fontFamily: fontFamily.semibold,
    fontWeight: typography.semibold,
    letterSpacing: typography.tracking.wider,
    textTransform: "uppercase",
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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    // Note: borderColor is set dynamically in component via colors.border
  },
  cardPressed: {
    opacity: 0.8,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    marginTop: -spacing.xs,
  },
  cardTime: {
    fontSize: typography.xs,
  },
  cardActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  dismissButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
  },
  dismissButtonText: {
    fontSize: typography.xs,
    fontWeight: "600",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    paddingBottom: 120,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  emptyIcon: {
    position: "absolute",
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: typography.sm,
    fontFamily: fontFamily.semibold,
    fontWeight: typography.semibold,
    letterSpacing: typography.tracking.label,
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
  // Empty tab state
  emptyTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    paddingBottom: 120,
  },
  emptyTabIconContainer: {
    width: 100,
    height: 100,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  emptyTabIcon: {
    position: "absolute",
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTabTitle: {
    fontSize: typography.xs,
    fontFamily: fontFamily.semibold,
    fontWeight: typography.semibold,
    letterSpacing: typography.tracking.label,
    marginBottom: spacing.xs,
  },
  emptyTabSubtitle: {
    fontSize: typography.sm,
    textAlign: "center",
  },
  // Type filter styles
  filterContainer: {
    paddingBottom: spacing.sm,
  },
  filterChipsRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    gap: spacing.xs,
  },
  filterChipLightBorder: {
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: typography.xs,
    fontWeight: typography.medium,
  },
  filterChipTextSelected: {
    fontWeight: typography.semibold,
  },
  filterChipBadge: {
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 1,
    borderRadius: radii.full,
    minWidth: 18,
    alignItems: "center",
  },
  filterChipBadgeText: {
    fontSize: 10,
    fontWeight: typography.semibold,
  },
  subtypeRow: {
    marginTop: spacing.sm,
  },
  subtypeIcon: {
    marginRight: spacing.xs,
    alignSelf: "center",
  },
  subtypeChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs,
  },
  subtypeChipText: {
    fontSize: typography.xs,
    fontWeight: typography.medium,
  },
  subtypeChipCount: {
    fontSize: 10,
    fontWeight: typography.medium,
  },
});
