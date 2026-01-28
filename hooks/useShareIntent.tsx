import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from "react";
import { useShareIntent as useExpoShareIntent } from "expo-share-intent";
import { Alert } from "react-native";
import { id } from "@instantdb/react-native";
import { getInfoAsync } from "expo-file-system/legacy";
import { db } from "@/lib/db";
import {
  importSharedAudio,
  type ImportResult,
} from "@/lib/audio";
import { isImageFile, importSharedImage } from "@/lib/image";

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

export interface PendingImage {
  id: string;
  localPath: string;
}

interface ShareIntentContextValue {
  pendingImages: PendingImage[];
  showRecordingOverlay: boolean;
  clearPendingImages: () => void;
}

const ShareIntentContext = createContext<ShareIntentContextValue>({
  pendingImages: [],
  showRecordingOverlay: false,
  clearPendingImages: () => {},
});

export function useShareIntentState(): ShareIntentContextValue {
  return useContext(ShareIntentContext);
}

export function ShareIntentHandler({ children }: { children?: ReactNode }) {
  const { shareIntent, resetShareIntent } = useExpoShareIntent();
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [showRecordingOverlay, setShowRecordingOverlay] = useState(false);

  const clearPendingImages = useCallback(() => {
    setPendingImages([]);
    setShowRecordingOverlay(false);
  }, []);

  const handleSharedFiles = useCallback(
    async (files: Array<{ path?: string; fileName?: string; mimeType?: string }>) => {
      const audioFiles = files.filter((f) => f.path && isAudioFile(f));
      const imageFiles = files.filter((f) => f.path && isImageFile(f));

      // If only images shared, prompt for voice recording
      if (audioFiles.length === 0 && imageFiles.length > 0) {
        const imported: PendingImage[] = [];
        for (const file of imageFiles) {
          if (!file.path) continue;
          try {
            const imageId = id();
            const result = await importSharedImage(file.path, imageId);
            imported.push({ id: imageId, localPath: result.localPath });
          } catch (error) {
            console.error("Failed to import image:", file.path, error);
          }
        }

        if (imported.length > 0) {
          setPendingImages(imported);
          setShowRecordingOverlay(true);
        } else {
          Alert.alert("Import Failed", "Failed to import images.");
        }
        resetShareIntent();
        return;
      }

      // If no audio files and no images, not supported
      if (audioFiles.length === 0) {
        Alert.alert("Unsupported Files", "Please share audio or image files.");
        resetShareIntent();
        return;
      }

      // Process audio files as before
      let imported = 0;
      let skipped = 0;
      let failed = 0;
      let largeFiles = 0;

      for (const file of audioFiles) {
        if (!file.path) continue;

        try {
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
      resetShareIntent();
    }
  }, [shareIntent, handleSharedFiles, resetShareIntent]);

  return (
    <ShareIntentContext.Provider value={{ pendingImages, showRecordingOverlay, clearPendingImages }}>
      {children}
    </ShareIntentContext.Provider>
  );
}

// Deprecated: use ShareIntentHandler component and useShareIntentState hook instead
export function useShareIntent() {
  const { shareIntent, resetShareIntent } = useExpoShareIntent();
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [showRecordingOverlay, setShowRecordingOverlay] = useState(false);

  const clearPendingImages = useCallback(() => {
    setPendingImages([]);
    setShowRecordingOverlay(false);
  }, []);

  const handleSharedFiles = useCallback(
    async (files: Array<{ path?: string; fileName?: string; mimeType?: string }>) => {
      const audioFiles = files.filter((f) => f.path && isAudioFile(f));
      const imageFiles = files.filter((f) => f.path && isImageFile(f));

      if (audioFiles.length === 0 && imageFiles.length > 0) {
        const imported: PendingImage[] = [];
        for (const file of imageFiles) {
          if (!file.path) continue;
          try {
            const imageId = id();
            const result = await importSharedImage(file.path, imageId);
            imported.push({ id: imageId, localPath: result.localPath });
          } catch (error) {
            console.error("Failed to import image:", file.path, error);
          }
        }

        if (imported.length > 0) {
          setPendingImages(imported);
          setShowRecordingOverlay(true);
        } else {
          Alert.alert("Import Failed", "Failed to import images.");
        }
        resetShareIntent();
        return;
      }

      if (audioFiles.length === 0) {
        Alert.alert("Unsupported Files", "Please share audio or image files.");
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
      resetShareIntent();
    }
  }, [shareIntent, handleSharedFiles, resetShareIntent]);

  return {
    hasShareIntent: !!shareIntent,
    pendingImages,
    showRecordingOverlay,
    clearPendingImages,
  };
}
