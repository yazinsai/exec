export const NOTE_STATUSES = {
  transcribing: "transcribing",
  transcriptionFailed: "transcription_failed",
  pending: "pending",
  triaging: "triaging",
  ready: "ready",
  empty: "empty",
  triageFailed: "triage_failed",
} as const;

export const TASK_STATUSES = {
  pending: "pending",
  blocked: "blocked",
  running: "running",
  done: "done",
  failed: "failed",
  cancelled: "cancelled",
  transcribing: "transcribing",
  transcriptionFailed: "transcription_failed",
} as const;

export type NoteStatus = (typeof NOTE_STATUSES)[keyof typeof NOTE_STATUSES];
export type TaskStatus = (typeof TASK_STATUSES)[keyof typeof TASK_STATUSES];

export type NoteTaskStatusCounts = {
  total: number;
  running: number;
  pending: number;
  blocked: number;
  done: number;
  failed: number;
  cancelled: number;
  transcribing: number;
  transcriptionFailed: number;
};

export function computeTaskStatusCounts(
  tasks: { status?: string | null }[]
): NoteTaskStatusCounts {
  const counts: NoteTaskStatusCounts = {
    total: tasks.length,
    running: 0,
    pending: 0,
    blocked: 0,
    done: 0,
    failed: 0,
    cancelled: 0,
    transcribing: 0,
    transcriptionFailed: 0,
  };

  for (const task of tasks) {
    switch (task.status) {
      case TASK_STATUSES.running:
        counts.running += 1;
        break;
      case TASK_STATUSES.pending:
        counts.pending += 1;
        break;
      case TASK_STATUSES.blocked:
        counts.blocked += 1;
        break;
      case TASK_STATUSES.done:
        counts.done += 1;
        break;
      case TASK_STATUSES.failed:
        counts.failed += 1;
        break;
      case TASK_STATUSES.cancelled:
        counts.cancelled += 1;
        break;
      case TASK_STATUSES.transcribing:
        counts.transcribing += 1;
        break;
      case TASK_STATUSES.transcriptionFailed:
        counts.transcriptionFailed += 1;
        break;
      default:
        break;
    }
  }

  return counts;
}

export function formatTaskStatusLabel(status: string): string {
  switch (status) {
    case TASK_STATUSES.pending:
      return "Queued";
    case TASK_STATUSES.blocked:
      return "Blocked";
    case TASK_STATUSES.running:
      return "Running";
    case TASK_STATUSES.done:
      return "Done";
    case TASK_STATUSES.failed:
      return "Failed";
    case TASK_STATUSES.cancelled:
      return "Cancelled";
    case TASK_STATUSES.transcribing:
      return "Transcribing";
    case TASK_STATUSES.transcriptionFailed:
      return "Transcription Failed";
    default:
      return "Pending";
  }
}

export function formatNoteAggregateSummary(
  noteStatus: string,
  counts: NoteTaskStatusCounts
): string {
  if (noteStatus === NOTE_STATUSES.transcribing) return "Transcribing";
  if (noteStatus === NOTE_STATUSES.transcriptionFailed) return "Transcription failed";
  if (noteStatus === NOTE_STATUSES.pending) return "Queued for triage";
  if (noteStatus === NOTE_STATUSES.triaging) return "Extracting child tasks";
  if (noteStatus === NOTE_STATUSES.triageFailed) return "Task extraction failed";
  if (noteStatus === NOTE_STATUSES.empty) return "No child tasks";

  const parts: string[] = [];
  if (counts.running > 0) parts.push(`${counts.running} running`);
  if (counts.pending > 0) parts.push(`${counts.pending} queued`);
  if (counts.blocked > 0) parts.push(`${counts.blocked} blocked`);
  if (counts.done > 0) parts.push(`${counts.done} done`);
  if (counts.failed > 0) parts.push(`${counts.failed} failed`);
  if (counts.cancelled > 0) parts.push(`${counts.cancelled} cancelled`);
  if (counts.transcribing > 0) parts.push(`${counts.transcribing} transcribing`);
  if (counts.transcriptionFailed > 0) {
    parts.push(`${counts.transcriptionFailed} transcription failed`);
  }

  if (parts.length === 0) {
    return counts.total === 0 ? "No child tasks" : `${counts.total} task${counts.total === 1 ? "" : "s"}`;
  }

  return parts.join(", ");
}

export function getTaskSortWeight(status: string): number {
  switch (status) {
    case TASK_STATUSES.running:
      return 0;
    case TASK_STATUSES.pending:
      return 1;
    case TASK_STATUSES.blocked:
      return 2;
    case TASK_STATUSES.transcribing:
      return 3;
    case TASK_STATUSES.transcriptionFailed:
      return 4;
    case TASK_STATUSES.failed:
      return 5;
    case TASK_STATUSES.cancelled:
      return 6;
    case TASK_STATUSES.done:
      return 7;
    default:
      return 8;
  }
}
