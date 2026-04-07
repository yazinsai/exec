import { query, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { getProjectsRoot, loadProjectIndexMarkdown, normalizeProjectSlug } from "./project-index";

type RawTriageTask = {
  title?: unknown;
  action?: unknown;
  project?: unknown;
  dependsOn?: unknown;
  sourceSnippet?: unknown;
};

type RawTriageOutput = {
  summary?: unknown;
  tasks?: unknown;
};

export type TriageTask = {
  title: string;
  action: string;
  projectSlug: string | null;
  dependsOn: number[];
  sourceSnippet: string | null;
};

export type TriageOutput = {
  summary: string | null;
  tasks: TriageTask[];
  rawStructuredOutput: unknown;
};

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeDependsOn(value: unknown, taskCount: number): number[] {
  if (!Array.isArray(value)) return [];
  const numbers = value
    .map((item) => (typeof item === "number" ? Math.floor(item) : Number.parseInt(String(item), 10)))
    .filter((item) => Number.isFinite(item) && item >= 0 && item < taskCount);

  return Array.from(new Set(numbers)).sort((a, b) => a - b);
}

function normalizeTask(task: RawTriageTask, index: number, taskCount: number): TriageTask | null {
  const title = normalizeText(task.title);
  const action = normalizeText(task.action);
  if (!title || !action) return null;

  const rawProject = normalizeText(task.project);
  const projectSlug = rawProject && rawProject.toLowerCase() !== "null"
    ? normalizeProjectSlug(rawProject)
    : null;

  const dependsOn = normalizeDependsOn(task.dependsOn, taskCount).filter((value) => value !== index);

  return {
    title,
    action,
    projectSlug,
    dependsOn,
    sourceSnippet: normalizeText(task.sourceSnippet),
  };
}

const TRIAGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "tasks"],
  properties: {
    summary: { type: "string" },
    tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "action", "project", "dependsOn", "sourceSnippet"],
        properties: {
          title: { type: "string" },
          action: { type: "string" },
          project: { type: ["string", "null"] },
          dependsOn: {
            type: "array",
            items: { type: "integer", minimum: 0 },
          },
          sourceSnippet: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

export async function triageTranscript(transcript: string, manualDictionaryTerms: string[] = []): Promise<TriageOutput> {
  const indexMarkdown = loadProjectIndexMarkdown();
  const promptParts = [
    "Extract child tasks from this voice note.",
    "",
    "Return tasks only when they are concrete executable actions.",
    "Keep independent tasks independent.",
    "Use dependsOn to model sequential blockers by index.",
    "If two tasks can run in parallel, keep dependsOn empty for both.",
    "For project-linked tasks, use the exact project slug from the project index when possible.",
    "If a task is general and not tied to a project, use null for project.",
    "If nothing actionable exists, return an empty tasks array.",
    "",
    "# Project Index",
    indexMarkdown || "No project index available.",
  ];

  if (manualDictionaryTerms.length > 0) {
    promptParts.push(
      "",
      "# Custom Dictionary",
      "Use these exact spellings when referenced in the transcript:",
      manualDictionaryTerms.join(", "),
    );
  }

  promptParts.push("", "# Voice Note", transcript);

  const q = query({
    prompt: promptParts.join("\n"),
    options: {
      cwd: getProjectsRoot(),
      model: "claude-sonnet-4-6",
      effort: "medium",
      maxTurns: 3,
      permissionMode: "plan",
      outputFormat: {
        type: "json_schema",
        schema: TRIAGE_SCHEMA,
      },
    },
  });

  let resultMessage: SDKResultMessage | null = null;

  for await (const message of q) {
    if (message.type === "result") {
      resultMessage = message;
      break;
    }
  }

  if (!resultMessage || resultMessage.subtype !== "success") {
    const errors = resultMessage?.errors?.join("\n") || "Triage failed";
    throw new Error(errors);
  }

  const raw = (resultMessage.structured_output ?? {}) as RawTriageOutput;
  const taskArray = Array.isArray(raw.tasks) ? raw.tasks as RawTriageTask[] : [];
  const tasks = taskArray
    .map((task, index) => normalizeTask(task, index, taskArray.length))
    .filter((task): task is TriageTask => Boolean(task));

  return {
    summary: normalizeText(raw.summary),
    tasks,
    rawStructuredOutput: resultMessage.structured_output ?? null,
  };
}
