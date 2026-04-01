import { init } from "@instantdb/react-native";
import schema from "../instant.schema";

const appId = process.env.EXPO_PUBLIC_INSTANT_APP_ID;

if (!appId) {
  console.error("EXPO_PUBLIC_INSTANT_APP_ID is not set");
}

export const db = init({
  appId,
  schema,
});
