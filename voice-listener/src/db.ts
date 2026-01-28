import { init, id, lookup } from "@instantdb/admin";

const appId = process.env.INSTANT_APP_ID;
const adminToken = process.env.INSTANT_ADMIN_TOKEN;

if (!appId || !adminToken) {
  throw new Error("Missing INSTANT_APP_ID or INSTANT_ADMIN_TOKEN in environment");
}

export const db = init({ appId, adminToken });
export { id, lookup };
