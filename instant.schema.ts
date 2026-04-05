// Use core so schema works in both React Native app and Bun agent process
import { i } from "@instantdb/core";

const _schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
    }),
    notes: i.entity({
      transcript: i.string(),
      summary: i.string().optional(),
      source: i.string(),
      status: i.string().indexed(),
      triageResult: i.string().optional(),
      errorMessage: i.string().optional(),
      audioFilePath: i.string().optional(),
      legacyTaskId: i.string().optional(),
      createdAt: i.number().indexed(),
      transcribedAt: i.number().optional(),
      triagedAt: i.number().optional(),
    }),
    projects: i.entity({
      slug: i.string().unique().indexed(),
      path: i.string().optional(),
      sessionId: i.string().optional(),
      summary: i.string().optional(),
      createdAt: i.number().indexed(),
    }),
    tasks: i.entity({
      input: i.string(),
      summary: i.string().optional(),
      status: i.string().indexed(),
      result: i.string().optional(),
      source: i.string(),
      rawInput: i.string().optional(),
      blockedReason: i.string().optional(),
      sessionId: i.string().optional(),
      liveOutput: i.string().optional(),
      cancelRequested: i.boolean().optional(),
      lastSeenMessageId: i.string().optional(),
      errorMessage: i.string().optional(),
      audioFilePath: i.string().optional(),
      extractionIndex: i.number().optional(),
      sourceSnippet: i.string().optional(),
      projectSlug: i.string().optional(),
      triageRunId: i.string().optional(),
      read: i.boolean().optional(),
      createdAt: i.number().indexed(),
      startedAt: i.number().optional(),
      completedAt: i.number().optional(),
    }),
    taskDependencies: i.entity({
      createdAt: i.number().indexed(),
    }),
    messages: i.entity({
      role: i.string(),
      content: i.string(),
      createdAt: i.number().indexed(),
    }),
  },
  links: {
    noteTasks: {
      forward: {
        on: "tasks",
        has: "one",
        label: "note",
        onDelete: "cascade",
      },
      reverse: {
        on: "notes",
        has: "many",
        label: "tasks",
      },
    },
    projectTasks: {
      forward: {
        on: "tasks",
        has: "one",
        label: "project",
      },
      reverse: {
        on: "projects",
        has: "many",
        label: "tasks",
      },
    },
    taskMessages: {
      forward: {
        on: "messages",
        has: "one",
        label: "task",
        onDelete: "cascade",
      },
      reverse: {
        on: "tasks",
        has: "many",
        label: "messages",
      },
    },
    dependencyTask: {
      forward: {
        on: "taskDependencies",
        has: "one",
        label: "task",
        onDelete: "cascade",
      },
      reverse: {
        on: "tasks",
        has: "many",
        label: "dependencies",
      },
    },
    dependencyDependsOn: {
      forward: {
        on: "taskDependencies",
        has: "one",
        label: "dependsOn",
        onDelete: "cascade",
      },
      reverse: {
        on: "tasks",
        has: "many",
        label: "dependents",
      },
    },
  },
  rooms: {},
});

type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
