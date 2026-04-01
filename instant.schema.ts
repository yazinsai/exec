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
    tasks: i.entity({
      input: i.string(),
      status: i.string().indexed(),
      result: i.string().optional(),
      source: i.string(),
      sessionId: i.string().optional(),
      liveOutput: i.string().optional(),
      cancelRequested: i.boolean().optional(),
      lastSeenMessageId: i.string().optional(),
      errorMessage: i.string().optional(),
      createdAt: i.number().indexed(),
      startedAt: i.number().optional(),
      completedAt: i.number().optional(),
    }),
    messages: i.entity({
      role: i.string(),
      content: i.string(),
      createdAt: i.number().indexed(),
    }),
  },
  links: {
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
  },
  rooms: {},
});

type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
