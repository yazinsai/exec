import { useState } from "react";
import { View, Text, Pressable, Modal, StyleSheet } from "react-native";
import * as Updates from "expo-updates";
import Constants from "expo-constants";
import { spacing, typography, radii } from "@/constants/Colors";
import { useThemeColors } from "@/hooks/useThemeColors";

export function VersionBadge() {
  const { colors, isDark } = useThemeColors();
  const [showDetails, setShowDetails] = useState(false);

  const updateId = Updates.updateId;
  const channel = Updates.channel;
  const isEmbedded = Updates.isEmbeddedLaunch;
  const appVersion = Constants.expoConfig?.version ?? "?";

  // Short display: first 7 chars of update ID or "dev" if embedded
  const shortId = updateId ? updateId.slice(0, 7) : (isEmbedded ? "embedded" : "dev");

  return (
    <>
      <Pressable onPress={() => setShowDetails(true)} style={[styles.badge, { backgroundColor: colors.backgroundElevated }, !isDark && styles.badgeLightBorder]}>
        <View style={[styles.dot, { backgroundColor: updateId ? colors.success : colors.warning }]} />
        <Text style={[styles.badgeText, { color: colors.textMuted }]}>{shortId}</Text>
      </Pressable>

      <Modal
        visible={showDetails}
        animationType="fade"
        transparent
        onRequestClose={() => setShowDetails(false)}
      >
        <Pressable style={[styles.overlay, { backgroundColor: colors.overlayLight }]} onPress={() => setShowDetails(false)}>
          <View style={[styles.modal, { backgroundColor: colors.backgroundElevated }]}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>App Info</Text>

            <View style={[styles.row, { borderBottomColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.textTertiary }]}>Version</Text>
              <Text style={[styles.value, { color: colors.textPrimary }]}>{appVersion}</Text>
            </View>

            <View style={[styles.row, { borderBottomColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.textTertiary }]}>Channel</Text>
              <Text style={[styles.value, { color: colors.textPrimary }]}>{channel ?? "N/A"}</Text>
            </View>

            <View style={[styles.row, { borderBottomColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.textTertiary }]}>Update ID</Text>
              <Text style={[styles.value, styles.mono, { color: colors.textPrimary }]}>{updateId ?? "None (embedded)"}</Text>
            </View>

            <View style={[styles.row, { borderBottomColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.textTertiary }]}>Embedded</Text>
              <Text style={[styles.value, { color: colors.textPrimary }]}>{isEmbedded ? "Yes" : "No"}</Text>
            </View>

            <Text style={[styles.hint, { color: colors.textMuted }]}>
              {updateId
                ? "Running OTA update"
                : "Running embedded bundle (no OTA updates yet)"}
            </Text>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
    gap: 6,
  },
  badgeLightBorder: {
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.08)",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: typography.xs,
    fontFamily: "SpaceMono",
  },
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  modal: {
    borderRadius: radii.lg,
    padding: spacing.lg,
    width: "100%",
    maxWidth: 320,
  },
  title: {
    fontSize: typography.lg,
    fontWeight: "600",
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  label: {
    fontSize: typography.sm,
  },
  value: {
    fontSize: typography.sm,
    textAlign: "right",
    flex: 1,
    marginLeft: spacing.md,
  },
  mono: {
    fontFamily: "SpaceMono",
    fontSize: typography.xs,
  },
  hint: {
    fontSize: typography.xs,
    marginTop: spacing.lg,
    textAlign: "center",
  },
});
