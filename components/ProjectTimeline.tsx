import { useState, useMemo, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  SectionList,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Action } from "./ActionItem";
import { spacing, typography, radii, fontFamily, actionTypeColorsDark, actionTypeColorsLight, type ActionType } from "@/constants/Colors";
import { useThemeColors } from "@/hooks/useThemeColors";
import { getProjectLabel } from "@/lib/actionTimeline";
import { db } from "@/lib/db";

interface ProjectTimelineProps {
  projectPath: string;
  onBack: () => void;
  onActionPress?: (action: Action) => void;
}

interface Event {
  id: string;
  actionId: string;
  type: string;
  icon: string;
  label: string;
  detail?: string;
  status: string;
  duration?: number;
  createdAt: number;
}

type TimelineItem =
  | { type: "action"; action: ActionWithEvents; key: string }
  | { type: "event"; event: Event; key: string };

interface ActionWithEvents extends Action {
  events?: Event[];
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

function formatDuration(ms: number): string {
  if (ms < 1000) return "<1s";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
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

// Star rating display
function Stars({ rating }: { rating: number }) {
  const { colors } = useThemeColors();
  return (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Ionicons
          key={star}
          name={star <= rating ? "star" : "star-outline"}
          size={12}
          color={star <= rating ? colors.primary : colors.textMuted}
        />
      ))}
    </View>
  );
}

