import { readFileSync, existsSync } from "fs";
import { join, resolve, isAbsolute } from "path";

const AI_ROOT = resolve(import.meta.dir, "../../../..");
const PROJECTS_DIR = join(AI_ROOT, "projects");

// Cache inferred types per project path
const typeCache = new Map<string, string | null>();

/**
 * Infer the project type from directory contents.
 * Returns one of: "landing-page", "dashboard", "api", "mobile-app", "cli-tool", "library", "content", "research", or null.
 */
export function inferProjectType(projectPath: string): string | null {
  if (typeCache.has(projectPath)) {
    return typeCache.get(projectPath)!;
  }

  const absolutePath = isAbsolute(projectPath)
    ? projectPath
    : join(PROJECTS_DIR, projectPath);

  if (!existsSync(absolutePath)) {
    typeCache.set(projectPath, null);
    return null;
  }

  let inferred: string | null = null;

  // Check package.json for signals
  const pkgPath = join(absolutePath, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      const deps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };
      const name = (pkg.name || "").toLowerCase();
      const description = (pkg.description || "").toLowerCase();

      // Mobile app signals
      if (deps["expo"] || deps["react-native"] || deps["@expo/cli"]) {
        inferred = "mobile-app";
      }
      // Dashboard signals
      else if (
        description.includes("dashboard") ||
        name.includes("dashboard") ||
        (deps["recharts"] && deps["react"]) ||
        (deps["chart.js"] && deps["react"])
      ) {
        inferred = "dashboard";
      }
      // API signals
      else if (
        deps["express"] ||
        deps["fastify"] ||
        deps["hono"] ||
        deps["@hono/node-server"] ||
        (deps["next"] === undefined && !deps["react"] && !deps["vue"])
      ) {
        if (
          description.includes("api") ||
          name.includes("api") ||
          deps["express"] ||
          deps["fastify"] ||
          deps["hono"]
        ) {
          inferred = "api";
        }
      }
      // Landing page signals
      else if (
        description.includes("landing") ||
        name.includes("landing") ||
        description.includes("marketing") ||
        (deps["next"] && !deps["@prisma/client"] && !deps["drizzle-orm"])
      ) {
        inferred = "landing-page";
      }
      // CLI tool signals
      else if (
        deps["commander"] ||
        deps["yargs"] ||
        deps["meow"] ||
        deps["inquirer"] ||
        pkg.bin
      ) {
        inferred = "cli-tool";
      }
      // Library signals
      else if (pkg.main || pkg.exports || pkg.types) {
        if (!deps["react"] && !deps["next"] && !deps["vue"]) {
          inferred = "library";
        }
      }
      // Generic web app with react/next → landing-page as default
      else if (deps["next"] || deps["react"]) {
        inferred = "landing-page";
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Check README/CLAUDE.md for additional signals if not yet determined
  if (!inferred) {
    for (const filename of ["CLAUDE.md", "README.md"]) {
      const filePath = join(absolutePath, filename);
      if (existsSync(filePath)) {
        try {
          const content = readFileSync(filePath, "utf-8").toLowerCase().slice(0, 500);
          if (content.includes("landing page") || content.includes("marketing")) {
            inferred = "landing-page";
          } else if (content.includes("dashboard") || content.includes("admin panel")) {
            inferred = "dashboard";
          } else if (content.includes("api") || content.includes("backend")) {
            inferred = "api";
          } else if (content.includes("mobile") || content.includes("expo")) {
            inferred = "mobile-app";
          } else if (content.includes("cli") || content.includes("command line")) {
            inferred = "cli-tool";
          }
          if (inferred) break;
        } catch {
          // Ignore
        }
      }
    }
  }

  typeCache.set(projectPath, inferred);
  return inferred;
}

/**
 * Infer project type from action metadata when no project path is available.
 */
export function inferProjectTypeFromAction(
  actionType: string,
  title: string,
  description?: string
): string | null {
  const text = `${title} ${description || ""}`.toLowerCase();

  if (text.includes("landing page") || text.includes("marketing page")) {
    return "landing-page";
  }
  if (text.includes("dashboard") || text.includes("admin panel")) {
    return "dashboard";
  }
  if (text.includes("api") || text.includes("backend") || text.includes("endpoint")) {
    return "api";
  }
  if (text.includes("mobile") || text.includes("app") || text.includes("expo")) {
    return "mobile-app";
  }
  if (text.includes("cli") || text.includes("command line") || text.includes("script")) {
    return "cli-tool";
  }
  if (actionType === "Research") {
    return "research";
  }
  if (actionType === "Write") {
    return "content";
  }

  return null;
}

/**
 * Clear the cache (useful for testing).
 */
export function clearTypeCache(): void {
  typeCache.clear();
}
