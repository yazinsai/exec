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
      // Expo push notification token for this device
      pushToken: i.string().optional(),
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
      type: i.string().indexed(), // "CodeChange" | "Project" | "Research" | "Write" | "UserTask"
      subtype: i.string().indexed().optional(), // For CodeChange: "bug" | "feature" | "refactor"
      title: i.string(),
      description: i.string().optional(),
      status: i.string().indexed(), // "pending" | "in_progress" | "completed" | "failed" | "cancelled"
      extractedAt: i.number().indexed(),
      startedAt: i.number().optional(),
      completedAt: i.number().optional(),
      result: i.string().optional(),
      errorMessage: i.string().optional(),
      syncToken: i.string().unique().indexed(), // Idempotency: `${recordingId}:${index}`
      projectPath: i.string().indexed().optional(),

      // UserTask-specific fields
      task: i.string().optional(), // What the user needs to do
      why_user: i.string().optional(), // Why this requires human action
      prep_allowed: i.string().optional(), // What AI can prepare in advance
      remind_at: i.string().optional(), // When to remind (ISO timestamp or relative)

      // Thread messages: JSON array of {role: "user"|"assistant", content: string, timestamp: number}
      messages: i.string().optional(),

      // URL to deployed app (e.g., dokku deployment)
      deployUrl: i.string().optional(),

      // Custom label for the deploy/result URL button (defaults to "Open App" if not set)
      deployUrlLabel: i.string().optional(),

      // Live progress from log watcher: JSON with currentTask, todos, recentTools, etc.
      progress: i.string().optional(),

      // Path to debug log file (for log watcher to tail)
      logFile: i.string().optional(),

      // Flag to request cancellation of a running action
      cancelRequested: i.boolean().optional(),

      // Rating system
      rating: i.number().indexed().optional(), // 1-5 stars
      ratingTags: i.string().optional(), // JSON: ["wrong-approach", "incomplete", ...]
      ratingComment: i.string().optional(),
      ratedAt: i.number().indexed().optional(),

      // Execution metrics
      durationMs: i.number().optional(), // Total execution time
      errorCategory: i.string().indexed().optional(), // Structured error type
      toolsUsed: i.number().optional(), // Count of tool invocations

      // Prompt versioning
      promptVersionId: i.string().indexed().optional(),

      // Claude session ID for resuming conversations with --resume flag
      sessionId: i.string().optional(),

      // Sequencing: position in sequence (1-based, null means no sequence)
      sequenceIndex: i.number().indexed().optional(),

      // Deployment mode: true = PR only, false/null = deploy
      prOnly: i.boolean().optional(),

      // Timestamp when user viewed this action (for unread indicators)
      readAt: i.number().optional(),

      // Retry count for auto-retry on recoverable failures
      retryCount: i.number().optional(),
    }),
    promptVersions: i.entity({
      version: i.string().unique().indexed(), // Hash-based version ID (first 12 chars of SHA256)
      createdAt: i.number().indexed(),
      claudeMdHash: i.string().indexed(), // Full SHA256 of CLAUDE.md
      notes: i.string().optional(), // Manual notes about changes

      // Computed metrics (updated by analysis script)
      totalRuns: i.number().optional(),
      avgRating: i.number().optional(),
      successRate: i.number().optional(),
    }),
    vocabularyTerms: i.entity({
      term: i.string().indexed(), // The correct spelling
      createdAt: i.number().indexed(),
    }),
    workerHeartbeats: i.entity({
      name: i.string().unique().indexed(), // "extraction" | "execution"
      lastSeen: i.number().indexed(),
      status: i.string().optional(), // Optional status message
    }),
    pushTokens: i.entity({
      token: i.string().unique().indexed(), // Expo push token
      platform: i.string().indexed(), // "ios" | "android"
      createdAt: i.number().indexed(),
      updatedAt: i.number().indexed(),
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
    recordingImages: {
      forward: {
        on: "recordings",
        has: "many",
        label: "images",
      },
      reverse: {
        on: "$files",
        has: "one",
        label: "imageRecording",
      },
    },
    actionDependsOn: {
      forward: {
        on: "actions",
        has: "one",
        label: "dependsOn",
      },
      reverse: {
        on: "actions",
        has: "many",
        label: "blockedActions",
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
