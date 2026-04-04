import { useEffect, useCallback, type ReactNode } from "react";
import { useShareIntent as useExpoShareIntent } from "expo-share-intent";
import { Alert } from "react-native";
import { id } from "@instantdb/react-native";
import { db } from "@/lib/db";
import { importSharedAudio } from "@/lib/audio";
import { transcribeAudio } from "@/lib/transcription";
import { summarizeInput } from "@/lib/summarize";

// expo-share-intent uses `path` in unified type but `filePath` on Android
function getFilePath(file: {
  path?: string;
  filePath?: string;
}): string | undefined {
  return file.path || file.filePath;
}

function isAudioFile(file: {
  mimeType?: string;
  path?: string;
  filePath?: string;
}): boolean {
  const path = getFilePath(file);
  return (
    file.mimeType?.startsWith("audio/") === true ||
    /\.(m4a|mp3|wav|aac|ogg|flac|wma)$/i.test(path || "")
  );
}

async function createNote(input: string, source: string) {
  const noteId = id();
  const now = Date.now();
  const trimmed = input.trim();

  await db.transact(
    db.tx.notes[noteId].update({
      transcript: trimmed,
      status: "pending",
      source,
      errorMessage: "",
      createdAt: now,
      transcribedAt: now,
    })
  );

  // Generate summary in background
  summarizeInput(trimmed).then((summary) => {
    if (summary) {
      db.transact(db.tx.notes[noteId].update({ summary }));
    }
  });

  return noteId;
}

export function ShareIntentHandler({ children }: { children?: ReactNode }) {
  const { shareIntent, resetShareIntent } = useExpoShareIntent({
    resetOnBackground: false,
  });

  const handleSharedText = useCallback(
    async (text: string) => {
      if (!text.trim()) {
        resetShareIntent();
        return;
      }

      try {
        await createNote(text, "share-text");
        Alert.alert("Note Saved", "Your shared text has been queued for task extraction.");
      } catch (error) {
        console.error("Failed to create note from shared text:", error);
        Alert.alert("Error", "Failed to save shared text.");
      }
      resetShareIntent();
    },
    [resetShareIntent]
  );

  const handleSharedUrl = useCallback(
    async (url: string, meta?: Record<string, string | undefined> | null) => {
      const title = meta?.title;
      const input = title ? `${title}\n${url}` : url;

      try {
        await createNote(input, "share-url");
        Alert.alert("Note Saved", "URL has been queued for task extraction.");
      } catch (error) {
        console.error("Failed to create note from shared URL:", error);
        Alert.alert("Error", "Failed to save shared URL.");
      }
      resetShareIntent();
    },
    [resetShareIntent]
  );

  const handleSharedFiles = useCallback(
    async (
      files: {
        path?: string;
        filePath?: string;
        fileName?: string;
        mimeType?: string;
      }[]
    ) => {
      const audioFiles = files.filter(
        (f) => getFilePath(f) && isAudioFile(f)
      );

      if (audioFiles.length === 0) {
        Alert.alert(
          "Unsupported Files",
          "Please share audio files (.m4a, .mp3, .wav, etc.)"
        );
        resetShareIntent();
        return;
      }

      let imported = 0;
      let failed = 0;

      for (const file of audioFiles) {
        const filePath = getFilePath(file);
        if (!filePath) continue;

        try {
          const recordingId = id();
          const result = await importSharedAudio(filePath, recordingId);

          if (result.exceedsTranscriptionLimit) {
            Alert.alert(
              "File Too Large",
              `${file.fileName || "Audio file"} exceeds the 25MB transcription limit.`
            );
            failed++;
            continue;
          }

          // Transcribe
          const transcription = await transcribeAudio(result.filePath);
          if (!transcription || transcription.trim().length === 0) {
            failed++;
            continue;
          }

          await createNote(transcription, "share-audio");
          imported++;
        } catch (error) {
          console.error("Failed to import:", filePath, error);
          failed++;
        }
      }

      const parts: string[] = [];
      if (imported > 0) parts.push(`${imported} transcribed`);
      if (failed > 0) parts.push(`${failed} failed`);

      const message = parts.join(", ");
      if (imported > 0) {
        Alert.alert("Import Complete", message);
      } else {
        Alert.alert("Import Failed", message || "No files were imported.");
      }

      resetShareIntent();
    },
    [resetShareIntent]
  );

  useEffect(() => {
    if (!shareIntent?.type) return;

    if (shareIntent.type === "text" && shareIntent.text) {
      handleSharedText(shareIntent.text);
    } else if (shareIntent.type === "weburl" && shareIntent.webUrl) {
      handleSharedUrl(shareIntent.webUrl, shareIntent.meta);
    } else if (
      (shareIntent.type === "file" || shareIntent.type === "media") &&
      shareIntent.files?.length
    ) {
      handleSharedFiles(shareIntent.files);
    } else {
      resetShareIntent();
    }
  }, [
    shareIntent,
    handleSharedText,
    handleSharedUrl,
    handleSharedFiles,
    resetShareIntent,
  ]);

  return <>{children}</>;
}
