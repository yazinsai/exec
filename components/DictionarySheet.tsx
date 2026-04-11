import { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  Modal,
  KeyboardAvoidingView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Iconify } from "react-native-iconify";
import { id } from "@instantdb/react-native";
import * as Haptics from "expo-haptics";
import { db } from "@/lib/db";
import { useColors } from "@/hooks/useThemeColors";
import { spacing, typography, fontFamily, radii } from "@/constants/Colors";
import type { DictionaryTerm } from "@/lib/transcription";

interface DictionarySheetProps {
  visible: boolean;
  onClose: () => void;
  terms: (DictionaryTerm & { id: string })[];
}

export function DictionarySheet({ visible, onClose, terms }: DictionarySheetProps) {
  const colors = useColors();
  const [newTerm, setNewTerm] = useState("");

  const addTerm = useCallback(async () => {
    const trimmed = newTerm.trim();
    if (!trimmed) return;

    const exists = terms.some(
      (t) => t.term.toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      Alert.alert("Duplicate", `"${trimmed}" is already in the dictionary.`);
      return;
    }

    await db.transact(
      db.tx.dictionaryTerms[id()].update({
        term: trimmed,
        createdAt: Date.now(),
      })
    );
    setNewTerm("");
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [newTerm, terms]);

  const deleteTerm = useCallback(async (termId: string, termText: string) => {
    Alert.alert("Remove", `Remove "${termText}" from dictionary?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          await db.transact(db.tx.dictionaryTerms[termId].delete());
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
      },
    ]);
  }, []);

  const sorted = [...terms].sort((a, b) => a.term.localeCompare(b.term));

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior="padding"
      >
        <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: spacing.xl,
              paddingVertical: spacing.md,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <Text
              style={{
                fontSize: typography.lg,
                fontFamily: fontFamily.bold,
                color: colors.textPrimary,
              }}
            >
              Dictionary
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Iconify icon="solar:close-circle-linear" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Add term input */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: spacing.xl,
              paddingVertical: spacing.md,
              gap: spacing.sm,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <TextInput
              value={newTerm}
              onChangeText={setNewTerm}
              placeholder="Add a term..."
              placeholderTextColor={colors.textTertiary}
              returnKeyType="done"
              onSubmitEditing={addTerm}
              autoCorrect={false}
              autoCapitalize="none"
              style={{
                flex: 1,
                fontSize: typography.base,
                fontFamily: fontFamily.regular,
                color: colors.textPrimary,
                backgroundColor: colors.backgroundSubtle,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: radii.sm,
              }}
            />
            <Pressable
              onPress={addTerm}
              style={({ pressed }) => ({
                backgroundColor: newTerm.trim()
                  ? colors.primary
                  : colors.backgroundSubtle,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: radii.sm,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Iconify
                icon="solar:add-circle-linear"
                size={20}
                color={newTerm.trim() ? "#fff" : colors.textTertiary}
              />
            </Pressable>
          </View>

          {/* Term list */}
          <FlatList
            data={sorted}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{
              paddingHorizontal: spacing.xl,
              paddingBottom: spacing.xxl,
            }}
            ListEmptyComponent={
              <View
                style={{
                  paddingTop: spacing.xxl * 2,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: colors.textTertiary,
                    fontSize: typography.base,
                    fontFamily: fontFamily.regular,
                    textAlign: "center",
                  }}
                >
                  No terms yet.{"\n"}Add words that get misspelled during transcription.
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.sm,
                  paddingVertical: spacing.md,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <Pressable
                  onLongPress={() => deleteTerm(item.id, item.term)}
                  style={({ pressed }) => ({
                    flex: 1,
                    minWidth: 0,
                    flexDirection: "row",
                    alignItems: "center",
                    opacity: pressed ? 0.65 : 1,
                  })}
                >
                  <Text
                    numberOfLines={2}
                    style={{
                      flex: 1,
                      fontSize: typography.base,
                      fontFamily: fontFamily.medium,
                      color: colors.textPrimary,
                    }}
                  >
                    {item.term}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => deleteTerm(item.id, item.term)}
                  accessibilityLabel={`Remove ${item.term}`}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={({ pressed }) => ({
                    padding: spacing.xs,
                    opacity: pressed ? 0.55 : 1,
                  })}
                >
                  <Iconify
                    icon="solar:close-circle-bold"
                    size={22}
                    color={colors.textTertiary}
                  />
                </Pressable>
              </View>
            )}
          />
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
