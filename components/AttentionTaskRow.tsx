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

export function AttentionTaskRow({
  title,
  status,
  projectLabel,
  blockedReason,
  errorMessage,
  onPress,
}: AttentionTaskRowProps) {
  const colors = useColors();
  const line = getStepProgressHeadline(status, blockedReason, errorMessage);
  const sub =
    status === TASK_STATUSES.blocked
      ? describeBlockedSituation(blockedReason, errorMessage)
      : status === TASK_STATUSES.failed && (errorMessage || "").trim()
        ? (errorMessage || "").trim().slice(0, 72)
        : projectLabel || null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        backgroundColor: colors.backgroundElevated,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: "hidden",
        opacity: pressed ? 0.88 : 1,
      })}
    >
      <View
        style={{
          width: 3,
          alignSelf: "stretch",
          backgroundColor: stripeColor(status, colors),
        }}
      />
      <View style={{ flex: 1, padding: spacing.md, gap: 4, minWidth: 0 }}>
        <Text
          numberOfLines={2}
          style={{
            color: colors.textPrimary,
            fontSize: typography.sm,
            fontFamily: fontFamily.semibold,
            lineHeight: 20,
          }}
        >
          {title}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: headlineTextColor(status, colors),
            fontSize: typography.xs,
            fontFamily: fontFamily.medium,
          }}
        >
          {line}
        </Text>
        {sub && sub !== line ? (
          <Text
            numberOfLines={2}
            style={{
              color: colors.textTertiary,
              fontSize: typography.xs,
              fontFamily: fontFamily.regular,
              lineHeight: 16,
            }}
          >
            {sub}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
