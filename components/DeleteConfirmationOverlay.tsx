import { View, Text, Pressable, StyleSheet, Modal } from "react-native";
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { colors, spacing, typography, radii, shadows } from "@/constants/Colors";

interface DeleteConfirmationOverlayProps {
  visible: boolean;
  title?: string;
  message?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteConfirmationOverlay({
  visible,
  title = "Delete Recording",
  message,
  onCancel,
  onConfirm,
}: DeleteConfirmationOverlayProps) {
  const handleDelete = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    onConfirm();
  };

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent>
      <View style={styles.container}>
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          style={styles.backdrop}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        </Animated.View>

        <Animated.View
          entering={SlideInDown.springify().damping(20).stiffness(300)}
          exiting={SlideOutDown.duration(200)}
          style={styles.dialog}
        >
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <View style={styles.trashIcon}>
                <View style={styles.trashLid} />
                <View style={styles.trashBody}>
                  <View style={styles.trashLine} />
                  <View style={styles.trashLine} />
                  <View style={styles.trashLine} />
                </View>
              </View>
            </View>
            <Text style={styles.title}>{title}</Text>
          </View>

          <Text style={styles.description}>
            Are you sure you want to delete this recording? This action cannot be undone.
          </Text>

          {message && (
            <View style={styles.previewContainer}>
              <Text style={styles.previewText} numberOfLines={3}>
                "{message}"
              </Text>
            </View>
          )}

          <View style={styles.buttons}>
            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.cancelButton,
                pressed && styles.cancelButtonPressed,
              ]}
              onPress={onCancel}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.deleteButton,
                pressed && styles.deleteButtonPressed,
              ]}
              onPress={handleDelete}
            >
              <Text style={styles.deleteButtonText}>Delete</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  dialog: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: radii.xl,
    padding: spacing.xl,
    width: "100%",
    maxWidth: 340,
    ...shadows.md,
  },
  header: {
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  trashIcon: {
    alignItems: "center",
  },
  trashLid: {
    width: 20,
    height: 3,
    backgroundColor: colors.error,
    borderRadius: 1.5,
    marginBottom: 2,
  },
  trashBody: {
    width: 16,
    height: 18,
    borderWidth: 2,
    borderColor: colors.error,
    borderTopWidth: 0,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    flexDirection: "row",
    justifyContent: "space-evenly",
    alignItems: "center",
    paddingTop: 2,
  },
  trashLine: {
    width: 2,
    height: 10,
    backgroundColor: colors.error,
    borderRadius: 1,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.xl,
    fontWeight: typography.semibold,
    textAlign: "center",
  },
  description: {
    color: colors.textSecondary,
    fontSize: typography.base,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  previewContainer: {
    backgroundColor: colors.background,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  previewText: {
    color: colors.textTertiary,
    fontSize: typography.sm,
    fontStyle: "italic",
    lineHeight: 18,
  },
  buttons: {
    flexDirection: "row",
    gap: spacing.md,
  },
  button: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonPressed: {
    backgroundColor: colors.backgroundPressed,
  },
  cancelButtonText: {
    color: colors.textPrimary,
    fontSize: typography.md,
    fontWeight: typography.medium,
  },
  deleteButton: {
    backgroundColor: colors.error,
  },
  deleteButtonPressed: {
    backgroundColor: colors.errorDark,
  },
  deleteButtonText: {
    color: colors.white,
    fontSize: typography.md,
    fontWeight: typography.semibold,
  },
});
