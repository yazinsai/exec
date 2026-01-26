import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import type { Action } from "./ActionItem";
import { colors, spacing, typography, radii } from "@/constants/Colors";

interface Assumption {
  customer?: string;
  problem?: string;
  market?: string;
  [key: string]: string | undefined;
}

interface Variant {
  name: string;
  description: string;
  pros?: string[];
  cons?: string[];
}

interface IdeaFeedbackScreenProps {
  action: Action;
  onAccept: () => void;
  onSelectVariant: (variantIndex: number) => void;
  onSubmitFeedback: (feedback: string) => void;
  onClose: () => void;
}

function parseAssumptions(json: string | undefined): Assumption | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as Assumption;
  } catch {
    return null;
  }
}

function parseVariants(json: string | undefined): Variant[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as Variant[];
  } catch {
    return [];
  }
}

function AssumptionCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.assumptionCard}>
      <Text style={styles.assumptionLabel}>{label}</Text>
      <Text style={styles.assumptionValue}>{value}</Text>
    </View>
  );
}

function VariantCard({
  variant,
  index,
  isImplemented,
  onSelect,
}: {
  variant: Variant;
  index: number;
  isImplemented: boolean;
  onSelect: () => void;
}) {
  return (
    <View style={[styles.variantCard, isImplemented && styles.variantCardImplemented]}>
      <View style={styles.variantHeader}>
        <Text style={styles.variantName}>{variant.name}</Text>
        {isImplemented && (
          <View style={styles.implementedBadge}>
            <Text style={styles.implementedBadgeText}>BUILT</Text>
          </View>
        )}
      </View>
      <Text style={styles.variantDescription}>{variant.description}</Text>

      {variant.pros && variant.pros.length > 0 && (
        <View style={styles.prosConsSection}>
          <Text style={styles.prosLabel}>Pros</Text>
          {variant.pros.map((pro, i) => (
            <Text key={i} style={styles.proItem}>
              + {pro}
            </Text>
          ))}
        </View>
      )}

      {variant.cons && variant.cons.length > 0 && (
        <View style={styles.prosConsSection}>
          <Text style={styles.consLabel}>Cons</Text>
          {variant.cons.map((con, i) => (
            <Text key={i} style={styles.conItem}>
              - {con}
            </Text>
          ))}
        </View>
      )}

      {!isImplemented && (
        <Pressable
          style={({ pressed }) => [styles.exploreButton, pressed && styles.buttonPressed]}
          onPress={onSelect}
        >
          <Text style={styles.exploreButtonText}>Explore This Instead</Text>
        </Pressable>
      )}
    </View>
  );
}

