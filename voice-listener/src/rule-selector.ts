import { db } from "./db";
import { inferProjectType, inferProjectTypeFromAction } from "./project-type-inference";

interface Rule {
  id: string;
  content: string;
  scope: string;
  scopeQualifier?: string;
  category: string;
  tags?: string;
  confidence: number;
  active: boolean;
  conflictsWith?: string;
}

interface SelectedRule {
  id: string;
  content: string;
  confidence: number;
  scope: string;
  category: string;
}

interface RuleConflict {
  ruleA: SelectedRule;
  ruleB: SelectedRule;
  category: string;
}

interface RuleSelectionResult {
  rules: SelectedRule[];
  conflicts: RuleConflict[];
}

const MAX_RULES = 15;

/**
 * Select relevant rules for a given action context.
 */
export async function selectRelevantRules(
  actionType: string,
  actionTitle: string,
  actionDescription?: string,
  projectPath?: string
): Promise<RuleSelectionResult> {
  // Query all active rules
  const result = await db.query({
    rules: {
      $: {
        where: { active: true },
      },
    },
  });

  const allRules = (result.rules ?? []) as Rule[];

  if (allRules.length === 0) {
    return { rules: [], conflicts: [] };
  }

  // Determine project type
  let projectType: string | null = null;
  if (projectPath) {
    projectType = inferProjectType(projectPath);
  }
  if (!projectType) {
    projectType = inferProjectTypeFromAction(actionType, actionTitle, actionDescription);
  }

  // Filter rules by scope
  const matched: SelectedRule[] = [];

  for (const rule of allRules) {
    let include = false;

    if (rule.scope === "global" && rule.confidence >= 0.7) {
      include = true;
    } else if (rule.scope === "project-type" && rule.confidence >= 0.5) {
      if (projectType && rule.scopeQualifier === projectType) {
        include = true;
      }
    } else if (rule.scope === "project-specific") {
      if (projectPath && rule.scopeQualifier === projectPath) {
        include = true;
      }
    }

    if (include) {
      matched.push({
        id: rule.id,
        content: rule.content,
        confidence: rule.confidence,
        scope: rule.scope,
        category: rule.category,
      });
    }
  }

  // Sort by confidence descending
  matched.sort((a, b) => b.confidence - a.confidence);

  // Cap at MAX_RULES
  const selected = matched.slice(0, MAX_RULES);

  // Detect conflicts: rules in the same category where one might contradict another
  const conflicts: RuleConflict[] = [];
  const byCategory = new Map<string, SelectedRule[]>();

  for (const rule of selected) {
    const existing = byCategory.get(rule.category) || [];
    existing.push(rule);
    byCategory.set(rule.category, existing);
  }

  // Check for explicitly declared conflicts
  const selectedIds = new Set(selected.map((r) => r.id));
  for (const rule of allRules) {
    if (!selectedIds.has(rule.id) || !rule.conflictsWith) continue;
    try {
      const conflictIds = JSON.parse(rule.conflictsWith) as string[];
      for (const conflictId of conflictIds) {
        if (selectedIds.has(conflictId)) {
          const ruleA = selected.find((r) => r.id === rule.id)!;
          const ruleB = selected.find((r) => r.id === conflictId)!;
          if (ruleA && ruleB) {
            conflicts.push({
              ruleA,
              ruleB,
              category: ruleA.category,
            });
          }
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  return { rules: selected, conflicts };
}

/**
 * Format selected rules into a prompt section.
 */
export function formatRulesForPrompt(result: RuleSelectionResult): string {
  if (result.rules.length === 0) {
    return "";
  }

  const lines: string[] = ["LEARNED PREFERENCES (from previous work):"];

  for (const rule of result.rules) {
    const strength =
      rule.confidence >= 0.8
        ? "STRONG"
        : rule.confidence >= 0.6
          ? "MODERATE"
          : "TENTATIVE";
    lines.push(`- [${strength}] ${rule.content}`);
  }

  lines.push("");
  lines.push("Apply these unless they conflict with explicit instructions in this task.");

  if (result.conflicts.length > 0) {
    lines.push("");
    lines.push("NOTE: These preferences conflict for this context:");
    for (const conflict of result.conflicts) {
      lines.push(`- Rule A: "${conflict.ruleA.content}"`);
      lines.push(`- Rule B: "${conflict.ruleB.content}"`);
    }
    lines.push("Ask the user which approach to use before proceeding.");
  }

  return lines.join("\n");
}
