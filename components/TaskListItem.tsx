import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useThemeColors";
import { spacing, typography, fontFamily } from "@/constants/Colors";

interface TaskListItemProps {
  title: string;
  status: "done" | "failed" | "cancelled";
  createdAt: number;
  onPress: () => void;
}

const STATUS_ICONS: Record<string, { name: string; colorKey: string }> = {
  done: { name: "checkmark-circle", colorKey: "statusDone" },
  failed: { name: "alert-circle", colorKey: "statusFailed" },
  cancelled: { name: "close-circle", colorKey: "statusCancelled" },
};

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function TaskListItem({
  title,
  status,
  createdAt,
  onPress,
}: TaskListItemProps) {
  const colors = useColors();
  const icon = STATUS_ICONS[status] ?? STATUS_ICONS.done;
  const iconColor = (colors as any)[icon.colorKey] as string;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: spacing.lg,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          flexShrink: 1,
          minWidth: 0,
          color: colors.textPrimary,
          fontSize: typography.base,
          fontFamily: fontFamily.regular,
          lineHeight: 21,
        }}
      >
        {title}
      </Text>

      <View style={{ flexDirection: "row", alignItems: "center", flexShrink: 0, marginLeft: spacing.sm, gap: spacing.xs }}>
        <Text
          style={{
            color: colors.textTertiary,
            fontSize: typography.xs,
            fontFamily: fontFamily.regular,
          }}
        >
          {relativeTime(createdAt)}
        </Text>
        <Ionicons name={icon.name as any} size={13} color={iconColor} />
      </View>
    </Pressable>
  );
}
