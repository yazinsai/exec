import { View, Text, Pressable } from "react-native";
import { Iconify } from "react-native-iconify";
import { useColors } from "@/hooks/useThemeColors";
import { fontFamily, spacing, typography } from "@/constants/Colors";
import { shortenStepTitle, summarizeErrorForFeed } from "@/lib/displayCopy";
import { HighlightText } from "@/components/HighlightText";
import {
  TASK_STATUSES,
  describeBlockedSituation,
  formatTaskStatusLabel,
} from "@/lib/workflow";

function statusPillStyle(
  status: string,
  colors: ReturnType<typeof useColors>
): { bg: string; fg: string } {
  switch (status) {
    case TASK_STATUSES.running:
      return { bg: "rgba(59, 130, 246, 0.15)", fg: colors.statusRunning };
    case TASK_STATUSES.done:
      return { bg: "rgba(34, 197, 94, 0.12)", fg: colors.statusDone };
    case TASK_STATUSES.failed:
    case TASK_STATUSES.transcriptionFailed:
      return { bg: "rgba(239, 68, 68, 0.12)", fg: colors.statusFailed };
    case TASK_STATUSES.blocked:
      return { bg: "rgba(245, 158, 11, 0.12)", fg: colors.warning };
    case TASK_STATUSES.cancelled:
      return { bg: "rgba(113, 113, 122, 0.2)", fg: colors.textTertiary };
    case TASK_STATUSES.transcribing:
      return { bg: "rgba(245, 158, 11, 0.1)", fg: colors.warning };
    case TASK_STATUSES.pending:
    default:
      return { bg: "rgba(113, 113, 122, 0.2)", fg: colors.textSecondary };
  }
}

export interface StepTaskRowProps {
  title: string;
  status: string;
  stepIndex: number;
  totalSteps: number;
  projectLabel?: string | null;
  showProject?: boolean;
  pinned?: boolean;
  blockedReason?: string | null;
  errorMessage?: string | null;
  resultSnippet?: string | null;
  read?: boolean;
  /** Failed/blocked row expanded — reason + actions visible */
  expanded: boolean;
  /** Keyword to highlight in the title */
  highlightQuery?: string | null;
  onToggleExpand: () => void;
  onPress: () => void;
  onRetry?: () => void;
}

