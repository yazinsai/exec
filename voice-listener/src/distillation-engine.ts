import { db, id } from "./db";
import { loadPrompt } from "./prompt-loader";
import { callClaude } from "./claude-call";

interface Episode {
  id: string;
  narrative: string;
  feedbackType: string;
  projectType?: string;
  projectPath?: string;
  workContext?: string;
  userInput: string;
  tags?: string;
  sourceActionId?: string;
}

interface ExistingRule {
  id: string;
  content: string;
  scope: string;
  scopeQualifier?: string;
  category: string;
  confidence: number;
  sourceEpisodeIds: string;
  supportCount: number;
  conflictsWith?: string;
}

interface NewRuleFromClaude {
  content: string;
  scope: string;
  scopeQualifier: string | null;
  category: string;
  tags: string[];
  confidence: number;
  sourceEpisodeIds: string[];
  supportCount: number;
}

interface UpdatedRuleFromClaude {
  ruleId: string;
  confidenceDelta: number;
  newSourceEpisodeIds: string[];
  supportCountIncrement: number;
  reason: string;
}

interface ConflictFromClaude {
  ruleId: string;
  conflictingEpisodeId: string;
  description: string;
}

interface DistillationResult {
  newRules: NewRuleFromClaude[];
  updatedRules: UpdatedRuleFromClaude[];
  conflicts: ConflictFromClaude[];
}

const MIN_BATCH_SIZE = 3;

/**
 * Run a single distillation pass: process undistilled episodes into rules.
 * Returns the number of episodes processed.
 */
export async function runDistillation(): Promise<number> {
  console.log("Distillation: checking for undistilled episodes...");

  // Query undistilled episodes
  const episodeResult = await db.query({
    episodes: {
      $: {
        where: {
          or: [{ distilled: false }, { distilled: { $isNull: true } }],
        },
      },
    },
  });

  const episodes = (episodeResult.episodes ?? []) as Episode[];

  if (episodes.length < MIN_BATCH_SIZE) {
    console.log(
      `Distillation: only ${episodes.length} undistilled episodes (need ${MIN_BATCH_SIZE}), skipping`
    );
    return 0;
  }

  console.log(`Distillation: processing ${episodes.length} undistilled episodes`);

  // Query existing active rules for conflict checking
  const rulesResult = await db.query({
    rules: {
      $: {
        where: { active: true },
      },
    },
  });

  const existingRules = (rulesResult.rules ?? []) as ExistingRule[];

  // Format episodes for the prompt
  const episodesText = episodes
    .map(
      (ep, i) =>
        `Episode ${i + 1} (ID: ${ep.id}):
  Type: ${ep.feedbackType}
  Project Type: ${ep.projectType || "unknown"}
  Project Path: ${ep.projectPath || "none"}
  Work Context: ${ep.workContext || "general"}
  Narrative: ${ep.narrative}
  Tags: ${ep.tags || "none"}`
    )
    .join("\n\n");

  const existingRulesText =
    existingRules.length > 0
      ? existingRules
          .map(
            (rule) =>
              `Rule (ID: ${rule.id}):
  Content: ${rule.content}
  Scope: ${rule.scope} (${rule.scopeQualifier || "all"})
  Category: ${rule.category}
  Confidence: ${rule.confidence}
  Support Count: ${rule.supportCount}`
          )
          .join("\n\n")
      : "No existing rules yet.";

  // Call Claude for distillation
  const prompt = loadPrompt("distillation", {
    EPISODES: episodesText,
    EXISTING_RULES: existingRulesText,
  });

  const response = await callClaudeForDistillation(prompt);
  if (!response) {
    console.error("Distillation: Claude returned no response");
    return 0;
  }

  let result: DistillationResult;
  try {
    result = JSON.parse(response);
  } catch (e) {
    console.error("Distillation: failed to parse Claude response:", e);
    console.error("Response:", response.slice(0, 500));
    return 0;
  }

  const now = Date.now();
  const txs: any[] = [];

  // Create new rules
  for (const newRule of result.newRules) {
    const ruleId = id();
    txs.push(
      db.tx.rules[ruleId].update({
        content: newRule.content,
        scope: newRule.scope,
        scopeQualifier: newRule.scopeQualifier ?? null,
        category: newRule.category,
        tags: JSON.stringify(newRule.tags),
        confidence: Math.min(newRule.confidence, 0.95),
        sourceEpisodeIds: JSON.stringify(newRule.sourceEpisodeIds),
        supportCount: newRule.supportCount,
        active: true,
        createdAt: now,
        updatedAt: now,
      })
    );
    console.log(
      `  New rule: "${newRule.content}" (${newRule.scope}, confidence: ${newRule.confidence})`
    );
  }

  // Update existing rules
  for (const update of result.updatedRules) {
    const existing = existingRules.find((r) => r.id === update.ruleId);
    if (!existing) {
      console.warn(`  Skipping update for unknown rule: ${update.ruleId}`);
      continue;
    }

    const currentEpisodeIds = JSON.parse(existing.sourceEpisodeIds || "[]") as string[];
    const mergedEpisodeIds = Array.from(
      new Set([...currentEpisodeIds, ...update.newSourceEpisodeIds])
    );
    const newConfidence = Math.min(existing.confidence + update.confidenceDelta, 0.95);

    txs.push(
      db.tx.rules[existing.id].update({
        confidence: newConfidence,
        sourceEpisodeIds: JSON.stringify(mergedEpisodeIds),
        supportCount: existing.supportCount + update.supportCountIncrement,
        updatedAt: now,
      })
    );
    console.log(
      `  Updated rule "${existing.content}": confidence ${existing.confidence} -> ${newConfidence}`
    );
  }

  // Handle conflicts
  for (const conflict of result.conflicts) {
    const existing = existingRules.find((r) => r.id === conflict.ruleId);
    if (!existing) continue;

    const currentConflicts = existing.conflictsWith
      ? (JSON.parse(existing.conflictsWith) as string[])
      : [];

    // Find the rule that the conflicting episode supports (if any new rule was created)
    // For now, just lower confidence
    const newConfidence = Math.max(existing.confidence - 0.2, 0.1);
    txs.push(
      db.tx.rules[existing.id].update({
        confidence: newConfidence,
        updatedAt: now,
      })
    );
    console.log(
      `  Conflict on rule "${existing.content}": confidence lowered to ${newConfidence}`
    );
  }

  // Mark episodes as distilled
  for (const ep of episodes) {
    txs.push(db.tx.episodes[ep.id].update({ distilled: true }));
  }

  // Execute all transactions
  if (txs.length > 0) {
    await db.transact(txs);
  }

  console.log(
    `Distillation complete: ${result.newRules.length} new rules, ${result.updatedRules.length} updates, ${result.conflicts.length} conflicts`
  );

  return episodes.length;
}

/**
 * Call Claude via CLI for distillation.
 * Uses the shared callClaude helper (claude -p) — no API key needed.
 */
async function callClaudeForDistillation(prompt: string): Promise<string | null> {
  const text = await callClaude(prompt, { model: "sonnet" });
  if (!text) return null;

  // Extract JSON from response (Claude may wrap it in markdown code blocks)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch?.[0] ?? text;
}

// CLI mode: run once
if (process.argv.includes("--once")) {
  runDistillation()
    .then((count) => {
      console.log(`Distilled ${count} episodes`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Distillation failed:", err);
      process.exit(1);
    });
}
