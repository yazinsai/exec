import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useColors } from "@/hooks/useThemeColors";
import { fontFamily, radii, spacing, typography } from "@/constants/Colors";
import {
  TASK_STATUSES,
  describeBlockedSituation,
  getStepProgressHeadline,
} from "@/lib/workflow";

export interface AttentionTaskRowProps {
  title: string;
  status: string;
  projectLabel?: string | null;
  blockedReason?: string | null;
  errorMessage?: string | null;
  onPress: () => void;
}

function stripeColor(
  status: string,
  colors: ReturnType<typeof useColors>
): string {
  switch (status) {
    case TASK_STATUSES.running:
      return colors.statusRunning;
    case TASK_STATUSES.failed:
      return colors.statusFailed;
    case TASK_STATUSES.blocked:
      return colors.warning;
    default:
      return colors.border;
  }
}

function headlineTextColor(
  status: string,
  colors: ReturnType<typeof useColors>
): string {
  switch (status) {
    case TASK_STATUSES.running:
      return colors.statusRunning;
    case TASK_STATUSES.failed:
      return colors.statusFailed;
    case TASK_STATUSES.blocked:
      return colors.warning;
    default:
      return colors.textSecondary;
  }
}

/** One-line status; fullDetail + tapForMore when error/explanation is long */
function buildCompactStatusLine(
  status: string,
  blockedReason: string | null | undefined,
  errorMessage: string | null | undefined
): { line: string; tapForMore: boolean; fullDetail: string } {
  const headline = getStepProgressHeadline(status, blockedReason, errorMessage);

  if (status === TASK_STATUSES.failed) {
    const err = (errorMessage || "").trim();
    if (!err) return { line: headline, tapForMore: false, fullDetail: "" };
    const dash = `${headline} — `;
    const budget = 88 - dash.length;
    if (err.length <= budget) {
      return { line: dash + err, tapForMore: false, fullDetail: err };
    }
    return {
      line: `${dash}${err.slice(0, Math.max(24, budget - 1))}…`,
      tapForMore: true,
      fullDetail: err,
    };
  }

  if (status === TASK_STATUSES.blocked) {
    const detail = describeBlockedSituation(blockedReason, errorMessage);
    const dash = `${headline} — `;
    const budget = 88 - dash.length;
    if (detail.length <= budget) {
      return { line: dash + detail, tapForMore: false, fullDetail: detail };
    }
    return {
      line: `${dash}${detail.slice(0, Math.max(20, budget - 1))}…`,
      tapForMore: true,
      fullDetail: detail,
    };
  }

  return { line: headline, tapForMore: false, fullDetail: "" };
}

export function AttentionTaskRow({
  title,
  status,
  projectLabel,
  blockedReason,
  errorMessage,
  onPress,
}: AttentionTaskRowProps) {
  const colors = useColors();
  const [detailOpen, setDetailOpen] = useState(false);
  const { line, tapForMore, fullDetail } = buildCompactStatusLine(
    status,
    blockedReason,
    errorMessage
  );
  const showTapForMore = tapForMore && fullDetail.length > 0 && !detailOpen;

  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: colors.backgroundElevated,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          width: 3,
          alignSelf: "stretch",
          backgroundColor: stripeColor(status, colors),
        }}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Pressable
          onPress={onPress}
          style={({ pressed }) => ({
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.md,
            opacity: pressed ? 0.88 : 1,
          })}
        >
          <Text
            numberOfLines={2}
            style={{
              color: colors.textPrimary,
              fontSize: typography.sm,
              fontFamily: fontFamily.semibold,
              lineHeight: 19,
            }}
          >
            {title}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              marginTop: 3,
              color: headlineTextColor(status, colors),
              fontSize: typography.xs,
              fontFamily: fontFamily.medium,
              lineHeight: 16,
            }}
          >
            {line}
          </Text>
          {projectLabel && status === TASK_STATUSES.running ? (
            <Text
              numberOfLines={1}
              style={{
                marginTop: 2,
                color: colors.textTertiary,
                fontSize: 10,
                fontFamily: fontFamily.regular,
              }}
            >
              {projectLabel}
            </Text>
          ) : null}
        </Pressable>

        {showTapForMore ? (
          <Pressable
            onPress={() => setDetailOpen(true)}
            hitSlop={{ top: 4, bottom: 8, left: 12, right: 12 }}
            style={({ pressed }) => ({
              paddingHorizontal: spacing.md,
              paddingBottom: spacing.sm,
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
              Tap for more
            </Text>
          </Pressable>
        ) : null}

        {detailOpen && fullDetail ? (
          <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.sm }}>
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: typography.xs,
                fontFamily: fontFamily.regular,
                lineHeight: 18,
              }}
            >
              {fullDetail}
            </Text>
            <Pressable
              onPress={() => setDetailOpen(false)}
              style={({ pressed }) => ({ marginTop: spacing.xs, opacity: pressed ? 0.7 : 1 })}
            >
              <Text
                style={{
                  color: colors.textTertiary,
                  fontSize: typography.xs,
                  fontFamily: fontFamily.regular,
                }}
              >
                Show less
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}
