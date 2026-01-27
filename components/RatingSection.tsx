import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { RATING_TAGS } from "@/constants/RatingTags";
import { spacing, typography, radii } from "@/constants/Colors";
import { useThemeColors } from "@/hooks/useThemeColors";
import { db } from "@/lib/db";

interface RatingSectionProps {
  actionId: string;
  existingRating?: number | null;
  existingTags?: string[];
  existingComment?: string | null;
}

export function RatingSection({
  actionId,
  existingRating,
  existingTags = [],
  existingComment,
}: RatingSectionProps) {
  const { colors } = useThemeColors();
  const [rating, setRating] = useState<number>(existingRating ?? 0);
  const [selectedTags, setSelectedTags] = useState<string[]>(existingTags);
  const [comment, setComment] = useState(existingComment ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const hasChanges =
    rating !== (existingRating ?? 0) ||
    JSON.stringify(selectedTags.sort()) !== JSON.stringify(existingTags.sort()) ||
    comment !== (existingComment ?? "");

  const toggleTag = (tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId)
        ? prev.filter((t) => t !== tagId)
        : [...prev, tagId]
    );
    setSaved(false);
  };

  const handleSubmit = async () => {
    if (rating === 0) return;

    setIsSaving(true);
    try {
      await db.transact(
        db.tx.actions[actionId].update({
          rating,
          ratingTags: selectedTags.length > 0 ? JSON.stringify(selectedTags) : null,
          ratingComment: comment.trim() || null,
          ratedAt: Date.now(),
        })
      );
      setSaved(true);
    } catch (error) {
      console.error("Failed to save rating:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={[styles.container, { borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>
        Rate this result
      </Text>

      {/* Star Rating */}
      <View style={styles.starsContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Pressable
            key={star}
            onPress={() => {
              setRating(star);
              setSaved(false);
            }}
            style={styles.starButton}
          >
            <Ionicons
              name={star <= rating ? "star" : "star-outline"}
              size={32}
              color={star <= rating ? colors.warning : colors.textMuted}
            />
          </Pressable>
        ))}
      </View>

      {/* Feedback Text Area - Primary input */}
      <View style={styles.commentSection}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          What could be improved? (optional)
        </Text>
        <TextInput
          style={[
            styles.commentInput,
            { backgroundColor: colors.backgroundElevated, color: colors.textPrimary },
          ]}
          placeholder="Describe what went wrong or what could be better..."
          placeholderTextColor={colors.textMuted}
          multiline
          value={comment}
          onChangeText={(text) => {
            setComment(text);
            setSaved(false);
          }}
        />
      </View>

      {/* Quick Issue Tags */}
      <View style={styles.tagsSection}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          Quick tags (optional)
        </Text>
        <View style={styles.tagsGrid}>
          {RATING_TAGS.map((tag) => {
            const isSelected = selectedTags.includes(tag.id);
            const isPerfect = tag.id === "perfect";
            return (
              <Pressable
                key={tag.id}
                onPress={() => toggleTag(tag.id)}
                style={[
                  styles.tagButton,
                  {
                    backgroundColor: isSelected
                      ? isPerfect
                        ? colors.success + "30"
                        : colors.primary + "20"
                      : colors.backgroundElevated,
                    borderColor: isSelected
                      ? isPerfect
                        ? colors.success
                        : colors.primary
                      : colors.border,
                  },
                ]}
              >
                {isPerfect && isSelected && (
                  <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                )}
                <Text
                  style={[
                    styles.tagText,
                    {
                      color: isSelected
                        ? isPerfect
                          ? colors.success
                          : colors.primary
                        : colors.textSecondary,
                    },
                  ]}
                >
                  {tag.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Submit Button */}
      <Pressable
        onPress={handleSubmit}
        disabled={rating === 0 || isSaving || (saved && !hasChanges)}
        style={({ pressed }) => [
          styles.submitButton,
          {
            backgroundColor:
              rating === 0 || (saved && !hasChanges)
                ? colors.backgroundElevated
                : colors.primary,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        {isSaving ? (
          <Text style={[styles.submitText, { color: colors.white }]}>Saving...</Text>
        ) : saved && !hasChanges ? (
          <View style={styles.savedRow}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={[styles.submitText, { color: colors.success }]}>Saved</Text>
          </View>
        ) : (
          <Text
            style={[
              styles.submitText,
              { color: rating === 0 ? colors.textMuted : colors.white },
            ]}
          >
            {existingRating ? "Update Rating" : "Submit Rating"}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
  },
  title: {
    fontSize: typography.base,
    fontWeight: "600",
    marginBottom: spacing.md,
  },
  starsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  starButton: {
    padding: spacing.xs,
  },
  label: {
    fontSize: typography.sm,
    marginBottom: spacing.sm,
  },
  commentSection: {
    marginBottom: spacing.lg,
  },
  commentInput: {
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: typography.base,
    minHeight: 80,
    textAlignVertical: "top",
  },
  tagsSection: {
    marginBottom: spacing.lg,
  },
  tagsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  tagButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  tagText: {
    fontSize: typography.sm,
    fontWeight: "500",
  },
  submitButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  submitText: {
    fontSize: typography.base,
    fontWeight: "600",
  },
  savedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
});
