import { View, Text, Pressable, FlatList, StyleSheet, Alert } from "react-native";
import { MiniWaveform } from "./Waveform";
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

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } else if (diffDays < 7) {
    return date.toLocaleDateString(undefined, {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function getTitle(recording: Recording): string {
  const date = new Date(recording.createdAt);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
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
  onDelete,
  onShare,
  onPlay,
  isPlaying,
}: {
  recording: Recording;
  onRetry: (id: string) => void;
  onDelete: (id: string) => void;
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
          onPress: () => {
            Alert.alert(
              "Delete Recording",
              "Are you sure? This cannot be undone.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: () => onDelete(recording.id),
                },
              ]
            );
          },
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
          <View style={styles.itemMeta}>
            <Text style={styles.itemDate}>{formatDate(recording.createdAt)}</Text>
            {statusInfo && (
              <>
                <Text style={styles.metaDot}>•</Text>
                <Text style={[styles.itemStatus, { color: statusInfo.color }]}>
                  {statusInfo.label}
                </Text>
              </>
            )}
          </View>
          <View style={styles.waveformRow}>
            <MiniWaveform
              seed={waveformSeed}
              width={120}
              height={20}
              color={colors.primary}
            />
          </View>
        </View>

        <View style={styles.itemRight}>
          <Pressable
            style={[styles.playButton, isPlaying && styles.playButtonActive]}
            onPress={() => onPlay?.(recording)}
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

export function RecordingsList({
  recordings,
  onRetry,
  onDelete,
  onShare,
  onPlay,
  playingId,
}: RecordingsListProps) {
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

  return (
    <FlatList
      data={recordings}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <RecordingItem
          recording={item}
          onRetry={onRetry}
          onDelete={onDelete}
          onShare={onShare}
          onPlay={onPlay}
          isPlaying={playingId === item.id}
        />
      )}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: 160,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.backgroundElevated,
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
    marginBottom: 2,
  },
  itemMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  itemDate: {
    color: colors.textTertiary,
    fontSize: typography.sm,
  },
  metaDot: {
    color: colors.textMuted,
    fontSize: typography.sm,
    marginHorizontal: spacing.sm,
  },
  itemStatus: {
    fontSize: typography.sm,
    fontWeight: typography.medium,
  },
  waveformRow: {
    flexDirection: "row",
    alignItems: "center",
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
