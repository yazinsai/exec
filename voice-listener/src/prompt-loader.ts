import { readFileSync, readdirSync } from "fs";
import { createHash } from "crypto";
import { join } from "path";

const PROMPTS_DIR = join(import.meta.dir, "../prompts");

/**
 * Load a prompt template from prompts/ directory and replace {{VARIABLES}}
 */
export function loadPrompt(name: string, vars: Record<string, string>): string {
  const filePath = join(PROMPTS_DIR, `${name}.md`);
  let prompt = readFileSync(filePath, "utf-8");
  
  for (const [key, value] of Object.entries(vars)) {
    prompt = prompt.replaceAll(`{{${key}}}`, value ?? "");
  }
  
  return prompt;
}

/**
 * Hash all prompt files for versioning
 * Returns a SHA256 hash of all prompt files combined
 */
export function hashAllPrompts(): string {
  const files = readdirSync(PROMPTS_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort(); // Ensure consistent ordering
  
  const combined = files
    .map((f) => readFileSync(join(PROMPTS_DIR, f), "utf-8"))
    .join("\n---\n");
  
  return createHash("sha256").update(combined).digest("hex");
}

/**
 * Get the short version ID from a full hash (first 12 chars)
 */
export function hashToVersionId(hash: string): string {
  return hash.slice(0, 12);
}
