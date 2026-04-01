import { init } from "@instantdb/react-native";
import schema from "../instant.schema";

const appId =
  process.env.EXPO_PUBLIC_INSTANT_APP_ID ||
  "7e356cba-464a-4cee-a177-0e731e0853b9";

export const db = init({
  appId,
  schema,
});
