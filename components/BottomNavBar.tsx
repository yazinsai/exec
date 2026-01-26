import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, shadows, radii } from "@/constants/Colors";

type TabKey = "actions" | "recordings";

interface BottomNavBarProps {
  activeTab: TabKey;
  onTabPress: (tab: TabKey) => void;
  onRecordPress: () => void;
  recordDisabled?: boolean;
  runningCount?: number;
}

export function BottomNavBar({
  activeTab,
  onTabPress,
  onRecordPress,
  recordDisabled,
  runningCount = 0,
}: BottomNavBarProps) {
  return (
    <View style={styles.container}>
      {/* Background bar */}
      <View style={styles.bar}>
        {/* Actions Tab */}
        <Pressable
          style={styles.tab}
          onPress={() => onTabPress("actions")}
        >
          <View style={styles.iconContainer}>
            <Ionicons
              name={activeTab === "actions" ? "flash" : "flash-outline"}
              size={24}
              color={activeTab === "actions" ? colors.primary : colors.textTertiary}
            />
            {runningCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {runningCount > 99 ? "99+" : runningCount}
                </Text>
              </View>
            )}
          </View>
          <Text
            style={[
              styles.tabLabel,
              activeTab === "actions" && styles.tabLabelActive,
            ]}
          >
            Actions
          </Text>
        </Pressable>

        {/* Spacer for record button */}
        <View style={styles.centerSpacer} />

        {/* Recordings Tab */}
        <Pressable
          style={styles.tab}
          onPress={() => onTabPress("recordings")}
        >
          <Ionicons
            name={activeTab === "recordings" ? "list" : "list-outline"}
            size={24}
            color={activeTab === "recordings" ? colors.primary : colors.textTertiary}
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === "recordings" && styles.tabLabelActive,
            ]}
          >
            Recordings
          </Text>
        </Pressable>
      </View>

      {/* Centered Record Button */}
      <View style={styles.recordButtonContainer}>
        <View style={styles.recordButtonOuter}>
          <Pressable
            onPress={onRecordPress}
            disabled={recordDisabled}
            style={({ pressed }) => [
              styles.recordButton,
              pressed && styles.recordButtonPressed,
              recordDisabled && styles.recordButtonDisabled,
            ]}
          >
            <Ionicons name="mic" size={36} color={colors.white} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const RECORD_BUTTON_SIZE = 80;
const OUTER_RING_SIZE = RECORD_BUTTON_SIZE + 16;

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.backgroundElevated,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingBottom: 28, // Safe area padding
    paddingTop: spacing.md,
    paddingHorizontal: spacing.xl,
    width: "100%",
  },
  tab: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.lg,
    flex: 1,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: colors.textTertiary,
    marginTop: 4,
  },
  iconContainer: {
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -10,
    backgroundColor: colors.primary,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: "700",
  },
  tabLabelActive: {
    color: colors.primary,
  },
  centerSpacer: {
    width: OUTER_RING_SIZE + spacing.lg,
  },
  recordButtonContainer: {
    position: "absolute",
    top: -RECORD_BUTTON_SIZE / 2 - 4,
    alignItems: "center",
    justifyContent: "center",
  },
  recordButtonOuter: {
    width: OUTER_RING_SIZE,
    height: OUTER_RING_SIZE,
    borderRadius: OUTER_RING_SIZE / 2,
    backgroundColor: colors.backgroundElevated,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  recordButton: {
    width: RECORD_BUTTON_SIZE,
    height: RECORD_BUTTON_SIZE,
    borderRadius: RECORD_BUTTON_SIZE / 2,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.md,
  },
  recordButtonPressed: {
    transform: [{ scale: 0.95 }],
    opacity: 0.9,
  },
  recordButtonDisabled: {
    opacity: 0.5,
  },
});