export function IdeaFeedbackScreen({
  action,
  onAccept,
  onSelectVariant,
  onSubmitFeedback,
  onClose,
}: IdeaFeedbackScreenProps) {
  const [showFeedbackInput, setShowFeedbackInput] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");

  const assumptions = parseAssumptions(action.assumptions);
  const variants = parseVariants(action.variants);
  const implementedIndex = action.selectedVariant ?? 0;

  const handleSubmitFeedback = () => {
    if (!feedbackText.trim()) {
      Alert.alert("Feedback Required", "Please enter your feedback before submitting.");
      return;
    }
    onSubmitFeedback(feedbackText.trim());
  };

  const handleSelectVariant = (index: number) => {
    Alert.alert(
      "Explore Variant",
      `This will start a new longrun to implement "${variants[index]?.name}". Continue?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Continue", onPress: () => onSelectVariant(index) },
      ]
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onClose} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={colors.textSecondary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <View style={styles.ideaBadge}>
            <Text style={styles.ideaBadgeText}>IDEA</Text>
          </View>
          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>
              {action.longrunStatus === "awaiting_feedback" ? "Awaiting Feedback" : action.longrunStatus}
            </Text>
          </View>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Title & Description */}
        <Text style={styles.title}>{action.title}</Text>
        {action.description && <Text style={styles.description}>{action.description}</Text>}

        {/* Assumptions Section */}
        {assumptions && Object.keys(assumptions).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Assumptions Made</Text>
            {assumptions.customer && (
              <AssumptionCard label="Customer" value={assumptions.customer} />
            )}
            {assumptions.problem && (
              <AssumptionCard label="Problem" value={assumptions.problem} />
            )}
            {assumptions.market && <AssumptionCard label="Market" value={assumptions.market} />}
            {Object.entries(assumptions)
              .filter(([key]) => !["customer", "problem", "market"].includes(key))
              .map(([key, value]) =>
                value ? <AssumptionCard key={key} label={key} value={value} /> : null
              )}
          </View>
        )}

        {/* What We Built Section */}
        {variants.length > 0 && variants[implementedIndex] && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>What We Built</Text>
            <VariantCard
              variant={variants[implementedIndex]}
              index={implementedIndex}
              isImplemented={true}
              onSelect={() => {}}
            />
          </View>
        )}

        {/* Result */}
        {action.result && (
          <View style={styles.resultBox}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <Text style={styles.resultText}>{action.result}</Text>
          </View>
        )}

        {/* Other Variants Section */}
        {variants.length > 1 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Other Variants Discovered</Text>
            <Text style={styles.sectionSubtitle}>
              These alternative approaches were found during research
            </Text>
            {variants.map((variant, index) =>
              index !== implementedIndex ? (
                <VariantCard
                  key={index}
                  variant={variant}
                  index={index}
                  isImplemented={false}
                  onSelect={() => handleSelectVariant(index)}
                />
              ) : null
            )}
          </View>
        )}

        {/* Feedback Input */}
        {showFeedbackInput && (
          <View style={styles.feedbackSection}>
            <Text style={styles.feedbackTitle}>Your Feedback</Text>
            <TextInput
              style={styles.feedbackInput}
              placeholder="What would you like to change or improve?"
              placeholderTextColor={colors.textMuted}
              multiline
              value={feedbackText}
              onChangeText={setFeedbackText}
              autoFocus
            />
            <View style={styles.feedbackButtons}>
              <Pressable
                style={({ pressed }) => [styles.cancelButton, pressed && styles.buttonPressed]}
                onPress={() => {
                  setShowFeedbackInput(false);
                  setFeedbackText("");
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.submitButton, pressed && styles.buttonPressed]}
                onPress={handleSubmitFeedback}
              >
                <Text style={styles.submitButtonText}>Submit & Iterate</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom Actions */}
      {!showFeedbackInput && (
        <View style={styles.bottomActions}>
          <Pressable
            style={({ pressed }) => [styles.acceptButton, pressed && styles.buttonPressed]}
            onPress={onAccept}
          >
            <Ionicons name="checkmark" size={20} color={colors.background} />
            <Text style={styles.acceptButtonText}>Accept</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.feedbackButton, pressed && styles.buttonPressed]}
            onPress={() => setShowFeedbackInput(true)}
          >
            <Ionicons name="create-outline" size={20} color={colors.primary} />
            <Text style={styles.feedbackButtonText}>Give Feedback</Text>
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  headerSpacer: {
    width: 40,
  },
  ideaBadge: {
    backgroundColor: "#92400e",
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  ideaBadgeText: {
    color: "#fbbf24",
    fontSize: typography.xs,
    fontWeight: "600",
  },
  statusBadge: {
    borderWidth: 1,
    borderColor: "#fbbf24",
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  statusBadgeText: {
    color: "#fbbf24",
    fontSize: typography.xs,
    fontWeight: "500",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 120,
  },
  title: {
    fontSize: typography.xl,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  description: {
    fontSize: typography.base,
    color: colors.textSecondary,
    lineHeight: typography.base * 1.5,
    marginBottom: spacing.lg,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: typography.lg,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  sectionSubtitle: {
    fontSize: typography.sm,
    color: colors.textTertiary,
    marginBottom: spacing.md,
  },
  assumptionCard: {
    backgroundColor: colors.backgroundElevated,
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.sm,
  },
  assumptionLabel: {
    fontSize: typography.xs,
    color: colors.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  assumptionValue: {
    fontSize: typography.base,
    color: colors.textPrimary,
    lineHeight: typography.base * 1.4,
  },
  variantCard: {
    backgroundColor: colors.backgroundElevated,
    padding: spacing.md,
    borderRadius: radii.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  variantCardImplemented: {
    borderColor: colors.success,
  },
  variantHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  variantName: {
    fontSize: typography.base,
    fontWeight: "600",
    color: colors.textPrimary,
    flex: 1,
  },
  implementedBadge: {
    backgroundColor: colors.success,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  implementedBadgeText: {
    color: colors.background,
    fontSize: typography.xs,
    fontWeight: "600",
  },
  variantDescription: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    lineHeight: typography.sm * 1.5,
    marginBottom: spacing.sm,
  },
  prosConsSection: {
    marginTop: spacing.sm,
  },
  prosLabel: {
    fontSize: typography.xs,
    color: colors.success,
    fontWeight: "600",
    marginBottom: spacing.xs,
  },
  consLabel: {
    fontSize: typography.xs,
    color: colors.error,
    fontWeight: "600",
    marginBottom: spacing.xs,
  },
  proItem: {
    fontSize: typography.sm,
    color: colors.success,
    marginBottom: 2,
  },
  conItem: {
    fontSize: typography.sm,
    color: colors.error,
    marginBottom: 2,
  },
  exploreButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.md,
    alignItems: "center",
  },
  exploreButtonText: {
    color: colors.primary,
    fontSize: typography.sm,
    fontWeight: "600",
  },
  resultBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.xl,
  },
  resultText: {
    flex: 1,
    color: colors.success,
    fontSize: typography.sm,
    lineHeight: typography.sm * 1.4,
  },
  feedbackSection: {
    marginTop: spacing.lg,
  },
  feedbackTitle: {
    fontSize: typography.base,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  feedbackInput: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: radii.md,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: typography.base,
    minHeight: 120,
    textAlignVertical: "top",
  },
  feedbackButtons: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    alignItems: "center",
  },
  cancelButtonText: {
    color: colors.textSecondary,
    fontSize: typography.base,
    fontWeight: "600",
  },
  submitButton: {
    flex: 1,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    alignItems: "center",
  },
  submitButtonText: {
    color: colors.background,
    fontSize: typography.base,
    fontWeight: "600",
  },
  bottomActions: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  acceptButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    backgroundColor: colors.success,
    borderRadius: radii.md,
  },
  acceptButtonText: {
    color: colors.background,
    fontSize: typography.base,
    fontWeight: "600",
  },
  feedbackButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.md,
  },
  feedbackButtonText: {
    color: colors.primary,
    fontSize: typography.base,
    fontWeight: "600",
  },
  buttonPressed: {
    opacity: 0.8,
  },
});
