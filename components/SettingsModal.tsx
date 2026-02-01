import { View, Text, Pressable, Modal, StyleSheet, Switch, Linking, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { spacing, typography, radii } from "@/constants/Colors";
import { useThemeColors } from "@/hooks/useThemeColors";
import { usePushNotifications } from "@/hooks/usePushNotifications";

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  onVocabularyPress: () => void;
  vocabularyCount: number;
}

export function SettingsModal({
  visible,
  onClose,
  onVocabularyPress,
  vocabularyCount,
}: SettingsModalProps) {
  const { colors, isDark } = useThemeColors();
  const insets = useSafeAreaInsets();
  const {
    isEnabled: notificationsEnabled,
    isLoading: notificationsLoading,
    permissionStatus,
    enableNotifications,
    disableNotifications,
    debugLog,
  } = usePushNotifications();

  const handleNotificationToggle = async (value: boolean) => {
    if (value) {
      const success = await enableNotifications();
      // If permission was denied, open settings
      if (!success && permissionStatus === "denied") {
        Linking.openSettings();
      }
    } else {
      await disableNotifications();
    }
  };

  const getNotificationStatusText = () => {
    if (notificationsLoading) return "Checking...";
    if (permissionStatus === "denied") return "Denied in Settings";
    if (notificationsEnabled) return "Enabled";
    return "Disabled";
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.fullScreenModal,
          {
            backgroundColor: colors.backgroundElevated,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        {/* Header with close button */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Settings
          </Text>
          <Pressable
            onPress={onClose}
            style={styles.closeButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={24} color={colors.textMuted} />
          </Pressable>
        </View>
        {/* Notifications Toggle */}
          <View
            style={[
              styles.menuItem,
              { borderBottomColor: colors.border },
            ]}
          >
            <View
              style={[
                styles.iconContainer,
                { backgroundColor: "#FF6B35" + "20" },
              ]}
            >
              <Ionicons name="notifications" size={18} color="#FF6B35" />
            </View>
            <View style={styles.menuItemContent}>
              <Text style={[styles.menuItemLabel, { color: colors.textPrimary }]}>
                Push Notifications
              </Text>
              <Text style={[styles.countBadge, { color: colors.textMuted }]}>
                {getNotificationStatusText()}
              </Text>
            </View>
            {permissionStatus === "denied" ? (
              <Pressable
                onPress={() => Linking.openSettings()}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={{ color: colors.primary, fontSize: typography.sm }}>
                  Settings
                </Text>
              </Pressable>
            ) : (
              <Switch
                value={notificationsEnabled}
                onValueChange={handleNotificationToggle}
                disabled={notificationsLoading}
                trackColor={{ false: colors.border, true: "#FF6B35" + "80" }}
                thumbColor={notificationsEnabled ? "#FF6B35" : colors.textMuted}
                ios_backgroundColor={colors.border}
              />
            )}
          </View>

          {/* Dictionary Terms */}
          <Pressable
            style={({ pressed }) => [
              styles.menuItem,
              { borderBottomColor: colors.border },
              pressed && { backgroundColor: colors.backgroundPressed },
            ]}
            onPress={() => {
              onClose();
              onVocabularyPress();
            }}
          >
            <View
              style={[
                styles.iconContainer,
                { backgroundColor: colors.primary + "20" },
              ]}
            >
              <Ionicons name="text" size={18} color={colors.primary} />
            </View>
            <View style={styles.menuItemContent}>
              <Text style={[styles.menuItemLabel, { color: colors.textPrimary }]}>
                Dictionary Terms
              </Text>
              <Text style={[styles.countBadge, { color: colors.textMuted }]}>
                {vocabularyCount} {vocabularyCount === 1 ? "term" : "terms"}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textMuted}
            />
          </Pressable>

        {/* Debug Log - takes remaining space */}
        {debugLog.length > 0 && (
          <View style={[styles.debugContainer, { backgroundColor: colors.backgroundPressed }]}>
            <Text style={[styles.debugTitle, { color: colors.textMuted }]}>
              Debug Log
            </Text>
            <ScrollView
              style={styles.debugScroll}
              contentContainerStyle={styles.debugScrollContent}
              showsVerticalScrollIndicator
            >
              {debugLog.map((entry, i) => (
                <Text
                  key={i}
                  style={[
                    styles.debugEntry,
                    { color: entry.includes("ERROR") ? "#ef4444" : colors.textMuted },
                  ]}
                >
                  {entry}
                </Text>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fullScreenModal: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: typography.lg,
    fontWeight: "600",
  },
  closeButton: {
    padding: spacing.xs,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  menuItemContent: {
    flex: 1,
  },
  menuItemLabel: {
    fontSize: typography.base,
    fontWeight: "500",
  },
  countBadge: {
    fontSize: typography.sm,
    marginTop: 2,
  },
  debugContainer: {
    flex: 1,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
  debugTitle: {
    fontSize: typography.xs,
    fontWeight: "600",
    marginBottom: spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  debugScroll: {
    flex: 1,
  },
  debugScrollContent: {
    paddingBottom: spacing.lg,
  },
  debugEntry: {
    fontSize: 10,
    fontFamily: "monospace",
    lineHeight: 14,
  },
});
