import { db, id } from "./db";
import { hashAllPrompts, hashToVersionId } from "./prompt-loader";

interface PromptVersion {
  id: string;
  version: string;
  createdAt: number;
  claudeMdHash: string; // Now stores hash of all prompts/*.md files
  notes?: string;
}

let cachedVersionId: string | null = null;

/**
 * Initialize prompt versioning on worker startup.
 * Computes hash of all prompts/*.md files, creates version if needed, returns version ID.
 */
export async function initPromptVersioning(): Promise<string> {
  const fullHash = hashAllPrompts();
  const versionId = hashToVersionId(fullHash);

  // Check if this version already exists
  const result = await db.query({
    promptVersions: {
      $: {
        where: {
          version: versionId,
        },
      },
    },
  });

  const existingVersions = (result.promptVersions ?? []) as PromptVersion[];

  if (existingVersions.length === 0) {
    // Create new version
    const newId = id();
    await db.transact(
      db.tx.promptVersions[newId].update({
        version: versionId,
        createdAt: Date.now(),
        claudeMdHash: fullHash,
      })
    );
    console.log(`Created new prompt version: ${versionId}`);
  } else {
    console.log(`Using existing prompt version: ${versionId}`);
  }

  cachedVersionId = versionId;
  return versionId;
}

/**
 * Get the current cached version ID.
 * Must call initPromptVersioning() first.
 */
export function getCurrentVersionId(): string | null {
  return cachedVersionId;
}

/**
 * Update metrics on a prompt version (called by analysis script)
 */
export async function updateVersionMetrics(
  versionId: string,
  metrics: {
    totalRuns?: number;
    avgRating?: number;
    successRate?: number;
  }
): Promise<void> {
  const result = await db.query({
    promptVersions: {
      $: {
        where: {
          version: versionId,
        },
      },
    },
  });

  const versions = (result.promptVersions ?? []) as PromptVersion[];
  if (versions.length > 0) {
    await db.transact(
      db.tx.promptVersions[versions[0].id].update(metrics)
    );
  }
}
