// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from "@instantdb/react-native";

const _schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
      imageURL: i.string().optional(),
      type: i.string().optional(),
    }),
    colors: i.entity({
      value: i.string(),
    }),
    recordings: i.entity({
      // Core data
      localFilePath: i.string(),
      duration: i.number(),
      createdAt: i.number().indexed(),

      // Dedupe for shared files (size:modTime)
      sourceFingerprint: i.string().unique().indexed().optional(),

      // Transcription
      transcription: i.string().optional(),

      // AI-generated title (up to 6 words)
      title: i.string().optional(),

      // Status tracking
      status: i.string().indexed(),
      errorMessage: i.string().optional(),
      retryCount: i.number(),

      // Webhook tracking
      lastAttemptAt: i.number().optional(),

      // Mac listener processing
      processingStatus: i.string().indexed().optional(), // "processing" | "processed" | "failed"
      processingStartedAt: i.number().optional(),
      processingCompletedAt: i.number().optional(),
      processingError: i.string().optional(),
    }),
    actions: i.entity({
      type: i.string().indexed(), // "bug" | "feature" | "todo" | "note" | "question" | "command" | "idea"
      title: i.string(),
      description: i.string().optional(),
      status: i.string().indexed(), // "pending" | "in_progress" | "completed" | "failed"
      extractedAt: i.number().indexed(),
      startedAt: i.number().optional(),
      completedAt: i.number().optional(),
      result: i.string().optional(),
      errorMessage: i.string().optional(),
      syncToken: i.string().unique().indexed(), // Idempotency: `${recordingId}:${index}`
      projectPath: i.string().indexed().optional(),

      // Longrun tracking (for ideas)
      longrunEpicId: i.string().optional(),
      longrunStatus: i.string().indexed().optional(), // "running" | "completed" | "awaiting_feedback"

      // Assumptions made during longrun
      assumptions: i.string().optional(), // JSON: { customer, problem, market, etc. }

      // Variants discovered during research
      variants: i.string().optional(), // JSON array of alternative approaches
      selectedVariant: i.number().optional(), // Index of chosen variant, null = original

      // User feedback
      userFeedback: i.string().optional(),
    }),
  },
  rooms: {},
  links: {
    $usersLinkedPrimaryUser: {
      forward: {
        on: "$users",
        has: "one",
        label: "linkedPrimaryUser",
        onDelete: "cascade",
      },
      reverse: {
        on: "$users",
        has: "many",
        label: "linkedGuestUsers",
      },
    },
    recordingFile: {
      forward: {
        on: "recordings",
        has: "one",
        label: "audioFile",
      },
      reverse: {
        on: "$files",
        has: "one",
        label: "recording",
      },
    },
    recordingActions: {
      forward: {
        on: "actions",
        has: "one",
        label: "recording",
        onDelete: "cascade",
      },
      reverse: {
        on: "recordings",
        has: "many",
        label: "actions",
      },
    },
  },
});

// This helps TypeScript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
