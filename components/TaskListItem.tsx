import { View, Text, Pressable } from "react-native";
import { useColors } from "@/hooks/useThemeColors";
import { spacing, typography, fontFamily } from "@/constants/Colors";
import { formatTaskStatusLabel } from "@/lib/workflow";

interface TaskListItemProps {
  title: string;
  status: string;
  projectLabel?: string | null;
  createdAt: number;
  onPress: () => void;
}

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
  projectLabel,
  createdAt,
  onPress,
}: TaskListItemProps) {
  const colors = useColors();
  const metaParts = [projectLabel, formatTaskStatusLabel(status)].filter(Boolean);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: "100%",
        position: "relative",
        paddingVertical: spacing.lg,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ paddingRight: 72 }}>
        <Text
          numberOfLines={1}
          style={{
            color: colors.textPrimary,
            fontSize: typography.base,
            fontFamily: fontFamily.medium,
            lineHeight: 21,
          }}
        >
          {title}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: colors.textTertiary,
            fontSize: typography.xs,
            fontFamily: fontFamily.regular,
            marginTop: spacing.xs,
          }}
        >
          {metaParts.join(" • ")}
        </Text>
      </View>

      <View
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <Text
          style={{
            color: colors.textTertiary,
            fontSize: typography.xs,
            fontFamily: fontFamily.regular,
          }}
        >
          {relativeTime(createdAt)}
        </Text>
      </View>
    </Pressable>
  );
}
