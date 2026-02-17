/**
 * Heuristic-based complexity classifier for actions.
 * Pure pattern matching — no LLM call.
 */

type Scope = "simple" | "complex";

const MULTI_PHASE_PATTERNS = [
  /research\s+(then|and then|before)\s+(build|implement|create)/i,
  /first\s+.{5,}\s+then\s+/i,
  /phase\s*[12]/i,
  /step\s*1\b[\s\S]*step\s*2\b/i,
];

const ORCHESTRATION_KEYWORDS = [
  "integrate",
  "migration",
  "full-stack",
  "fullstack",
  "end-to-end",
  "microservice",
  "multi-service",
  "redesign",
  "overhaul",
  "rewrite from scratch",
  "rebuild",
];

const MULTIPLE_DELIVERABLES = [
  /\band\b.*\band\b/i, // "X and Y and Z"
  /\d+\.\s+.+\n\d+\.\s+/m, // numbered list with 2+ items
  /both\s+.+\s+and\s+/i, // "both X and Y"
];

export function analyzeScope(
  type: string,
  subtype: string | undefined,
  title: string,
  description: string | undefined,
): Scope {
  const text = `${title} ${description ?? ""}`;
  const descLength = (description ?? "").length;

  // Always complex
  if (type === "Project") return "complex";
  if (MULTI_PHASE_PATTERNS.some((p) => p.test(text))) return "complex";
  if (descLength > 500) return "complex";
  if (MULTIPLE_DELIVERABLES.some((p) => p.test(text))) return "complex";

  // Always simple
  if (type === "Research") return "simple";
  if (type === "Write") return "simple";
  if (type === "UserTask") return "simple";
  if (type === "CodeChange" && subtype === "bug" && descLength < 200) return "simple";

  // Moderate signals — need 2+ to be complex
  let signals = 0;
  if (type === "CodeChange" && subtype === "feature" && descLength > 150) signals++;
  if (ORCHESTRATION_KEYWORDS.some((kw) => text.toLowerCase().includes(kw))) signals++;
  if (descLength > 300) signals++;

  return signals >= 2 ? "complex" : "simple";
}
