import { useState } from "react";
import { View, Text, Pressable, SectionList, StyleSheet, Alert } from "react-native";
import { MiniWaveform } from "./Waveform";
import { DeleteConfirmationOverlay } from "./DeleteConfirmationOverlay";
import type { Recording } from "@/lib/queue";
import { colors, spacing, typography, radii } from "@/constants/Colors";

interface RecordingsListProps {
  recordings: Recording[];
  onRetry: (id: string) => void;
  onDelete: (id: string) => void;
  onShare: (recording: Recording) => void;
  onPlay?: (recording: Recording) => void;
  playingId?: string | null;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function getTitle(recording: Recording): string {
  const date = new Date(recording.createdAt);
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getStatusInfo(status: string): { label: string; color: string } | null {
  if (status === "sent") return null;

  const statusMap: Record<string, { label: string; color: string }> = {
    recorded: { label: "Pending", color: colors.textTertiary },
    uploading: { label: "Uploading", color: colors.primary },
    upload_failed: { label: "Upload failed", color: colors.error },
    uploaded: { label: "Processing", color: colors.primary },
    transcribing: { label: "Transcribing", color: colors.primary },
    transcription_failed: { label: "Failed", color: colors.error },
    transcribed: { label: "Sending", color: colors.primary },
    sending: { label: "Sending", color: colors.primary },
    send_failed: { label: "Send failed", color: colors.error },
  };
  return statusMap[status] ?? null;
}

function RecordingItem({
  recording,
  onRetry,
  onDeleteRequest,
  onShare,
  onPlay,
  isPlaying,
}: {
  recording: Recording;
  onRetry: (id: string) => void;
  onDeleteRequest: (recording: Recording) => void;
  onShare: (recording: Recording) => void;
  onPlay?: (recording: Recording) => void;
  isPlaying?: boolean;
}) {
  const isFailed = recording.status.includes("failed");
  const statusInfo = getStatusInfo(recording.status);
  const waveformSeed = recording.createdAt;

  const handleLongPress = () => {
    Alert.alert(
      "Recording Options",
      recording.transcription
        ? `"${recording.transcription.slice(0, 100)}${recording.transcription.length > 100 ? "..." : ""}"`
        : undefined,
      [
        ...(isFailed
          ? [{ text: "Retry", onPress: () => onRetry(recording.id) }]
          : []),
        { text: "Export", onPress: () => onShare(recording) },
        {
          text: "Delete",
          style: "destructive" as const,
          onPress: () => onDeleteRequest(recording),
        },
        { text: "Cancel", style: "cancel" as const },
      ]
    );
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
      onPress={() => onPlay?.(recording)}
      onLongPress={handleLongPress}
    >
      <View style={styles.itemContent}>
        <View style={styles.itemInfo}>
          <Text style={styles.itemTitle} numberOfLines={1}>
            {getTitle(recording)}
          </Text>
          {statusInfo && (
            <View style={styles.itemMeta}>
              <Text style={[styles.itemStatus, { color: statusInfo.color }]}>
                {statusInfo.label}
              </Text>
            </View>
          )}
          <View style={styles.waveformRow}>
            {recording.transcription ? (
              <Text style={styles.transcriptSnippet} numberOfLines={2}>
                {recording.transcription}
              </Text>
            ) : (
              <MiniWaveform
                seed={waveformSeed}
                width={120}
                height={20}
                color={colors.primary}
              />
            )}
          </View>
        </View>

        <View style={styles.itemRight}>
          <Pressable
            style={[styles.playButton, isPlaying && styles.playButtonActive]}
            onPress={() => onPlay?.(recording)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {isPlaying ? (
              <View style={styles.stopIcon} />
            ) : (
              <View style={styles.playIcon} />
            )}
          </Pressable>
          <Text style={styles.itemDuration}>
            {formatDuration(recording.duration)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function getDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const recordingDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (recordingDate.getTime() === today.getTime()) {
    return "Today";
  } else if (recordingDate.getTime() === yesterday.getTime()) {
    return "Yesterday";
  }
  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

type Section = {
  title: string;
  data: Recording[];
};

function groupRecordingsByDate(recordings: Recording[]): Section[] {
  const grouped = new Map<string, Recording[]>();

  for (const recording of recordings) {
    const key = getDateKey(recording.createdAt);
    const existing = grouped.get(key) || [];
    grouped.set(key, [...existing, recording]);
  }

  return Array.from(grouped.entries()).map(([title, data]) => ({
    title,
    data,
  }));
}

export function RecordingsList({
  recordings,
  onRetry,
  onDelete,
  onShare,
  onPlay,
  playingId,
}: RecordingsListProps) {
  const [recordingToDelete, setRecordingToDelete] = useState<Recording | null>(null);

  if (recordings.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No recordings yet</Text>
        <Text style={styles.emptySubtitle}>
          Tap the record button to get started
        </Text>
      </View>
    );
  }

  const sections = groupRecordingsByDate(recordings);

  const handleConfirmDelete = () => {
    if (recordingToDelete) {
      onDelete(recordingToDelete.id);
      setRecordingToDelete(null);
    }
  };

  return (
    <>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <RecordingItem
            recording={item}
            onRetry={onRetry}
            onDeleteRequest={setRecordingToDelete}
            onShare={onShare}
            onPlay={onPlay}
            isPlaying={playingId === item.id}
          />
        )}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>{section.title}</Text>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
        stickySectionHeadersEnabled
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
      <DeleteConfirmationOverlay
        visible={!!recordingToDelete}
        message={recordingToDelete?.transcription?.slice(0, 150)}
        onCancel={() => setRecordingToDelete(null)}
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: 160,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  sectionHeader: {
    backgroundColor: colors.background,
    paddingVertical: spacing.md,
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sectionHeaderText: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontWeight: typography.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    paddingBottom: 120,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: typography.lg,
    fontWeight: typography.medium,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    color: colors.textTertiary,
    fontSize: typography.base,
    textAlign: "center",
  },
  item: {
    paddingVertical: spacing.lg,
  },
  itemSeparator: {
    height: spacing.md,
  },
  itemPressed: {
    backgroundColor: colors.backgroundElevated,
  },
  itemContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  itemInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  itemTitle: {
    color: colors.textPrimary,
    fontSize: typography.md,
    fontWeight: typography.medium,
    marginBottom: spacing.xs,
  },
  itemMeta: {
    marginBottom: spacing.sm,
  },
  itemStatus: {
    fontSize: typography.sm,
    fontWeight: typography.medium,
  },
  waveformRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  transcriptSnippet: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    lineHeight: typography.sm * 1.4,
    flex: 1,
  },
  itemRight: {
    alignItems: "center",
    gap: spacing.sm,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  playButtonActive: {
    backgroundColor: colors.error,
  },
  playIcon: {
    width: 0,
    height: 0,
    marginLeft: 3,
    borderLeftWidth: 12,
    borderTopWidth: 7,
    borderBottomWidth: 7,
    borderLeftColor: colors.white,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
  },
  stopIcon: {
    width: 14,
    height: 14,
    backgroundColor: colors.white,
    borderRadius: 2,
  },
  itemDuration: {
    color: colors.textTertiary,
    fontSize: typography.sm,
    fontVariant: ["tabular-nums"],
  },
});
