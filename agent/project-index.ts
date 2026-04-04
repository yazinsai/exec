import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { resolve } from "path";

export type ProjectIndexEntry = {
  slug: string;
  description: string;
  path: string;
};

const PROJECTS_ROOT = resolve(homedir(), "ai/projects");
const INDEX_PATH = resolve(PROJECTS_ROOT, "INDEX.md");

export function getProjectsRoot(): string {
  return PROJECTS_ROOT;
}

export function getProjectPath(slug: string): string {
  return resolve(PROJECTS_ROOT, slug);
}

export function loadProjectIndexMarkdown(): string {
  if (!existsSync(INDEX_PATH)) return "";
  return readFileSync(INDEX_PATH, "utf-8");
}

export function parseProjectIndex(markdown: string): ProjectIndexEntry[] {
  const entries: ProjectIndexEntry[] = [];
  const lines = markdown.split("\n");

  for (const line of lines) {
    const match = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/);
    if (!match) continue;
    const slug = match[1].trim();
    const description = match[2].trim();
    if (!slug || slug.toLowerCase() === "project" || /^-+$/.test(slug)) continue;
    entries.push({
      slug,
      description,
      path: getProjectPath(slug),
    });
  }

  return entries;
}

export function normalizeProjectSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "project";
}