// Action card in timeline
function TimelineActionCard({
  action,
  onPress,
  expanded,
  onToggleExpand,
}: {
  action: ActionWithEvents;
  onPress?: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const { colors, isDark } = useThemeColors();
  const typeColors = isDark ? actionTypeColorsDark : actionTypeColorsLight;
  const typeConfig = typeColors[action.type as ActionType] ?? typeColors.note;
  const statusColor = getStatusColor(action.status, colors);
  const statusLabel = getStatusLabel(action.status);
  const isRunning = action.status === "in_progress";
  const events = action.events ?? [];
  const hasEvents = events.length > 0;

  return (
    <View style={styles.timelineActionContainer}>
      {/* Timeline connector line */}
      <View style={styles.timelineLeft}>
        <View
          style={[
            styles.timelineDot,
            {
              backgroundColor: isRunning ? colors.primary : statusColor + "30",
              borderColor: statusColor,
            },
          ]}
        >
          {isRunning ? (
            <PulsingDot color={colors.primary} size={6} />
          ) : (
            <View
              style={[styles.timelineDotInner, { backgroundColor: statusColor }]}
            />
          )}
        </View>
        <View
          style={[styles.timelineLine, { backgroundColor: colors.border }]}
        />
      </View>

      {/* Action card */}
      <View style={styles.timelineRight}>
        <Pressable
          style={({ pressed }) => [
            styles.actionCard,
            { backgroundColor: colors.backgroundElevated },
            isRunning && {
              borderLeftWidth: 2,
              borderLeftColor: colors.primary,
            },
            pressed && styles.pressed,
          ]}
          onPress={onPress}
        >
          <View style={styles.actionCardHeader}>
            <View style={styles.actionBadges}>
              <View
                style={[styles.typeBadge, { backgroundColor: typeConfig.bg }]}
              >
                <Text
                  style={[
                    styles.typeBadgeText,
                    { color: typeConfig.color },
                  ]}
                >
                  {typeConfig.label}
                </Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: statusColor + "20" },
                ]}
              >
                <Text
                  style={[styles.statusBadgeText, { color: statusColor }]}
                >
                  {statusLabel}
                </Text>
              </View>
            </View>
            <Text
              style={[styles.actionTime, { color: colors.textMuted }]}
            >
              {formatRelativeTime(
                action.completedAt ?? action.startedAt ?? action.extractedAt
              )}
            </Text>
          </View>

          <Text
            style={[styles.actionTitle, { color: colors.textPrimary }]}
            numberOfLines={2}
          >
            {action.title}
          </Text>

          {/* Rating stars */}
          {action.rating && action.rating > 0 && (
            <View style={styles.ratingRow}>
              <Stars rating={action.rating} />
            </View>
          )}
        </Pressable>

        {/* Collapsible events */}
        {hasEvents && (
          <View style={styles.eventsSection}>
            <Pressable
              style={styles.eventsToggle}
              onPress={onToggleExpand}
            >
              <Ionicons
                name={expanded ? "chevron-down" : "chevron-forward"}
                size={14}
                color={colors.textTertiary}
              />
              <Text
                style={[
                  styles.eventsToggleText,
                  { color: colors.textTertiary },
                ]}
              >
                {events.length} event{events.length !== 1 ? "s" : ""}
              </Text>
            </Pressable>

            {expanded && (
              <View style={styles.eventsList}>
                {events
                  .sort((a, b) => b.createdAt - a.createdAt)
                  .map((event) => (
                    <View key={event.id} style={styles.eventRow}>
                      <Text style={styles.eventIcon}>{event.icon}</Text>
                      <View style={styles.eventContent}>
                        <Text
                          style={[
                            styles.eventLabel,
                            {
                              color:
                                event.status === "error"
                                  ? colors.error
                                  : colors.textSecondary,
                            },
                          ]}
                          numberOfLines={2}
                        >
                          {event.detail
                            ? `${event.label}: ${event.detail}`
                            : event.label}
                        </Text>
                      </View>
                      <View style={styles.eventMeta}>
                        {event.duration != null && event.duration > 0 && (
                          <Text
                            style={[
                              styles.eventDuration,
                              { color: colors.textMuted },
                            ]}
                          >
                            {formatDuration(event.duration)}
                          </Text>
                        )}
                        <Text
                          style={[
                            styles.eventTime,
                            { color: colors.textMuted },
                          ]}
                        >
                          {formatRelativeTime(event.createdAt)}
                        </Text>
                      </View>
                    </View>
                  ))}
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

export function ProjectTimeline({
  projectPath,
  onBack,
  onActionPress,
}: ProjectTimelineProps) {
  const { colors, isDark } = useThemeColors();
  const projectName = getProjectLabel(projectPath);

  // Query actions for this project with events
  const { data } = db.useQuery({
    actions: {
      $: { where: { projectPath } },
      events: {},
    },
  });

  const actions: ActionWithEvents[] = useMemo(() => {
    if (!data?.actions) return [];
    return [...data.actions].sort((a, b) => {
      const aTime =
        a.lastEventAt ?? a.completedAt ?? a.startedAt ?? a.extractedAt;
      const bTime =
        b.lastEventAt ?? b.completedAt ?? b.startedAt ?? b.extractedAt;
      return bTime - aTime;
    }) as ActionWithEvents[];
  }, [data?.actions]);

  // Track expanded state per action
  const [expandedActions, setExpandedActions] = useState<Set<string>>(
    new Set()
  );

  // Auto-expand running actions
  useEffect(() => {
    const running = actions
      .filter((a) => a.status === "in_progress")
      .map((a) => a.id);
    if (running.length > 0) {
      setExpandedActions((prev) => {
        const next = new Set(prev);
        for (const id of running) next.add(id);
        return next;
      });
    }
  }, [actions]);

  const toggleExpanded = (actionId: string) => {
    setExpandedActions((prev) => {
      const next = new Set(prev);
      if (next.has(actionId)) {
        next.delete(actionId);
      } else {
        next.add(actionId);
      }
      return next;
    });
  };

  // Stats
  const totalActions = actions.length;
  const runningCount = actions.filter(
    (a) => a.status === "in_progress"
  ).length;
  const completedCount = actions.filter(
    (a) => a.status === "completed"
  ).length;

  // Split into live (running) and past sections
  const liveActions = actions.filter((a) => a.status === "in_progress");
  const pastActions = actions.filter((a) => a.status !== "in_progress");

  type Section = {
    title: string;
    key: string;
    isLive?: boolean;
    data: ActionWithEvents[];
  };

  const sections: Section[] = [];
  if (liveActions.length > 0) {
    sections.push({
      title: "Live",
      key: "live",
      isLive: true,
      data: liveActions,
    });
  }
  if (pastActions.length > 0) {
    sections.push({
      title: "Timeline",
      key: "timeline",
      data: pastActions,
    });
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          style={styles.backButton}
          onPress={onBack}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={colors.textSecondary}
          />
        </Pressable>

        <View style={styles.headerCenter}>
          <Text
            style={[styles.headerTitle, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            {projectName}
          </Text>
          <View style={styles.headerStats}>
            <View
              style={[
                styles.headerBadge,
                { backgroundColor: colors.textMuted + "20" },
              ]}
            >
              <Text
                style={[
                  styles.headerBadgeText,
                  { color: colors.textTertiary },
                ]}
              >
                {totalActions} action{totalActions !== 1 ? "s" : ""}
              </Text>
            </View>
            {runningCount > 0 && (
              <View
                style={[
                  styles.headerBadge,
                  { backgroundColor: colors.primary + "20" },
                ]}
              >
                <PulsingDot color={colors.primary} size={6} />
                <Text
                  style={[
                    styles.headerBadgeText,
                    { color: colors.primary },
                  ]}
                >
                  {runningCount} running
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Spacer for symmetry */}
        <View style={styles.headerSpacer} />
      </View>

      {/* Timeline content */}
      {sections.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons
            name="time-outline"
            size={32}
            color={colors.textMuted}
          />
          <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
            No actions for this project yet
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TimelineActionCard
              action={item}
              onPress={() => onActionPress?.(item)}
              expanded={expandedActions.has(item.id)}
              onToggleExpand={() => toggleExpanded(item.id)}
            />
          )}
          renderSectionHeader={({ section }) => (
            <View
              style={[
                styles.sectionHeaderRow,
                { backgroundColor: colors.background },
              ]}
            >
              {section.isLive && (
                <PulsingDot color={colors.primary} size={8} />
              )}
              <Text
                style={[
                  styles.sectionHeaderText,
                  {
                    color: section.isLive
                      ? colors.primary
                      : colors.textSecondary,
                  },
                ]}
              >
                {section.title.toUpperCase()}
              </Text>
            </View>
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: typography.lg,
    fontFamily: fontFamily.semibold,
    fontWeight: "600",
  },
  headerStats: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  headerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  headerBadgeText: {
    fontSize: typography.xs,
    fontWeight: "500",
  },
  headerSpacer: {
    width: 40,
  },
  list: {
    paddingBottom: 160,
    paddingTop: spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  sectionHeaderText: {
    fontSize: typography.xs,
    fontFamily: fontFamily.semibold,
    fontWeight: "600",
    letterSpacing: typography.tracking.wider,
  },

  // Timeline layout
  timelineActionContainer: {
    flexDirection: "row",
    paddingLeft: spacing.lg,
  },
  timelineLeft: {
    width: 24,
    alignItems: "center",
  },
  timelineDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  timelineDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  timelineLine: {
    width: 1,
    flex: 1,
    marginTop: -2,
  },
  timelineRight: {
    flex: 1,
    paddingRight: spacing.lg,
    paddingBottom: spacing.md,
    marginTop: -2,
  },

  // Action card
  actionCard: {
    borderRadius: radii.lg,
    padding: spacing.md,
    marginLeft: spacing.sm,
  },
  actionCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  actionBadges: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  typeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  typeBadgeText: {
    fontSize: typography.xs,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  statusBadgeText: {
    fontSize: typography.xs,
    fontWeight: "500",
  },
  actionTime: {
    fontSize: typography.xs,
  },
  actionTitle: {
    fontSize: typography.base,
    fontWeight: "500",
    lineHeight: typography.base * 1.4,
  },
  ratingRow: {
    marginTop: spacing.sm,
  },
  starsRow: {
    flexDirection: "row",
    gap: 2,
  },

  // Events
  eventsSection: {
    marginLeft: spacing.sm,
    marginTop: spacing.xs,
  },
  eventsToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  eventsToggleText: {
    fontSize: typography.xs,
    fontWeight: "500",
  },
  eventsList: {
    gap: spacing.xs,
    paddingLeft: spacing.xs,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  eventIcon: {
    fontSize: 14,
    width: 20,
    textAlign: "center",
  },
  eventContent: {
    flex: 1,
  },
  eventLabel: {
    fontSize: typography.xs,
    lineHeight: typography.xs * 1.4,
  },
  eventMeta: {
    alignItems: "flex-end",
  },
  eventDuration: {
    fontSize: 10,
    fontFamily: "monospace",
  },
  eventTime: {
    fontSize: 10,
  },

  pressed: {
    opacity: 0.8,
  },

  // Empty state
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingBottom: 120,
  },
  emptyText: {
    fontSize: typography.sm,
  },
});
