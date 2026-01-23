import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useSettings } from "@/hooks/useSettings";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { testWebhook } from "@/lib/webhook";
import { colors, spacing, typography, radii } from "@/constants/Colors";

export default function SettingsScreen() {
  const { webhookUrl, setWebhookUrl, isLoading } = useSettings();
  const { isOnline } = useNetworkStatus();
  const [url, setUrl] = useState(webhookUrl ?? "");
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const trimmedUrl = url.trim();
      await setWebhookUrl(trimmedUrl || null);
      Alert.alert("Saved", "Webhook URL has been saved.");
    } catch (error) {
      Alert.alert("Error", "Failed to save webhook URL.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!url.trim()) {
      Alert.alert("Error", "Please enter a webhook URL first.");
      return;
    }

    if (!isOnline) {
      Alert.alert("Offline", "Cannot test webhook while offline.");
      return;
    }

    setIsTesting(true);
    try {
      const success = await testWebhook(url.trim());
      if (success) {
        Alert.alert("Success", "Test webhook sent successfully!");
      } else {
        Alert.alert("Failed", "Webhook did not return a 200 status.");
      }
    } catch (error) {
      Alert.alert(
        "Error",
        error instanceof Error ? error.message : "Failed to send test webhook."
      );
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Webhook Configuration</Text>
          <Text style={styles.sectionDescription}>
            Transcriptions will be sent to this URL as POST requests with JSON
            body containing the text.
          </Text>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Webhook URL</Text>
            <TextInput
              style={styles.input}
              value={url}
              onChangeText={setUrl}
              placeholder="https://example.com/webhook"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>

          <View style={styles.buttons}>
            <Pressable
              style={[styles.button, styles.saveButton]}
              onPress={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.buttonText}>Save</Text>
              )}
            </Pressable>

            <Pressable
              style={[styles.button, styles.testButton]}
              onPress={handleTest}
              disabled={isTesting || !isOnline}
            >
              {isTesting ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <Text style={[styles.buttonText, styles.testButtonText]}>
                  Test
                </Text>
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Connection Status</Text>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isOnline ? colors.success : colors.error },
              ]}
            />
            <Text style={styles.statusText}>
              {isOnline ? "Online" : "Offline"}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Webhook Payload Format</Text>
          <View style={styles.codeBlock}>
            <Text style={styles.codeText}>
              {`{
  "text": "Transcribed text...",
  "recordingId": "abc123",
  "duration": 12.5,
  "createdAt": 1705123456789
}`}
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  section: {
    marginBottom: spacing.xxl,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.xl,
    fontWeight: typography.semibold,
    marginBottom: spacing.sm,
  },
  sectionDescription: {
    color: colors.textTertiary,
    fontSize: typography.base,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  inputContainer: {
    marginBottom: spacing.lg,
  },
  label: {
    color: colors.textSecondary,
    fontSize: typography.base,
    fontWeight: typography.medium,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: radii.md,
    padding: 14,
    color: colors.textPrimary,
    fontSize: typography.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttons: {
    flexDirection: "row",
    gap: spacing.md,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButton: {
    backgroundColor: colors.primary,
  },
  testButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.primary,
  },
  buttonText: {
    color: colors.white,
    fontSize: typography.lg,
    fontWeight: typography.semibold,
  },
  testButtonText: {
    color: colors.primary,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    color: colors.textSecondary,
    fontSize: typography.md,
  },
  codeBlock: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  codeText: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
});
