import { id } from "@instantdb/admin";
import { NOTE_STATUSES, SUMMARY_PLACEHOLDER } from "../lib/workflow";

function mapLegacyTaskStatusToNoteStatus(status: string): string {
  if (status === "transcribing") return NOTE_STATUSES.transcribing;
  if (status === "transcription_failed") return NOTE_STATUSES.transcriptionFailed;
  return NOTE_STATUSES.ready;
}

export async function migrateLegacyTasksToNotes(db: any) {
  const resp = await db.query({
    tasks: {
      $: { order: { createdAt: "asc" } },
      note: {},
    },
  });

  for (const task of resp.tasks as any[]) {
    if (task.note) continue;

    const noteId = id();
    const transcript =
      task.status === "transcribing" || task.input === SUMMARY_PLACEHOLDER
        ? ""
        : task.input || "";

    await db.transact([
      db.tx.notes[noteId].update({
        transcript,
        summary: task.summary || undefined,
        source: task.source || "legacy",
        status: mapLegacyTaskStatusToNoteStatus(task.status),
        errorMessage: task.errorMessage || "",
        audioFilePath: task.audioFilePath || undefined,
        legacyTaskId: task.id,
        createdAt: task.createdAt,
        transcribedAt:
          task.status === "transcribing" || task.status === "transcription_failed"
            ? undefined
            : task.createdAt,
        triagedAt:
          task.status === "transcribing" || task.status === "transcription_failed"
            ? undefined
            : task.createdAt,
      }),
      db.tx.tasks[task.id].link({ note: noteId }),
    ]);
  }
}
