import { useEffect, useCallback } from "react";
import { useShareIntent as useExpoShareIntent } from "expo-share-intent";
import { Alert } from "react-native";
import { id } from "@instantdb/react-native";
import { getInfoAsync } from "expo-file-system/legacy";
import { db } from "@/lib/db";
import {
  importSharedAudio,
  MAX_TRANSCRIPTION_SIZE,
  type ImportResult,
} from "@/lib/audio";

async function checkDuplicate(sourceUri: string): Promise<boolean> {
  const info = await getInfoAsync(sourceUri);
  if (!info.exists) return false;

  const fingerprint = `${info.size ?? 0}:${info.modificationTime ?? 0}`;
  const { data } = await db.queryOnce({
    recordings: {
      $: { where: { sourceFingerprint: fingerprint }, limit: 1 },
    },
  });
  return data.recordings.length > 0;
}

function isAudioFile(file: { mimeType?: string; path?: string }): boolean {
  return (
    file.mimeType?.startsWith("audio/") ||
    /\.(m4a|mp3|wav|aac|ogg|flac|wma)$/i.test(file.path || "")
  );
}

export function useShareIntent() {
  const { shareIntent, resetShareIntent } = useExpoShareIntent();

  const handleSharedFiles = useCallback(
    async (files: Array<{ path?: string; fileName?: string; mimeType?: string }>) => {
      const audioFiles = files.filter((f) => f.path && isAudioFile(f));

      if (audioFiles.length === 0) {
        Alert.alert("Unsupported Files", "Please share audio files.");
        resetShareIntent();
        return;
      }

      let imported = 0;
      let skipped = 0;
      let failed = 0;
      let largeFiles = 0;

      for (const file of audioFiles) {
        if (!file.path) continue;

        try {
          // Check for duplicate
          const isDuplicate = await checkDuplicate(file.path);
          if (isDuplicate) {
            skipped++;
            continue;
          }

          const recordingId = id();
          const result: ImportResult = await importSharedAudio(
            file.path,
            recordingId
          );

          await db.transact(
            db.tx.recordings[recordingId].update({
              localFilePath: result.filePath,
              duration: result.duration,
              createdAt: result.createdAt,
              sourceFingerprint: result.sourceFingerprint,
              status: "recorded",
              retryCount: 0,
              errorMessage: null,
            })
          );

          imported++;
          if (result.exceedsTranscriptionLimit) {
            largeFiles++;
          }
        } catch (error) {
          console.error("Failed to import:", file.path, error);
          failed++;
        }
      }

      // Show summary
      const parts: string[] = [];
      if (imported > 0) parts.push(`${imported} imported`);
      if (skipped > 0) parts.push(`${skipped} already existed`);
      if (failed > 0) parts.push(`${failed} failed`);

      let message = parts.join(", ");
      if (largeFiles > 0) {
        message += `\n\n${largeFiles} file(s) exceed the 25MB transcription limit.`;
      }

      if (imported > 0 || skipped > 0) {
        Alert.alert("Import Complete", message);
      } else {
        Alert.alert("Import Failed", message || "No files were imported.");
      }

      resetShareIntent();
    },
    [resetShareIntent]
  );

  useEffect(() => {
    if (!shareIntent) return;

    if (shareIntent.type === "file" && shareIntent.files?.length) {
      handleSharedFiles(shareIntent.files);
    } else if (shareIntent.type) {
      // Non-file share (text, URL, etc) - not supported
      resetShareIntent();
    }
  }, [shareIntent, handleSharedFiles, resetShareIntent]);

  return { hasShareIntent: !!shareIntent };
}
