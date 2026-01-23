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

      // Status tracking
      status: i.string().indexed(),
      errorMessage: i.string().optional(),
      retryCount: i.number(),

      // Webhook tracking
      lastAttemptAt: i.number().optional(),
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
  },
});

// This helps TypeScript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
