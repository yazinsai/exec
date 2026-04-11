/** Placeholder written to note.summary while transcription is in progress. */
export const SUMMARY_PLACEHOLDER = "Transcribing...";

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
      return "Transcription failed";
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
  if (counts.running > 0) parts.push(`${counts.running} Running`);
  if (counts.pending > 0) parts.push(`${counts.pending} Queued`);
  if (counts.blocked > 0) parts.push(`${counts.blocked} Blocked`);
  if (counts.done > 0) parts.push(`${counts.done} Done`);
  if (counts.failed > 0) parts.push(`${counts.failed} Failed`);
  if (counts.cancelled > 0) parts.push(`${counts.cancelled} Cancelled`);
  if (counts.transcribing > 0) parts.push(`${counts.transcribing} Transcribing`);
  if (counts.transcriptionFailed > 0) {
    parts.push(`${counts.transcriptionFailed} Transcription failed`);
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

/** Running / blocked / failed — for home “attention” strip */
export function computeAttentionCounts(tasks: { status?: string | null }[]): {
  running: number;
  blocked: number;
  failed: number;
} {
  let running = 0;
  let blocked = 0;
  let failed = 0;
  for (const t of tasks) {
    switch (t.status) {
      case TASK_STATUSES.running:
        running += 1;
        break;
      case TASK_STATUSES.blocked:
        blocked += 1;
        break;
      case TASK_STATUSES.failed:
        failed += 1;
        break;
      default:
        break;
    }
  }
  return { running, blocked, failed };
}

function humanizeReasonKey(key: string): string {
  return key
    .split(/_/g)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Human copy for dependency / agent blockedReason codes.
 * Never return a bare “blocked” — always a concrete phrase.
 */
export function describeBlockedSituation(
  blockedReason: string | null | undefined,
  errorMessage: string | null | undefined
): string {
  const r = (blockedReason || "").trim();
  if (r === "waiting_on_dependencies") return "Waiting on earlier step";
  if (r === "dependency_failed") return "Earlier step failed";
  if (r === "dependency_cancelled") return "Earlier step cancelled";
  if (r === "waiting_on_user" || r === "needs_user" || r === "needs_user_input") {
    return "Needs your input";
  }
  if (r === "waiting_on_device" || r === "simulator" || r === "ios_simulator") {
    return "Waiting on simulator / device";
  }
  if (r === "waiting_on_permissions" || r === "missing_permissions") {
    return "Missing permissions";
  }
  if (r) return humanizeReasonKey(r);
  const em = (errorMessage || "").trim();
  if (em) return em.length > 80 ? `${em.slice(0, 80)}…` : em;
  return "Waiting";
}

/**
 * One-line status for step rows and attention strip — same vocabulary as
 * run badges (Blocked, Failed, Running, …). Long blocked/failed copy lives
 * in expanded details only (describeBlockedSituation / error snippets).
 */
export function getStepProgressHeadline(
  status: string,
  _blockedReason?: string | null,
  _errorMessage?: string | null
): string {
  return formatTaskStatusLabel(status);
}

/** Note still has work or errors (shown in “Now”, not buried in history-only). */
export function noteIsSettledForHistory(note: {
  status: string;
  tasks?: { status?: string | null }[];
}): boolean {
  if (
    note.status === NOTE_STATUSES.transcribing ||
    note.status === NOTE_STATUSES.pending ||
    note.status === NOTE_STATUSES.triaging
  ) {
    return false;
  }
  if (
    note.status === NOTE_STATUSES.transcriptionFailed ||
    note.status === NOTE_STATUSES.triageFailed
  ) {
    return false;
  }
  const tasks = note.tasks ?? [];
  if (tasks.length === 0) {
    return (
      note.status === NOTE_STATUSES.ready || note.status === NOTE_STATUSES.empty
    );
  }
  return tasks.every(
    (t) =>
      t.status === TASK_STATUSES.done || t.status === TASK_STATUSES.cancelled
  );
}
