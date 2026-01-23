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

export function useShareIntent() {
  const { shareIntent, resetShareIntent } = useExpoShareIntent();

  const handleSharedAudio = useCallback(
    async (fileUri: string, fileName?: string) => {
      // Check for duplicate before importing
      const isDuplicate = await checkDuplicate(fileUri);
      if (isDuplicate) {
        Alert.alert(
          "Already Imported",
          "This recording has already been imported."
        );
        resetShareIntent();
        return;
      }

      const recordingId = id();

      try {
        // Import the shared file
        const result: ImportResult = await importSharedAudio(
          fileUri,
          recordingId
        );

        // Create recording entry in InstantDB
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

        // Warn if file is too large for transcription
        if (result.exceedsTranscriptionLimit) {
          const sizeMB = Math.round(result.fileSize / 1024 / 1024);
          const limitMB = Math.round(MAX_TRANSCRIPTION_SIZE / 1024 / 1024);
          Alert.alert(
            "Large File",
            `This file is ${sizeMB}MB, which exceeds the ${limitMB}MB transcription limit. The recording will be saved but transcription may fail.`,
            [{ text: "OK" }]
          );
        }

        resetShareIntent();
      } catch (error) {
        console.error("Failed to import shared audio:", error);
        Alert.alert(
          "Import Failed",
          error instanceof Error ? error.message : "Failed to import audio file"
        );
        resetShareIntent();
      }
    },
    [resetShareIntent]
  );

  useEffect(() => {
    if (!shareIntent) return;

    // Handle file share
    if (shareIntent.type === "file" && shareIntent.files?.length) {
      const file = shareIntent.files[0];
      // Check if it's an audio file
      const isAudio =
        file.mimeType?.startsWith("audio/") ||
        /\.(m4a|mp3|wav|aac|ogg|flac|wma)$/i.test(file.path || "");

      if (isAudio && file.path) {
        handleSharedAudio(file.path, file.fileName);
      } else {
        Alert.alert("Unsupported File", "Please share an audio file.");
        resetShareIntent();
      }
    } else if (shareIntent.type) {
      // Non-file share (text, URL, etc) - not supported
      resetShareIntent();
    }
  }, [shareIntent, handleSharedAudio, resetShareIntent]);

  return { hasShareIntent: !!shareIntent };
}
