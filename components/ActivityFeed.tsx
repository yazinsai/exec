import { useState, useMemo, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Animated,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { type Action } from "./ActionItem";
import { spacing, typography, radii, fontFamily } from "@/constants/Colors";
import { useThemeColors } from "@/hooks/useThemeColors";
import { getProjectLabel } from "@/lib/actionTimeline";

// ---------------------------------------------------------------------------
// Shared helpers (kept from original)
// ---------------------------------------------------------------------------

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
function PulsingDot({ color, size = 8 }: { color: string; size?: number }) {
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
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity: pulseAnim,
        },
      ]}
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

function getActionTimestamp(action: Action): number {
  return action.lastEventAt ?? action.completedAt ?? action.startedAt ?? action.extractedAt;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActivityFeedProps {
  actions: Action[];
  onActionPress?: (action: Action) => void;
}

interface ProjectChip {
  projectPath: string;
  label: string;
  lastActivity: number;
  hasRunning: boolean;
}

// ---------------------------------------------------------------------------
// ProjectFilterBar
// ---------------------------------------------------------------------------

function ProjectFilterBar({
  chips,
  selectedProject,
  onSelect,
}: {
  chips: ProjectChip[];
  selectedProject: string | null;
  onSelect: (projectPath: string | null) => void;
}) {
  const { colors } = useThemeColors();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipBar}
    >
      {/* "All" chip */}
      <Pressable
        style={[
          styles.chip,
          {
            backgroundColor:
              selectedProject === null
                ? colors.primary
                : colors.backgroundElevated,
          },
        ]}
        onPress={() => onSelect(null)}
      >
        <Text
          style={[
            styles.chipText,
            {
              color:
                selectedProject === null
                  ? colors.black
                  : colors.textSecondary,
            },
          ]}
        >
          All
        </Text>
      </Pressable>

      {/* Project chips */}
      {chips.map((chip) => {
        const isSelected = selectedProject === chip.projectPath;
        return (
          <Pressable
            key={chip.projectPath}
            style={[
              styles.chip,
              {
                backgroundColor: isSelected
                  ? colors.primary
                  : colors.backgroundElevated,
              },
            ]}
            onPress={() =>
              onSelect(isSelected ? null : chip.projectPath)
            }
          >
            <View style={styles.chipContent}>
              {chip.hasRunning && !isSelected && (
                <PulsingDot color={colors.primary} size={6} />
              )}
              <Text
                style={[
                  styles.chipText,
                  {
                    color: isSelected
                      ? colors.black
                      : colors.textSecondary,
                  },
                ]}
                numberOfLines={1}
              >
                {chip.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// FeedCard
// ---------------------------------------------------------------------------

function getSubtitle(action: Action): string | null {
  if (action.status === "in_progress") {
    const progress = parseProgress(action.progress);
    if (progress?.currentActivity) return progress.currentActivity;
  }
  if (action.status === "failed" && action.errorMessage) {
    return action.errorMessage;
  }
  if (action.status === "completed" && action.result) {
    // Strip markdown and take first line
    const firstLine = action.result
      .replace(/^#+\s*/gm, "")
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/`/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .split("\n")
      .find((line) => line.trim().length > 0);
    return firstLine?.trim() || null;
  }
  return action.description || null;
}

function FeedCard({
  action,
  onPress,
}: {
  action: Action;
  onPress?: () => void;
}) {
  const { colors } = useThemeColors();
  const statusColor = getStatusColor(action.status, colors);
  const statusLabel = getStatusLabel(action.status);
  const projectLabel = action.projectPath
    ? getProjectLabel(action.projectPath)
    : null;
  const timestamp = getActionTimestamp(action);
  const subtitle = getSubtitle(action);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.feedCard,
        { backgroundColor: colors.backgroundElevated },
        pressed && styles.pressed,
      ]}
      onPress={onPress}
    >
      {/* Row 1: Status + project + time */}
      <View style={styles.feedCardRow1}>
        <View style={styles.feedCardStatusRow}>
          {action.status === "in_progress" ? (
            <PulsingDot color={statusColor} size={8} />
          ) : (
            <View
              style={[
                styles.statusDot,
                { backgroundColor: statusColor },
              ]}
            />
          )}
          <Text style={[styles.feedCardStatus, { color: statusColor }]}>
            {statusLabel}
          </Text>
          {projectLabel && (
            <>
              <Text style={[styles.feedCardSeparator, { color: colors.textMuted }]}>
                |
              </Text>
              <Text
                style={[styles.feedCardProject, { color: colors.textTertiary }]}
                numberOfLines={1}
              >
                {projectLabel}
              </Text>
            </>
          )}
        </View>
        <Text style={[styles.feedCardTime, { color: colors.textMuted }]}>
          {formatRelativeTime(timestamp)}
        </Text>
      </View>

      {/* Row 2: Title */}
      <Text
        style={[styles.feedCardTitle, { color: colors.textPrimary }]}
        numberOfLines={1}
      >
        {action.title}
      </Text>

      {/* Row 3: Subtitle */}
      {subtitle && (
        <Text
          style={[styles.feedCardSubtitle, { color: colors.textTertiary }]}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Main ActivityFeed
// ---------------------------------------------------------------------------

export function ActivityFeed({
  actions,
  onActionPress,
}: ActivityFeedProps) {
  const { colors } = useThemeColors();
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  // Compute project chips from actions
  const projectChips = useMemo(() => {
    const chipMap = new Map<
      string,
      { lastActivity: number; hasRunning: boolean }
    >();

    for (const action of actions) {
      if (!action.projectPath || action.status === "cancelled") continue;
      const ts = getActionTimestamp(action);
      const existing = chipMap.get(action.projectPath);
      if (existing) {
        if (ts > existing.lastActivity) existing.lastActivity = ts;
        if (action.status === "in_progress") existing.hasRunning = true;
      } else {
        chipMap.set(action.projectPath, {
          lastActivity: ts,
          hasRunning: action.status === "in_progress",
        });
      }
    }

    const chips: ProjectChip[] = [];
    for (const [projectPath, data] of chipMap) {
      chips.push({
        projectPath,
        label: getProjectLabel(projectPath),
        lastActivity: data.lastActivity,
        hasRunning: data.hasRunning,
      });
    }

    // Sort by most recent activity
    chips.sort((a, b) => b.lastActivity - a.lastActivity);
    return chips;
  }, [actions]);

  // Filter + sort actions for the feed
  const feedActions = useMemo(() => {
    return actions
      .filter((a) => a.status !== "cancelled")
      .filter((a) =>
        selectedProject ? a.projectPath === selectedProject : true
      )
      .sort((a, b) => getActionTimestamp(b) - getActionTimestamp(a));
  }, [actions, selectedProject]);

  // Empty state
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
        data={feedActions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <FeedCard
            action={item}
            onPress={() => onActionPress?.(item)}
          />
        )}
        ListHeaderComponent={
          projectChips.length > 0 ? (
            <ProjectFilterBar
              chips={projectChips}
              selectedProject={selectedProject}
              onSelect={setSelectedProject}
            />
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyFilter}>
            <Text style={[styles.emptyFilterText, { color: colors.textTertiary }]}>
              No actions for this project
            </Text>
          </View>
        }
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    paddingBottom: 160,
  },

  // Chip bar
  chipBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.full,
  },
  chipContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chipText: {
    fontSize: typography.xs,
    fontWeight: "600",
    fontFamily: fontFamily.semibold,
  },

  // Feed card
  feedCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
  },
  feedCardRow1: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  feedCardStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    marginRight: spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  feedCardStatus: {
    fontSize: typography.xs,
    fontWeight: "600",
    fontFamily: fontFamily.semibold,
  },
  feedCardSeparator: {
    fontSize: typography.xs,
    marginHorizontal: 2,
  },
  feedCardProject: {
    fontSize: typography.xs,
    flex: 1,
  },
  feedCardTime: {
    fontSize: typography.xs,
  },
  feedCardTitle: {
    fontSize: typography.sm,
    fontFamily: fontFamily.semibold,
    fontWeight: "600",
    marginBottom: 2,
  },
  feedCardSubtitle: {
    fontSize: typography.xs,
    lineHeight: typography.xs * 1.4,
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

  // Filtered empty state
  emptyFilter: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
  },
  emptyFilterText: {
    fontSize: typography.sm,
  },
});
