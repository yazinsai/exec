import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { resolve } from "path";
import { db, id } from "./db";

// Path to the main CLAUDE.md relative to voice-listener
const MIC_APP_ROOT = resolve(import.meta.dir, "../..");
const CLAUDE_MD_PATH = resolve(MIC_APP_ROOT, "CLAUDE.md");

interface PromptVersion {
  id: string;
  version: string;
  createdAt: number;
  claudeMdHash: string;
  notes?: string;
}

let cachedVersionId: string | null = null;

/**
 * Compute SHA256 hash of CLAUDE.md content
 */
export async function computeClaudeMdHash(): Promise<string> {
  const content = await readFile(CLAUDE_MD_PATH, "utf-8");
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Get the short version ID from a full hash (first 12 chars)
 */
export function hashToVersionId(hash: string): string {
  return hash.slice(0, 12);
}

/**
 * Initialize prompt versioning on worker startup.
 * Computes hash of CLAUDE.md, creates version if needed, returns version ID.
 */
export async function initPromptVersioning(): Promise<string> {
  const fullHash = await computeClaudeMdHash();
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
