import { View, Text, Pressable } from "react-native";
import { useColors } from "@/hooks/useThemeColors";
import { fontFamily, spacing, typography } from "@/constants/Colors";
import {
  TASK_STATUSES,
  describeBlockedSituation,
  getStepProgressHeadline,
} from "@/lib/workflow";

function headlineColor(
  status: string,
  colors: ReturnType<typeof useColors>
): string {
  switch (status) {
    case TASK_STATUSES.running:
      return colors.statusRunning;
    case TASK_STATUSES.done:
      return colors.statusDone;
    case TASK_STATUSES.failed:
      return colors.statusFailed;
    case TASK_STATUSES.blocked:
      return colors.warning;
    case TASK_STATUSES.cancelled:
      return colors.textTertiary;
    default:
      return colors.textSecondary;
  }
}

export interface StepTaskRowProps {
  title: string;
  status: string;
  stepIndex: number;
  totalSteps: number;
  projectLabel?: string | null;
  showProject?: boolean;
  blockedReason?: string | null;
  errorMessage?: string | null;
  resultSnippet?: string | null;
  read?: boolean;
  /** Failed/blocked row expanded — reason + actions visible */
  expanded: boolean;
  onToggleExpand: () => void;
  onPress: () => void;
  onRetry?: () => void;
  onAskExec?: () => void;
}

export function StepTaskRow({
  title,
  status,
  stepIndex,
  totalSteps,
  projectLabel,
  showProject = true,
  blockedReason,
  errorMessage,
  resultSnippet,
  read = true,
  expanded,
  onToggleExpand,
  onPress,
  onRetry,
  onAskExec,
}: StepTaskRowProps) {
  const colors = useColors();
  const isUnread = read === false;
  const headline = getStepProgressHeadline(status, blockedReason, errorMessage);
  const hColor = headlineColor(status, colors);
  const isFailed = status === TASK_STATUSES.failed;
  const isBlocked = status === TASK_STATUSES.blocked;
  const actionable = isFailed || isBlocked;

  const explainFailed = (errorMessage || "").trim() || (resultSnippet || "").trim();
  const explainBlocked = describeBlockedSituation(blockedReason, errorMessage);
  const reasonLabel = isFailed ? "Why failed" : isBlocked ? "Why blocked" : "Details";
  const reasonBody =
    isFailed && explainFailed
      ? explainFailed
      : isBlocked
        ? explainBlocked
        : "";

  const bodyIndent =
    28 + spacing.sm + (isUnread ? 6 + spacing.xs : 0);

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
        paddingVertical: expanded && actionable ? spacing.md : spacing.sm,
      }}
    >
      <Pressable
        onPress={handleMainPress}
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: spacing.sm,
          }}
        >
          <View
            style={{
              minWidth: 28,
              paddingTop: 1,
            }}
          >
            <Text
              style={{
                color: colors.textTertiary,
                fontSize: typography.xs,
                fontFamily: fontFamily.medium,
              }}
            >
              {stepIndex}/{totalSteps}
            </Text>
          </View>

          {isUnread ? (
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: colors.primary,
                marginTop: 6,
                flexShrink: 0,
              }}
            />
          ) : null}

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={2}
              style={{
                color: colors.textPrimary,
                fontSize: typography.sm,
                fontFamily: isUnread ? fontFamily.semibold : fontFamily.medium,
                lineHeight: 19,
              }}
            >
              {title}
            </Text>
          </View>

          <Text
            numberOfLines={2}
            style={{
              flexShrink: 0,
              maxWidth: "40%",
              textAlign: "right",
              color: hColor,
              fontSize: typography.xs,
              fontFamily: fontFamily.medium,
              lineHeight: 15,
              paddingTop: 1,
            }}
          >
            {headline}
          </Text>
        </View>
      </Pressable>

      {expanded && actionable ? (
        <View style={{ marginTop: spacing.sm, marginLeft: bodyIndent, marginRight: spacing.xs }}>
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
            {reasonBody
              ? reasonBody.length > 500
                ? `${reasonBody.slice(0, 500)}…`
                : reasonBody
              : isFailed
                ? "No error details on file yet — open the thread for logs."
                : isBlocked
                  ? "Open the thread for full context."
                  : ""}
          </Text>

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
            {onAskExec ? (
              <Pressable onPress={onAskExec} hitSlop={6}>
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: typography.xs,
                    fontFamily: fontFamily.medium,
                  }}
                >
                  Ask Exec
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}
