// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from "@instantdb/admin";

const _schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
      imageURL: i.string().optional(),
      pushToken: i.string().optional(),
      type: i.string().optional(),
    }),
    actions: i.entity({
      cancelRequested: i.boolean().optional(),
      completedAt: i.number().optional(),
      deployUrl: i.string().optional(),
      deployUrlLabel: i.string().optional(),
      description: i.string().optional(),
      durationMs: i.number().optional(),
      episodesGenerated: i.boolean().optional(),
      errorCategory: i.string().indexed().optional(),
      errorMessage: i.string().optional(),
      extractedAt: i.number().indexed(),
      lastEventAt: i.number().indexed().optional(),
      logFile: i.string().optional(),
      messages: i.string().optional(),
      prep_allowed: i.string().optional(),
      progress: i.string().optional(),
      projectPath: i.string().indexed().optional(),
      promptVersionId: i.string().indexed().optional(),
      prOnly: i.boolean().optional(),
      ratedAt: i.number().indexed().optional(),
      rating: i.number().indexed().optional(),
      ratingComment: i.string().optional(),
      ratingTags: i.string().optional(),
      readAt: i.number().optional(),
      remind_at: i.string().optional(),
      result: i.string().optional(),
      retryCount: i.number().optional(),
      sequenceIndex: i.number().indexed().optional(),
      sessionId: i.string().optional(),
      startedAt: i.number().optional(),
      status: i.string().indexed(),
      subtype: i.string().indexed().optional(),
      syncToken: i.string().unique().indexed(),
      task: i.string().optional(),
      title: i.string(),
      toolsUsed: i.number().optional(),
      type: i.string().indexed(),
      why_user: i.string().optional(),
    }),
    colors: i.entity({
      value: i.string(),
    }),
    episodes: i.entity({
      changeDescription: i.string().optional(),
      createdAt: i.number().indexed(),
      distilled: i.boolean().indexed().optional(),
      feedbackType: i.string().indexed(),
      narrative: i.string(),
      projectPath: i.string().indexed().optional(),
      projectType: i.string().optional(),
      sourceActionId: i.string().indexed().optional(),
      sourceType: i.string().indexed(),
      tags: i.string().optional(),
      userInput: i.string(),
      workContext: i.string().optional(),
    }),
    events: i.entity({
      actionId: i.string().indexed(),
      createdAt: i.number().indexed(),
      detail: i.string().optional(),
      duration: i.number().optional(),
      icon: i.string(),
      label: i.string(),
      projectPath: i.string().indexed().optional(),
      status: i.string().indexed(),
      type: i.string().indexed(),
    }),
    promptVersions: i.entity({
      avgRating: i.number().optional(),
      claudeMdHash: i.string().indexed(),
      createdAt: i.number().indexed(),
      notes: i.string().optional(),
      successRate: i.number().optional(),
      totalRuns: i.number().optional(),
      version: i.string().unique().indexed(),
    }),
    pushTokens: i.entity({
      createdAt: i.number().indexed(),
      platform: i.string().indexed(),
      token: i.string().unique().indexed(),
      updatedAt: i.number().indexed(),
    }),
    recordings: i.entity({
      createdAt: i.number().indexed(),
      duration: i.number(),
      errorMessage: i.string().optional(),
      lastAttemptAt: i.number().optional(),
      localFilePath: i.string(),
      processingCompletedAt: i.number().optional(),
      processingError: i.string().optional(),
      processingStartedAt: i.number().optional(),
      processingStatus: i.string().indexed().optional(),
      retryCount: i.number(),
      sourceFingerprint: i.string().unique().indexed().optional(),
      status: i.string().indexed(),
      title: i.string().optional(),
      transcription: i.string().optional(),
    }),
    rules: i.entity({
      active: i.boolean().indexed(),
      category: i.string().indexed(),
      confidence: i.number().indexed(),
      conflictsWith: i.string().optional(),
      content: i.string(),
      createdAt: i.number().indexed(),
      crossProjectConfirmed: i.boolean().optional(),
      scope: i.string().indexed(),
      scopeQualifier: i.string().indexed().optional(),
      sourceEpisodeIds: i.string(),
      supportCount: i.number(),
      tags: i.string().optional(),
      updatedAt: i.number().indexed(),
    }),
    vocabularyTerms: i.entity({
      createdAt: i.number().indexed(),
      term: i.string().indexed(),
    }),
    workerHeartbeats: i.entity({
      lastSeen: i.number().indexed(),
      name: i.string().unique().indexed(),
      status: i.string().optional(),
    }),
  },
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
    actionsDependsOn: {
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
    actionsRecording: {
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
    episodesAction: {
      forward: {
        on: "episodes",
        has: "one",
        label: "action",
      },
      reverse: {
        on: "actions",
        has: "many",
        label: "episodes",
      },
    },
    eventsAction: {
      forward: {
        on: "events",
        has: "one",
        label: "action",
      },
      reverse: {
        on: "actions",
        has: "many",
        label: "events",
      },
    },
    recordingsAudioFile: {
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
    recordingsImages: {
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
  },
  rooms: {},
});

// This helps TypeScript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
