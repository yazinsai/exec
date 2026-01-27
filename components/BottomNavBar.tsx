import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { spacing, shadows, radii } from "@/constants/Colors";
import { useThemeColors } from "@/hooks/useThemeColors";

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
  const { colors, isDark } = useThemeColors();
  const recordButtonBg = isDark || !recordDisabled
    ? colors.primary
    : colors.backgroundElevated;
  const recordIconColor = recordDisabled
    ? colors.textMuted
    : isDark
      ? colors.white
      : colors.primary;
  const recordButtonBorder =
    isDark
      ? { borderWidth: 0, borderColor: "transparent" }
      : {
          borderWidth: 2,
          borderColor: recordDisabled ? colors.border : colors.primary,
        };

  return (
    <View style={styles.container}>
      {/* Background bar */}
      <View style={[
        styles.bar,
        { backgroundColor: colors.backgroundElevated, borderTopColor: colors.border },
        !isDark && styles.barLightShadow,
      ]}>
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
              <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                <Text style={[styles.badgeText, { color: colors.white }]}>
                  {runningCount > 99 ? "99+" : runningCount}
                </Text>
              </View>
            )}
          </View>
          <Text
            style={[
              styles.tabLabel,
              { color: colors.textTertiary },
              activeTab === "actions" && { color: colors.primary },
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
              { color: colors.textTertiary },
              activeTab === "recordings" && { color: colors.primary },
            ]}
          >
            Recordings
          </Text>
        </Pressable>
      </View>

      {/* Centered Record Button */}
      <View style={styles.recordButtonContainer}>
        <View style={[
          styles.recordButtonOuter,
          { backgroundColor: colors.backgroundElevated, borderColor: colors.border },
          !isDark && styles.recordButtonOuterLightShadow,
        ]}>
          <Pressable
            onPress={onRecordPress}
            disabled={recordDisabled}
            style={({ pressed }) => [
              styles.recordButton,
              { backgroundColor: recordButtonBg },
              recordButtonBorder,
              pressed && styles.recordButtonPressed,
            ]}
          >
            <Ionicons name="mic" size={36} color={recordIconColor} />
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
    borderTopWidth: 1,
    paddingBottom: 28, // Safe area padding
    paddingTop: spacing.md,
    paddingHorizontal: spacing.xl,
    width: "100%",
  },
  barLightShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 4,
    borderTopWidth: 0,
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
    marginTop: 4,
  },
  iconContainer: {
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -10,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
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
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  recordButtonOuterLightShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 0,
  },
  recordButton: {
    width: RECORD_BUTTON_SIZE,
    height: RECORD_BUTTON_SIZE,
    borderRadius: RECORD_BUTTON_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.md,
  },
  recordButtonPressed: {
    transform: [{ scale: 0.95 }],
    opacity: 0.9,
  },
});
