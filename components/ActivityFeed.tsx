import { useState, useMemo, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ActionsScreen } from "./ActionsScreen";
import { ActionItem, type Action } from "./ActionItem";
import { spacing, typography, radii, fontFamily } from "@/constants/Colors";
import { useThemeColors } from "@/hooks/useThemeColors";
import { getProjectLabel } from "@/lib/actionTimeline";

type ViewMode = "feed" | "list";

interface ActivityFeedProps {
  actions: Action[];
  onActionPress?: (action: Action) => void;
  onProjectPress?: (projectPath: string) => void;
}

interface ProjectGroup {
  projectPath: string;
  label: string;
  actions: Action[];
  lastActivity: number;
  runningCount: number;
  pendingCount: number;
  activeCount: number;
  latestAction: Action;
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

function getStatusColor(
  status: string,
  colors: ReturnType<typeof useThemeColors>["colors"]
): string {
  switch (status) {
    case "in_progress":
      return colors.primary;
    case "pending":
      return colors.textTertiary;
    case "completed":
      return colors.success;
    case "failed":
      return colors.error;
    case "awaiting_feedback":
      return colors.warning;
    case "cancelled":
      return colors.warning;
    default:
      return colors.textTertiary;
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "in_progress":
      return "Running";
    case "pending":
      return "Queued";
    case "completed":
      return "Done";
    case "failed":
      return "Failed";
    case "awaiting_feedback":
      return "Awaiting Reply";
    case "cancelled":
      return "Stopped";
    default:
      return status;
  }
}

// Pulsing dot for running actions
function PulsingDot({ color }: { color: string }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  return (
    <Animated.View
      style={[styles.pulsingDot, { backgroundColor: color, opacity: pulseAnim }]}
    />
  );
}

function parseProgress(json: string | undefined | null): {
  currentActivity?: string;
} | null {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// Running action row in the top section
function RunningActionRow({
  action,
  onPress,
}: {
  action: Action;
  onPress?: () => void;
}) {
  const { colors } = useThemeColors();
  const progress = parseProgress(action.progress);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.runningRow,
        { backgroundColor: colors.backgroundElevated },
        pressed && styles.pressed,
      ]}
      onPress={onPress}
    >
      <PulsingDot color={colors.primary} />
      <View style={styles.runningContent}>
        <Text
          style={[styles.runningTitle, { color: colors.primary }]}
          numberOfLines={1}
        >
          {action.title}
        </Text>
        {progress?.currentActivity && (
          <Text
            style={[styles.runningActivity, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {progress.currentActivity}
          </Text>
        )}
      </View>
      <Ionicons
        name="chevron-forward"
        size={16}
        color={colors.textMuted}
      />
    </Pressable>
  );
}

// Project card in the main section
function ProjectCard({
  group,
  onPress,
}: {
  group: ProjectGroup;
  onPress?: () => void;
}) {
  const { colors } = useThemeColors();
  const statusColor = getStatusColor(group.latestAction.status, colors);
  const statusLabel = getStatusLabel(group.latestAction.status);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.projectCard,
        { backgroundColor: colors.backgroundElevated },
        pressed && styles.pressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.projectCardHeader}>
        <View style={styles.projectNameRow}>
          <Ionicons
            name="folder-outline"
            size={16}
            color={colors.primary}
          />
          <Text
            style={[styles.projectName, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            {group.label}
          </Text>
        </View>
        <Text style={[styles.projectTime, { color: colors.textMuted }]}>
          {formatRelativeTime(group.lastActivity)}
        </Text>
      </View>

      <Text
        style={[styles.projectLastAction, { color: colors.textSecondary }]}
        numberOfLines={1}
      >
        {group.latestAction.title}
      </Text>

      <View style={styles.projectCardFooter}>
        <View style={styles.projectBadges}>
          {/* Status badge for latest action */}
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: statusColor + "20" },
            ]}
          >
            {group.latestAction.status === "in_progress" && (
              <PulsingDot color={statusColor} />
            )}
            <Text style={[styles.statusBadgeText, { color: statusColor }]}>
              {statusLabel}
            </Text>
          </View>
        </View>

        {/* Counts */}
        <View style={styles.projectCounts}>
          {group.runningCount > 0 && (
            <View
              style={[
                styles.countBadge,
                { backgroundColor: colors.primary + "20" },
              ]}
            >
              <Text
                style={[styles.countBadgeText, { color: colors.primary }]}
              >
                {group.runningCount} running
              </Text>
            </View>
          )}
          {group.pendingCount > 0 && (
            <View
              style={[
                styles.countBadge,
                { backgroundColor: colors.textMuted + "20" },
              ]}
            >
              <Text
                style={[styles.countBadgeText, { color: colors.textTertiary }]}
              >
                {group.pendingCount} queued
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

// Ungrouped action card (no project)
function UngroupedActionCard({
  action,
  onPress,
}: {
  action: Action;
  onPress?: () => void;
}) {
  const { colors } = useThemeColors();

  return (
    <Pressable
      style={({ pressed }) => [
        styles.ungroupedCard,
        { backgroundColor: colors.backgroundElevated },
        pressed && styles.pressed,
      ]}
      onPress={onPress}
    >
      <ActionItem action={action} />
      <View style={styles.ungroupedFooter}>
        <Text style={[styles.ungroupedTime, { color: colors.textMuted }]}>
          {formatRelativeTime(
            action.completedAt ?? action.startedAt ?? action.extractedAt
          )}
        </Text>
      </View>
    </Pressable>
  );
}

// View mode toggle pill
function ViewModeToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  const { colors } = useThemeColors();

  return (
    <View
      style={[
        styles.viewModeToggle,
        { backgroundColor: colors.backgroundElevated },
      ]}
    >
      {(["feed", "list"] as ViewMode[]).map((mode) => {
        const isSelected = value === mode;
        return (
          <Pressable
            key={mode}
            style={[
              styles.viewModePill,
              isSelected && { backgroundColor: colors.primary + "20" },
            ]}
            onPress={() => onChange(mode)}
          >
            <Ionicons
              name={mode === "feed" ? "grid-outline" : "list-outline"}
              size={14}
              color={isSelected ? colors.primary : colors.textTertiary}
            />
            <Text
              style={[
                styles.viewModeText,
                { color: isSelected ? colors.primary : colors.textTertiary },
              ]}
            >
              {mode === "feed" ? "Feed" : "List"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ActivityFeed({
  actions,
  onActionPress,
  onProjectPress,
}: ActivityFeedProps) {
  const { colors } = useThemeColors();
  const [viewMode, setViewMode] = useState<ViewMode>("feed");

  // Separate running actions
  const runningActions = useMemo(
    () => actions.filter((a) => a.status === "in_progress"),
    [actions]
  );

  // Group actions by project
  const { projectGroups, ungroupedActions } = useMemo(() => {
    const nonCancelled = actions.filter((a) => a.status !== "cancelled");

    const grouped: Record<string, Action[]> = {};
    const ungrouped: Action[] = [];

    for (const action of nonCancelled) {
      if (action.projectPath) {
        if (!grouped[action.projectPath]) {
          grouped[action.projectPath] = [];
        }
        grouped[action.projectPath].push(action);
      } else {
        ungrouped.push(action);
      }
    }

    const groups: ProjectGroup[] = Object.entries(grouped).map(
      ([projectPath, projectActions]) => {
        const sorted = [...projectActions].sort((a, b) => {
          const aTime =
            a.lastEventAt ?? a.completedAt ?? a.startedAt ?? a.extractedAt;
          const bTime =
            b.lastEventAt ?? b.completedAt ?? b.startedAt ?? b.extractedAt;
          return bTime - aTime;
        });

        const latestAction = sorted[0];
        const lastActivity =
          latestAction.lastEventAt ??
          latestAction.completedAt ??
          latestAction.startedAt ??
          latestAction.extractedAt;

        return {
          projectPath,
          label: getProjectLabel(projectPath),
          actions: sorted,
          lastActivity,
          runningCount: projectActions.filter(
            (a) => a.status === "in_progress"
          ).length,
          pendingCount: projectActions.filter((a) => a.status === "pending")
            .length,
          activeCount: projectActions.filter(
            (a) => a.status === "in_progress" || a.status === "pending"
          ).length,
          latestAction,
        };
      }
    );

    // Sort projects by most recent activity
    groups.sort((a, b) => b.lastActivity - a.lastActivity);

    // Sort ungrouped by most recent activity
    ungrouped.sort((a, b) => {
      const aTime = a.completedAt ?? a.startedAt ?? a.extractedAt;
      const bTime = b.completedAt ?? b.startedAt ?? b.extractedAt;
      return bTime - aTime;
    });

    return { projectGroups: groups, ungroupedActions: ungrouped };
  }, [actions]);

  // If list mode, delegate to ActionsScreen
  if (viewMode === "list") {
    return (
      <View style={styles.container}>
        <View style={styles.toggleRow}>
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
        </View>
        <ActionsScreen actions={actions} onActionPress={onActionPress} />
      </View>
    );
  }

  // Build flat list data
  type FeedItem =
    | { type: "toggle"; key: string }
    | { type: "runningHeader"; key: string }
    | { type: "running"; key: string; action: Action }
    | { type: "projectsHeader"; key: string }
    | { type: "project"; key: string; group: ProjectGroup }
    | { type: "ungroupedHeader"; key: string }
    | { type: "ungrouped"; key: string; action: Action };

  const feedData: FeedItem[] = [];

  // Toggle row
  feedData.push({ type: "toggle", key: "toggle" });

  // Running section
  if (runningActions.length > 0) {
    feedData.push({ type: "runningHeader", key: "running-header" });
    for (const action of runningActions) {
      feedData.push({ type: "running", key: `running-${action.id}`, action });
    }
  }

  // Projects section
  if (projectGroups.length > 0) {
    feedData.push({ type: "projectsHeader", key: "projects-header" });
    for (const group of projectGroups) {
      feedData.push({
        type: "project",
        key: `project-${group.projectPath}`,
        group,
      });
    }
  }

  // Ungrouped section
  if (ungroupedActions.length > 0) {
    feedData.push({ type: "ungroupedHeader", key: "ungrouped-header" });
    for (const action of ungroupedActions) {
      feedData.push({
        type: "ungrouped",
        key: `ungrouped-${action.id}`,
        action,
      });
    }
  }

  const renderItem = ({ item }: { item: FeedItem }) => {
    switch (item.type) {
      case "toggle":
        return (
          <View style={styles.toggleRow}>
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
          </View>
        );

      case "runningHeader":
        return (
          <View style={styles.sectionHeader}>
            <PulsingDot color={colors.primary} />
            <Text
              style={[styles.sectionHeaderText, { color: colors.primary }]}
            >
              RUNNING
            </Text>
            <View
              style={[
                styles.sectionBadge,
                { backgroundColor: colors.primary + "20" },
              ]}
            >
              <Text
                style={[styles.sectionBadgeText, { color: colors.primary }]}
              >
                {runningActions.length}
              </Text>
            </View>
          </View>
        );

      case "running":
        return (
          <RunningActionRow
            action={item.action}
            onPress={() => onActionPress?.(item.action)}
          />
        );

      case "projectsHeader":
        return (
          <View style={styles.sectionHeader}>
            <Ionicons
              name="folder-outline"
              size={14}
              color={colors.textSecondary}
            />
            <Text
              style={[
                styles.sectionHeaderText,
                { color: colors.textSecondary },
              ]}
            >
              PROJECTS
            </Text>
            <View
              style={[
                styles.sectionBadge,
                { backgroundColor: colors.backgroundElevated },
              ]}
            >
              <Text
                style={[
                  styles.sectionBadgeText,
                  { color: colors.textTertiary },
                ]}
              >
                {projectGroups.length}
              </Text>
            </View>
          </View>
        );

      case "project":
        return (
          <ProjectCard
            group={item.group}
            onPress={() => onProjectPress?.(item.group.projectPath)}
          />
        );

      case "ungroupedHeader":
        return (
          <View style={styles.sectionHeader}>
            <Ionicons
              name="document-outline"
              size={14}
              color={colors.textSecondary}
            />
            <Text
              style={[
                styles.sectionHeaderText,
                { color: colors.textSecondary },
              ]}
            >
              OTHER
            </Text>
            <View
              style={[
                styles.sectionBadge,
                { backgroundColor: colors.backgroundElevated },
              ]}
            >
              <Text
                style={[
                  styles.sectionBadgeText,
                  { color: colors.textTertiary },
                ]}
              >
                {ungroupedActions.length}
              </Text>
            </View>
          </View>
        );

      case "ungrouped":
        return (
          <UngroupedActionCard
            action={item.action}
            onPress={() => onActionPress?.(item.action)}
          />
        );

      default:
        return null;
    }
  };

  if (actions.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="flash-outline" size={40} color={colors.primary} />
        <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
          NO ACTIONS YET
        </Text>
        <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
          Record a voice note and actions{"\n"}will be extracted automatically
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={feedData}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
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
  list: {
    paddingBottom: 160,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  viewModeToggle: {
    flexDirection: "row",
    borderRadius: radii.full,
    padding: 2,
  },
  viewModePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.full,
  },
  viewModeText: {
    fontSize: typography.xs,
    fontWeight: "600",
  },

  // Section headers
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sectionHeaderText: {
    fontSize: typography.xs,
    fontFamily: fontFamily.semibold,
    fontWeight: "600",
    letterSpacing: typography.tracking.wider,
  },
  sectionBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  sectionBadgeText: {
    fontSize: typography.xs,
    fontWeight: "500",
  },

  // Running action row
  runningRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
  },
  runningContent: {
    flex: 1,
  },
  runningTitle: {
    fontSize: typography.sm,
    fontWeight: "600",
  },
  runningActivity: {
    fontSize: typography.xs,
    marginTop: 2,
  },
  pulsingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Project card
  projectCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
  },
  projectCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  projectNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
    marginRight: spacing.sm,
  },
  projectName: {
    fontSize: typography.base,
    fontFamily: fontFamily.semibold,
    fontWeight: "600",
    flex: 1,
  },
  projectTime: {
    fontSize: typography.xs,
  },
  projectLastAction: {
    fontSize: typography.sm,
    marginBottom: spacing.sm,
  },
  projectCardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  projectBadges: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  statusBadgeText: {
    fontSize: typography.xs,
    fontWeight: "500",
  },
  projectCounts: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  countBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  countBadgeText: {
    fontSize: typography.xs,
    fontWeight: "500",
  },

  // Ungrouped action card
  ungroupedCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radii.lg,
    overflow: "hidden",
  },
  ungroupedFooter: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    marginTop: -spacing.xs,
  },
  ungroupedTime: {
    fontSize: typography.xs,
  },

  pressed: {
    opacity: 0.8,
  },

  // Empty state
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    paddingBottom: 120,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: typography.sm,
    fontFamily: fontFamily.semibold,
    fontWeight: "600",
    letterSpacing: typography.tracking.label,
    marginTop: spacing.md,
  },
  emptySubtitle: {
    fontSize: typography.base,
    textAlign: "center",
    lineHeight: typography.base * 1.5,
  },
});
