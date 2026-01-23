import { View, Text, Pressable, StyleSheet } from "react-native";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { colors, spacing, typography, radii } from "@/constants/Colors";

interface QueueStatusProps {
  pendingCount: number;
  failedCount: number;
  onPress?: () => void;
}

export function QueueStatus({
  pendingCount,
  failedCount,
  onPress,
}: QueueStatusProps) {
  const { isOnline } = useNetworkStatus();

  if (pendingCount === 0 && failedCount === 0) {
    return null;
  }

  return (
    <Pressable onPress={onPress} style={styles.container}>
      {!isOnline && (
        <View style={styles.offlineBadge}>
          <Text style={styles.offlineText}>Offline</Text>
        </View>
      )}

      {pendingCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {pendingCount} processing
          </Text>
        </View>
      )}

      {failedCount > 0 && (
        <View style={[styles.badge, styles.failedBadge]}>
          <Text style={styles.badgeText}>
            {failedCount} failed
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
  },
  badge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    borderRadius: radii.xl,
  },
  failedBadge: {
    backgroundColor: colors.error,
  },
  offlineBadge: {
    backgroundColor: colors.warning,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    borderRadius: radii.xl,
  },
  badgeText: {
    color: colors.white,
    fontSize: typography.sm,
    fontWeight: typography.semibold,
  },
  offlineText: {
    color: colors.white,
    fontSize: typography.sm,
    fontWeight: typography.semibold,
  },
});
