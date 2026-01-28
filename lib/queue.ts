import type { InstaQLEntity } from "@instantdb/react-native";
import type { AppSchema } from "@/instant.schema";
import { db } from "./db";
import { uploadToStorage, FileTooLargeError } from "./storage";
import { transcribeAudio } from "./transcription";
import { generateTitle } from "./titleGeneration";
import { getLocalFileInfo, getFileSize, MAX_TRANSCRIPTION_SIZE } from "./audio";

export type Recording = InstaQLEntity<AppSchema, "recordings", { audioFile: {}; actions: {} }>;

export type RecordingStatus =
  | "recorded"
  | "uploading"
  | "upload_failed"
  | "uploaded"
  | "transcribing"
  | "transcription_failed"
  | "transcribed";

let isProcessing = false;

export async function processQueue(isOnline: boolean): Promise<void> {
  if (isProcessing || !isOnline) {
    return;
  }

  isProcessing = true;

  try {
    const result = await db.queryOnce({
      recordings: {
        $: {
          where: {
            status: {
              $ne: "transcribed",
            },
          },
          order: { createdAt: "asc" },
        },
        audioFile: {},
      },
    });

    const recordings = result.data.recordings as Recording[];

    for (const recording of recordings) {
      await processRecording(recording);
    }
  } catch (error) {
    console.error("Queue processing error:", error);
  } finally {
    isProcessing = false;
  }
}

async function processRecording(recording: Recording): Promise<void> {
  const { id, status, localFilePath } = recording;

  try {
    // If the app was killed mid-upload, a recording can get stuck in "uploading".
    // Treat it as retryable and attempt the upload again.
    if (status === "recorded" || status === "upload_failed" || status === "uploading") {
      await handleUpload(id, localFilePath);
    }

    const refreshed = await getRecording(id);
    if (!refreshed) return;

    if (refreshed.status === "uploaded" || refreshed.status === "transcription_failed") {
      await handleTranscription(id, localFilePath);
    }
  } catch (error) {
    console.error(`Error processing recording ${id}:`, error);
  }
}

async function getRecording(id: string): Promise<Recording | null> {
  const result = await db.queryOnce({
    recordings: {
      $: { where: { id } },
      audioFile: {},
    },
  });
  return (result.data.recordings[0] as Recording) ?? null;
}

async function handleUpload(id: string, localFilePath: string): Promise<void> {
  await updateStatus(id, "uploading");

  try {
    const fileInfo = await getLocalFileInfo(localFilePath);
    if (!fileInfo.exists) {
      throw new Error("Local file not found");
    }

    await uploadToStorage(localFilePath, id);
    await updateStatus(id, "uploaded");
  } catch (error) {
    if (error instanceof FileTooLargeError) {
      // Skip upload for large files but continue processing
      console.warn(`Skipping cloud upload for ${id}: ${error.message}`);
      await updateStatus(id, "uploaded");
      return;
    }
    await updateStatus(id, "upload_failed", getErrorMessage(error));
  }
}

/**
 * Build a vocabulary prompt from user-defined terms.
 * Groq Whisper's prompt param is limited to 224 tokens (~900 chars).
 */
async function buildVocabularyPrompt(): Promise<string | undefined> {
  try {
    const result = await db.queryOnce({
      vocabularyTerms: {
        $: { order: { createdAt: "asc" } },
      },
    });

    const terms = result.data.vocabularyTerms;
    if (!terms || terms.length === 0) {
      return undefined;
    }

    // Join terms with commas, prefixed with context
    const termsList = terms.map((t) => t.term).join(", ");
    const prompt = `Vocabulary: ${termsList}`;

    // Limit to ~800 chars to stay safely under 224 token limit
    if (prompt.length > 800) {
      return prompt.slice(0, 800);
    }

    return prompt;
  } catch (error) {
    console.warn("Failed to fetch vocabulary terms:", error);
    return undefined;
  }
}

async function handleTranscription(
  id: string,
  localFilePath: string
): Promise<void> {
  await updateStatus(id, "transcribing");

  try {
    const fileInfo = await getLocalFileInfo(localFilePath);
    if (!fileInfo.exists) {
      throw new Error("Local file not found for transcription");
    }

    // Check file size before attempting transcription
    const fileSize = await getFileSize(localFilePath);
    if (fileSize > MAX_TRANSCRIPTION_SIZE) {
      const sizeMB = Math.round(fileSize / 1024 / 1024);
      const limitMB = Math.round(MAX_TRANSCRIPTION_SIZE / 1024 / 1024);
      throw new Error(
        `File too large for transcription (${sizeMB}MB > ${limitMB}MB limit)`
      );
    }

    // Build vocabulary prompt from user-defined terms
    const vocabularyPrompt = await buildVocabularyPrompt();

    const transcription = await transcribeAudio(localFilePath, vocabularyPrompt);

    // Generate a short title from the transcription
    let title: string | undefined;
    try {
      title = await generateTitle(transcription);
    } catch (err) {
      console.warn("Failed to generate title:", err);
    }

    await db.transact(
      db.tx.recordings[id].update({
        status: "transcribed",
        transcription,
        title: title ?? null,
        errorMessage: null,
      })
    );
  } catch (error) {
    await updateStatus(id, "transcription_failed", getErrorMessage(error));
  }
}

async function updateStatus(
  id: string,
  status: RecordingStatus,
  errorMessage?: string
): Promise<void> {
  // Also stamp the attempt time so we can detect and recover from "stuck" in-progress states.
  await db.transact(
    db.tx.recordings[id].update({
      status,
      errorMessage: errorMessage ?? null,
      lastAttemptAt: Date.now(),
    })
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

const RETRY_STATUS_MAP: Partial<Record<RecordingStatus, RecordingStatus>> = {
  // Failed states
  upload_failed: "recorded",
  transcription_failed: "uploaded",

  // In-progress states (recover from app kill / background suspension)
  uploading: "recorded",
  transcribing: "uploaded",

  // Allow manual re-run even when a stage completed but downstream didn't happen
  uploaded: "uploaded",
};

export async function retryRecording(id: string): Promise<void> {
  const recording = await getRecording(id);
  if (!recording) return;

  const status = recording.status as RecordingStatus;
  const newStatus = RETRY_STATUS_MAP[status];

  if (newStatus) {
    await updateStatus(id, newStatus);
  } else if (status === "transcribed") {
    // Reset processingStatus so extraction worker picks it up again
    await db.transact(
      db.tx.recordings[id].update({
        processingStatus: null,
        processingStartedAt: null,
        processingCompletedAt: null,
        processingError: null,
      })
    );
  }
}

export async function deleteRecording(id: string): Promise<void> {
  await db.transact(db.tx.recordings[id].delete());
}
