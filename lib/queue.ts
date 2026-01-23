import type { InstaQLEntity } from "@instantdb/react-native";
import type { AppSchema } from "@/instant.schema";
import { db } from "./db";
import { uploadToStorage } from "./storage";
import { transcribeAudio } from "./transcription";
import { sendWebhook, type WebhookPayload } from "./webhook";
import { getLocalFileInfo } from "./audio";

export type Recording = InstaQLEntity<AppSchema, "recordings", { audioFile: {} }>;

export type RecordingStatus =
  | "recorded"
  | "uploading"
  | "upload_failed"
  | "uploaded"
  | "transcribing"
  | "transcription_failed"
  | "transcribed"
  | "sending"
  | "send_failed"
  | "sent";

let isProcessing = false;

export async function processQueue(
  webhookUrl: string | null,
  isOnline: boolean
): Promise<void> {
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
              $ne: "sent",
            },
          },
          order: { createdAt: "asc" },
        },
        audioFile: {},
      },
    });

    const recordings = result.data.recordings as Recording[];

    for (const recording of recordings) {
      await processRecording(recording, webhookUrl);
    }
  } catch (error) {
    console.error("Queue processing error:", error);
  } finally {
    isProcessing = false;
  }
}

async function processRecording(
  recording: Recording,
  webhookUrl: string | null
): Promise<void> {
  const { id, status, localFilePath } = recording;

  try {
    if (status === "recorded" || status === "upload_failed") {
      await handleUpload(id, localFilePath);
    }

    const refreshed = await getRecording(id);
    if (!refreshed) return;

    if (refreshed.status === "uploaded" || refreshed.status === "transcription_failed") {
      await handleTranscription(id, localFilePath);
    }

    const afterTranscription = await getRecording(id);
    if (!afterTranscription) return;

    if (
      afterTranscription.status === "transcribed" ||
      afterTranscription.status === "send_failed"
    ) {
      if (webhookUrl) {
        await handleWebhook(afterTranscription, webhookUrl);
      } else {
        // No webhook configured, mark as complete
        await updateStatus(id, "sent");
      }
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
    await updateStatus(id, "upload_failed", getErrorMessage(error));
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

    const transcription = await transcribeAudio(localFilePath);

    await db.transact(
      db.tx.recordings[id].update({
        status: "transcribed",
        transcription,
        errorMessage: null,
      })
    );
  } catch (error) {
    await updateStatus(id, "transcription_failed", getErrorMessage(error));
  }
}

async function handleWebhook(
  recording: Recording,
  webhookUrl: string
): Promise<void> {
  const { id, transcription, duration, createdAt } = recording;
  if (!transcription) return;

  await updateStatus(id, "sending");

  const payload: WebhookPayload = {
    text: transcription,
    recordingId: id,
    duration,
    createdAt,
  };

  try {
    const success = await sendWebhook(webhookUrl, payload);
    if (!success) throw new Error("Webhook returned non-200 status");

    await db.transact(
      db.tx.recordings[id].update({
        status: "sent",
        errorMessage: null,
        lastAttemptAt: Date.now(),
      })
    );
  } catch (error) {
    await db.transact(
      db.tx.recordings[id].update({
        status: "send_failed",
        errorMessage: getErrorMessage(error),
        retryCount: recording.retryCount + 1,
        lastAttemptAt: Date.now(),
      })
    );
  }
}

async function updateStatus(
  id: string,
  status: RecordingStatus,
  errorMessage?: string
): Promise<void> {
  await db.transact(
    db.tx.recordings[id].update({
      status,
      errorMessage: errorMessage ?? null,
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
  upload_failed: "recorded",
  transcription_failed: "uploaded",
  send_failed: "transcribed",
};

export async function retryRecording(id: string): Promise<void> {
  const recording = await getRecording(id);
  if (!recording) return;

  const newStatus = RETRY_STATUS_MAP[recording.status as RecordingStatus];
  if (newStatus) {
    await updateStatus(id, newStatus);
  }
}

export async function deleteRecording(id: string): Promise<void> {
  await db.transact(db.tx.recordings[id].delete());
}