export function StepTaskRow({
  title,
  status,
  stepIndex,
  totalSteps,
  projectLabel,
  showProject = true,
  pinned = false,
  blockedReason,
  errorMessage,
  resultSnippet,
  read = true,
  expanded,
  highlightQuery,
  onToggleExpand,
  onPress,
  onRetry,
}: StepTaskRowProps) {
  const colors = useColors();
  const isUnread = read === false;
  const statusLabel = formatTaskStatusLabel(status);
  const pill = statusPillStyle(status, colors);
  const isFailed = status === TASK_STATUSES.failed;
  const isBlocked = status === TASK_STATUSES.blocked;
  const actionable = isFailed || isBlocked;

  const rawFailed = ((errorMessage || "").trim() || (resultSnippet || "").trim());
  const friendlyFailed = rawFailed ? summarizeErrorForFeed(rawFailed) : "";
  const explainBlocked = describeBlockedSituation(blockedReason, errorMessage);
  const rawBlockedErr = (errorMessage || "").trim();
  const friendlyBlockedErr = rawBlockedErr
    ? summarizeErrorForFeed(rawBlockedErr)
    : "";
  const reasonLabel = isFailed ? "Why failed" : isBlocked ? "Why blocked" : "Details";
  const primaryReason = isFailed
    ? friendlyFailed || rawFailed
    : friendlyBlockedErr || explainBlocked;
  const rawTechnical =
    isFailed && rawFailed && rawFailed !== friendlyFailed
      ? rawFailed
      : isBlocked && rawBlockedErr && rawBlockedErr !== friendlyBlockedErr
        ? rawBlockedErr
        : "";

  const handleMainPress = () => {
    if (actionable) {
      onToggleExpand();
    } else {
      onPress();
    }
  };

  return (
    <View
      style={{
        paddingVertical: expanded && actionable ? spacing.sm : spacing.xs,
      }}
    >
      <Pressable
        onPress={handleMainPress}
        style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
      >
        <View style={{ gap: spacing.xs }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.sm,
            }}
          >
            {isUnread ? (
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 3.5,
                  backgroundColor: colors.primary,
                  flexShrink: 0,
                }}
              />
            ) : null}
            <Text
              style={{
                color: colors.textTertiary,
                fontSize: typography.xs,
                fontFamily: fontFamily.semibold,
                letterSpacing: 0.3,
              }}
            >
              Step {stepIndex} of {totalSteps}
            </Text>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <HighlightText
              text={shortenStepTitle(title, 72)}
              highlight={highlightQuery}
              numberOfLines={4}
              style={{
                flex: 1,
                color: colors.textPrimary,
                fontSize: typography.base,
                fontFamily: isUnread ? fontFamily.semibold : fontFamily.medium,
                lineHeight: 22,
              }}
            />
            {pinned && (
              <Iconify
                icon="solar:bookmark-bold"
                size={14}
                color={colors.primary}
                style={{ flexShrink: 0, marginTop: 2 }}
              />
            )}
          </View>

          <View
            style={{
              alignSelf: "flex-start",
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 12,
              backgroundColor: pill.bg,
            }}
          >
            <Text
              style={{
                color: pill.fg,
                fontSize: 11,
                fontFamily: fontFamily.semibold,
                letterSpacing: 0.2,
              }}
            >
              {statusLabel}
            </Text>
          </View>
        </View>
      </Pressable>

      {expanded && actionable ? (
        <View style={{ marginTop: spacing.md, paddingLeft: 2 }}>
          <Text
            style={{
              color: colors.textTertiary,
              fontSize: 10,
              fontFamily: fontFamily.semibold,
              textTransform: "uppercase",
              letterSpacing: 0.4,
              marginBottom: 4,
            }}
          >
            {reasonLabel}
          </Text>
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: typography.xs,
              fontFamily: fontFamily.regular,
              lineHeight: 18,
            }}
          >
            {primaryReason
              ? primaryReason.length > 500
                ? `${primaryReason.slice(0, 500)}…`
                : primaryReason
              : isFailed
                ? "No error details on file yet — open the thread for logs."
                : isBlocked
                  ? "Open the thread for full context."
                  : ""}
          </Text>
          {rawTechnical ? (
            <Text
              style={{
                marginTop: spacing.sm,
                color: colors.textTertiary,
                fontSize: 10,
                fontFamily: fontFamily.regular,
                lineHeight: 15,
              }}
            >
              Technical detail{"\n"}
              {rawTechnical.length > 600
                ? `${rawTechnical.slice(0, 600)}…`
                : rawTechnical}
            </Text>
          ) : null}

          {showProject && projectLabel ? (
            <Text
              numberOfLines={1}
              style={{
                marginTop: spacing.sm,
                color: colors.textTertiary,
                fontSize: typography.xs,
                fontFamily: fontFamily.regular,
              }}
            >
              {projectLabel}
            </Text>
          ) : null}

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: spacing.md,
              marginTop: spacing.md,
            }}
          >
            {isFailed && onRetry ? (
              <Pressable onPress={onRetry} hitSlop={6}>
                <Text
                  style={{
                    color: colors.primary,
                    fontSize: typography.xs,
                    fontFamily: fontFamily.semibold,
                  }}
                >
                  Retry
                </Text>
              </Pressable>
            ) : null}
            <Pressable onPress={onPress} hitSlop={6}>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: typography.xs,
                  fontFamily: fontFamily.medium,
                }}
              >
                Open thread
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}
