import { readFileSync, readdirSync, existsSync, statSync, lstatSync } from "fs";
import { createHash } from "crypto";
import { join } from "path";

const PROMPTS_DIR = join(import.meta.dir, "../prompts");
const AI_ROOT = join(import.meta.dir, "../../../..");
const PROJECTS_DIR = join(AI_ROOT, "projects");

// CLAUDE.md files that affect execution behavior and should be versioned
const AI_CLAUDE_FILES = [
  join(AI_ROOT, "CLAUDE.md"),
  join(PROJECTS_DIR, "CLAUDE.md"),
];

/**
 * Extract a brief description for a project directory.
 * Checks package.json description, then first line of CLAUDE.md or README.md.
 */
function getProjectDescription(projectDir: string): string | null {
  // 1. Try package.json "description" field
  const pkgPath = join(projectDir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.description && typeof pkg.description === "string") {
        return pkg.description.slice(0, 120);
      }
    } catch {}
  }

  // 2. Try first meaningful line of CLAUDE.md or README.md (skip headings and boilerplate)
  const BOILERPLATE = [
    "this file provides guidance to claude",
    "contents of",
  ];
  for (const readme of ["CLAUDE.md", "README.md"]) {
    const readmePath = join(projectDir, readme);
    if (existsSync(readmePath)) {
      try {
        const lines = readFileSync(readmePath, "utf-8").split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#") || trimmed.length <= 10) continue;
          if (trimmed.startsWith("-") || trimmed.startsWith("*")) continue;
          const lower = trimmed.toLowerCase();
          if (BOILERPLATE.some((b) => lower.includes(b))) continue;
          return trimmed.slice(0, 120);
        }
      } catch {}
    }
  }

  return null;
}

/**
 * Get list of project directories in ~/ai/projects/
 * Returns folder names with descriptions for better voice-to-project matching
 */
export function getProjectList(): string[] {
  if (!existsSync(PROJECTS_DIR)) return [];

  return readdirSync(PROJECTS_DIR)
    .filter((name) => {
      if (name.startsWith(".")) return false; // Skip hidden files/dirs
      if (name.endsWith(".md")) return false; // Skip markdown files
      const fullPath = join(PROJECTS_DIR, name);
      try {
        // Check if it's a directory (following symlinks)
        const stat = statSync(fullPath);
        return stat.isDirectory();
      } catch {
        return false;
      }
    })
    .sort()
    .map((name) => {
      const desc = getProjectDescription(join(PROJECTS_DIR, name));
      return desc ? `${name} — ${desc}` : name;
    });
}

/**
 * Load a prompt template from prompts/ directory and replace {{VARIABLES}}
 * Also injects {{PROJECT_LIST}} if the prompt contains that placeholder
 */
export function loadPrompt(name: string, vars: Record<string, string>): string {
  const filePath = join(PROMPTS_DIR, `${name}.md`);
  let prompt = readFileSync(filePath, "utf-8");

  // Inject project list if prompt uses it
  if (prompt.includes("{{PROJECT_LIST}}")) {
    const projects = getProjectList();
    vars.PROJECT_LIST = projects.join("\n");
  }

  for (const [key, value] of Object.entries(vars)) {
    prompt = prompt.replaceAll(`{{${key}}}`, value ?? "");
  }

  return prompt;
}

/**
 * Hash all prompt files for versioning
 * Returns a SHA256 hash of all prompt files combined, including:
 * - prompts/*.md (extraction, execution prompts)
 * - ~/ai/CLAUDE.md (action type guidelines)
 * - ~/ai/projects/CLAUDE.md (project-specific lessons)
 */
export function hashAllPrompts(): string {
  // 1. Read prompts/*.md files (sorted for consistency)
  const promptFiles = readdirSync(PROMPTS_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();

  const promptContents = promptFiles.map((f) =>
    `[prompts/${f}]\n${readFileSync(join(PROMPTS_DIR, f), "utf-8")}`
  );

  // 2. Read AI-level CLAUDE.md files (if they exist)
  const aiClaudeContents = AI_CLAUDE_FILES
    .filter((path) => existsSync(path))
    .map((path) => {
      const relativePath = path.replace(AI_ROOT, "ai");
      return `[${relativePath}]\n${readFileSync(path, "utf-8")}`;
    });

  // 3. Combine all with separator
  const combined = [...promptContents, ...aiClaudeContents].join("\n---\n");

  return createHash("sha256").update(combined).digest("hex");
}

/**
 * Get the short version ID from a full hash (first 12 chars)
 */
export function hashToVersionId(hash: string): string {
  return hash.slice(0, 12);
}
