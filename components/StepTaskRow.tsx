import { useState } from "react";
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
  /** Hide slug when every step in the note shares the same project */
  showProject?: boolean;
  blockedReason?: string | null;
  errorMessage?: string | null;
  resultSnippet?: string | null;
  read?: boolean;
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
  onPress,
  onRetry,
  onAskExec,
}: StepTaskRowProps) {
  const colors = useColors();
  const [whyOpen, setWhyOpen] = useState(false);
  const isUnread = read === false;
  const headline = getStepProgressHeadline(status, blockedReason, errorMessage);
  const hColor = headlineColor(status, colors);
  const isFailed = status === TASK_STATUSES.failed;
  const isBlocked = status === TASK_STATUSES.blocked;
  const explainFailed = (errorMessage || "").trim() || (resultSnippet || "").trim();
  const explainBlocked = describeBlockedSituation(blockedReason, errorMessage);
  const explain =
    isFailed && explainFailed
      ? explainFailed.length > 220
        ? `${explainFailed.slice(0, 220)}…`
        : explainFailed
      : isBlocked
        ? explainBlocked
        : "";

  const bodyIndent =
    28 + spacing.sm + (isUnread ? 6 + spacing.xs : 0);

  return (
    <View
      style={{
        paddingVertical: spacing.md,
      }}
    >
      <Pressable
        onPress={onPress}
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
              paddingTop: 2,
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
                marginTop: 7,
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
                lineHeight: 20,
              }}
            >
              {title}
            </Text>
            {showProject && projectLabel ? (
              <Text
                numberOfLines={1}
                style={{
                  color: colors.textTertiary,
                  fontSize: typography.xs,
                  fontFamily: fontFamily.regular,
                  marginTop: 3,
                }}
              >
                {projectLabel}
              </Text>
            ) : null}
          </View>

          <Text
            numberOfLines={3}
            style={{
              flexShrink: 0,
              maxWidth: "42%",
              textAlign: "right",
              color: hColor,
              fontSize: typography.xs,
              fontFamily: fontFamily.medium,
              lineHeight: 16,
              paddingTop: 2,
            }}
          >
            {headline}
          </Text>
        </View>
      </Pressable>

      {(isFailed || isBlocked) && explain ? (
        <Pressable
          onPress={() => setWhyOpen((v) => !v)}
          style={({ pressed }) => ({
            marginTop: spacing.sm,
            marginLeft: bodyIndent,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text
            style={{
              color: colors.primary,
              fontSize: typography.xs,
              fontFamily: fontFamily.medium,
            }}
          >
            {whyOpen ? "Hide why" : "Why?"}
          </Text>
        </Pressable>
      ) : null}

      {whyOpen && explain ? (
        <Text
          style={{
            marginTop: spacing.xs,
            marginLeft: bodyIndent,
            marginRight: spacing.xs,
            color: colors.textSecondary,
            fontSize: typography.xs,
            fontFamily: fontFamily.regular,
            lineHeight: 18,
          }}
        >
          {explain}
        </Text>
      ) : null}

      {isFailed ? (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: spacing.md,
            marginTop: spacing.sm,
            marginLeft: bodyIndent,
          }}
        >
          {onRetry ? (
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
              Details
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
      ) : null}
    </View>
  );
}
