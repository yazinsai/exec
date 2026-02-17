#!/usr/bin/env bun
/**
 * Backup InstantDB app: schema, permissions, and all entity data.
 * Usage: bun run scripts/backup.ts
 */

import { db } from "../src/db";
import { writeFileSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import path from "path";

const BACKUP_DIR = path.join(
  import.meta.dir,
  "..",
  "..",
  "db-backups",
  `instantdb-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`
);

// All entities from instant.schema.ts (excluding $files which is system-managed)
const ENTITIES = [
  "recordings",
  "actions",
  "promptVersions",
  "vocabularyTerms",
  "episodes",
  "rules",
  "events",
  "workerHeartbeats",
  "pushTokens",
  "colors",
] as const;

async function backup() {
  mkdirSync(BACKUP_DIR, { recursive: true });
  console.log(`Backup directory: ${BACKUP_DIR}`);

  // 1. Pull schema + perms via CLI
  console.log("\n--- Pulling schema and permissions ---");
  try {
    const pullCmd = `npx instant-cli pull --app ${process.env.INSTANT_APP_ID} --token ${process.env.INSTANT_ADMIN_TOKEN} --yes`;
    execSync(pullCmd, { cwd: path.join(import.meta.dir, ".."), stdio: "pipe" });

    // Copy schema and perms files
    const schemaPath = path.join(import.meta.dir, "..", "..", "instant.schema.ts");
    const permsPath = path.join(import.meta.dir, "..", "..", "instant.perms.ts");
    execSync(`cp "${schemaPath}" "${BACKUP_DIR}/instant.schema.ts" 2>/dev/null || true`);
    execSync(`cp "${permsPath}" "${BACKUP_DIR}/instant.perms.ts" 2>/dev/null || true`);
    console.log("Schema and permissions saved.");
  } catch (e: any) {
    console.warn("Warning: CLI pull failed, copying local files instead.");
    const schemaPath = path.join(import.meta.dir, "..", "..", "instant.schema.ts");
    const permsPath = path.join(import.meta.dir, "..", "..", "instant.perms.ts");
    execSync(`cp "${schemaPath}" "${BACKUP_DIR}/instant.schema.ts" 2>/dev/null || true`);
    execSync(`cp "${permsPath}" "${BACKUP_DIR}/instant.perms.ts" 2>/dev/null || true`);
    console.log("Copied local schema/perms files as fallback.");
  }

  // 2. Export $users
  console.log("\n--- Exporting $users ---");
  try {
    const { $users } = await db.query({ $users: {} });
    writeFileSync(
      path.join(BACKUP_DIR, "$users.json"),
      JSON.stringify($users, null, 2)
    );
    console.log(`  $users: ${$users.length} records`);
  } catch (e: any) {
    console.warn(`  $users: FAILED - ${e.message}`);
  }

  // 3. Export all entities
  console.log("\n--- Exporting entity data ---");
  const summary: Record<string, number> = {};

  for (const entity of ENTITIES) {
    try {
      const result = await db.query({ [entity]: {} });
      const data = result[entity] || [];
      summary[entity] = data.length;

      writeFileSync(
        path.join(BACKUP_DIR, `${entity}.json`),
        JSON.stringify(data, null, 2)
      );
      console.log(`  ${entity}: ${data.length} records`);
    } catch (e: any) {
      console.warn(`  ${entity}: FAILED - ${e.message}`);
      summary[entity] = -1;
    }
  }

  // 4. Export link data by querying entities with their relations
  console.log("\n--- Exporting linked data ---");
  try {
    const { recordings } = await db.query({
      recordings: { actions: {}, audioFile: {}, images: {} },
    });
    writeFileSync(
      path.join(BACKUP_DIR, "recordings-with-links.json"),
      JSON.stringify(recordings, null, 2)
    );
    console.log(`  recordings (with links): ${recordings.length} records`);
  } catch (e: any) {
    console.warn(`  recordings (with links): FAILED - ${e.message}`);
  }

  try {
    const { actions } = await db.query({
      actions: { recording: {}, dependsOn: {}, blockedActions: {}, episodes: {} },
    });
    writeFileSync(
      path.join(BACKUP_DIR, "actions-with-links.json"),
      JSON.stringify(actions, null, 2)
    );
    console.log(`  actions (with links): ${actions.length} records`);
  } catch (e: any) {
    console.warn(`  actions (with links): FAILED - ${e.message}`);
  }

  try {
    const { episodes } = await db.query({ episodes: { action: {} } });
    writeFileSync(
      path.join(BACKUP_DIR, "episodes-with-links.json"),
      JSON.stringify(episodes, null, 2)
    );
    console.log(`  episodes (with links): ${episodes.length} records`);
  } catch (e: any) {
    console.warn(`  episodes (with links): FAILED - ${e.message}`);
  }

  // 5. Write summary
  const summaryData = {
    backupDate: new Date().toISOString(),
    appId: process.env.INSTANT_APP_ID,
    entities: summary,
  };
  writeFileSync(
    path.join(BACKUP_DIR, "backup-summary.json"),
    JSON.stringify(summaryData, null, 2)
  );

  console.log("\n--- Backup complete ---");
  console.log(`Location: ${BACKUP_DIR}`);
  console.log("Summary:", summary);
}

backup().catch((e) => {
  console.error("Backup failed:", e);
  process.exit(1);
});
