import { spawn } from "bun";
import { db } from "./db";

interface Action {
  id: string;
  type: string;
  title: string;
  description?: string;
  status: string;
  longrunStatus?: string;
  projectPath?: string;
  assumptions?: string;
  variants?: string;
  selectedVariant?: number;
  userFeedback?: string;
}

interface Assumption {
  customer?: string;
  problem?: string;
  market?: string;
  [key: string]: string | undefined;
}

interface Variant {
  name: string;
  description: string;
  pros?: string[];
  cons?: string[];
}

interface LongrunOutput {
  assumptions?: Assumption;
  variants?: Variant[];
  implemented?: number;
  epicId?: string;
}

const LONGRUN_PROMPT = (idea: Action) => `
/longrun

IDEA: ${idea.title}
${idea.description ? `\nDESCRIPTION: ${idea.description}` : ""}
${idea.projectPath ? `\nPROJECT PATH: ${idea.projectPath}` : ""}

INSTRUCTIONS:
- Make logical assumptions about customer, problem, and market
- Document all assumptions clearly in spec.md
- During research, capture alternative approaches as "variants" (at least 2-3 different ways to solve this)
- Build a working prototype of the most promising approach
- At the end of your work, output a JSON block with discovered variants and assumptions in this format:

\`\`\`json
{
  "assumptions": {
    "customer": "Description of assumed target customer",
    "problem": "The core problem being solved",
    "market": "Market context and existing solutions"
  },
  "variants": [
    {
      "name": "Approach name",
      "description": "Brief description of this approach",
      "pros": ["Advantage 1", "Advantage 2"],
      "cons": ["Disadvantage 1", "Disadvantage 2"]
    }
  ],
  "implemented": 0,
  "epicId": "epic_id_if_available"
}
\`\`\`

IMPORTANT: Always output the JSON block at the end, even if implementation fails.
`;

async function updateAction(
  actionId: string,
  updates: Partial<{
    longrunStatus: string;
    longrunEpicId: string;
    assumptions: string;
    variants: string;
    selectedVariant: number;
    userFeedback: string;
    status: string;
    result: string;
    errorMessage: string;
    startedAt: number;
    completedAt: number;
  }>
): Promise<void> {
  await db.transact(db.tx.actions[actionId].update(updates));
}

function parseLongrunOutput(output: string): LongrunOutput {
  // Try to find the JSON block at the end
  const jsonMatch = output.match(/```json\s*([\s\S]*?)\s*```(?![\s\S]*```json)/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1].trim()) as LongrunOutput;
    } catch {
      // Continue to fallback
    }
  }

  // Fallback: try to find any object with assumptions/variants
  const objectMatch = output.match(/\{[\s\S]*"(assumptions|variants)"[\s\S]*\}/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]) as LongrunOutput;
    } catch {
      // Continue to fallback
    }
  }

  // If no parseable output, return empty
  return {};
}

export async function processIdea(action: Action, dryRun = false): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Processing idea: ${action.title}`);
  console.log(`Longrun status: ${action.longrunStatus || "new"}`);
  console.log("=".repeat(60));

  // Route to appropriate handler based on longrunStatus
  if (action.longrunStatus === "pending_variant" && action.selectedVariant !== undefined) {
    console.log(`Routing to variant selection handler (variant ${action.selectedVariant})`);
    await processVariantSelection(action.id, action.selectedVariant, dryRun);
    return;
  }

  if (action.longrunStatus === "pending_feedback" && action.userFeedback) {
    console.log(`Routing to feedback handler`);
    await processFeedback(action.id, action.userFeedback, dryRun);
    return;
  }

  // New idea - process from scratch
  if (dryRun) {
    console.log("[DRY RUN] Would trigger /longrun for this idea");
    console.log(`Prompt preview:\n${LONGRUN_PROMPT(action).slice(0, 500)}...`);
    return;
  }

  // Mark as running
  await updateAction(action.id, {
    longrunStatus: "running",
    status: "in_progress",
    startedAt: Date.now(),
  });

  console.log("Spawning Claude with /longrun...");
  console.log("(This may take a long time - research + implementation)");

  try {
    const proc = spawn({
      cmd: [
        "claude",
        "-p",
        LONGRUN_PROMPT(action),
        "--dangerously-skip-permissions",
        "--output-format",
        "text",
      ],
      stdout: "pipe",
      stderr: "pipe",
    });

    // 4 hour timeout (longrun can take a while)
    const timeout = setTimeout(() => {
      console.log("Timeout reached (4 hours), killing process...");
      proc.kill();
    }, 4 * 60 * 60 * 1000);

    const output = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    clearTimeout(timeout);

    if (exitCode !== 0) {
      console.error("Claude stderr:", stderr);
      await updateAction(action.id, {
        longrunStatus: "failed",
        status: "failed",
        errorMessage: `Claude exited with code ${exitCode}: ${stderr.slice(0, 500)}`,
        completedAt: Date.now(),
      });
      return;
    }

    // Parse the output for assumptions and variants
    const parsed = parseLongrunOutput(output);

    console.log("\n--- Longrun Output Summary ---");
    if (parsed.assumptions) {
      console.log("Assumptions:", JSON.stringify(parsed.assumptions, null, 2));
    }
    if (parsed.variants) {
      console.log(`Variants discovered: ${parsed.variants.length}`);
      for (const v of parsed.variants) {
        console.log(`  - ${v.name}: ${v.description}`);
      }
    }
    if (parsed.implemented !== undefined) {
      console.log(`Implemented variant index: ${parsed.implemented}`);
    }

    // Update the action with results
    await updateAction(action.id, {
      longrunStatus: "awaiting_feedback",
      status: "completed",
      assumptions: parsed.assumptions ? JSON.stringify(parsed.assumptions) : undefined,
      variants: parsed.variants ? JSON.stringify(parsed.variants) : undefined,
      selectedVariant: parsed.implemented,
      longrunEpicId: parsed.epicId,
      result: `Longrun completed. ${parsed.variants?.length ?? 0} variants discovered.`,
      completedAt: Date.now(),
    });

    console.log(`\nIdea ${action.id} processed successfully!`);
    console.log("Status: awaiting_feedback");
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Error processing idea:", errMsg);
    await updateAction(action.id, {
      longrunStatus: "failed",
      status: "failed",
      errorMessage: errMsg,
      completedAt: Date.now(),
    });
  }
}

export async function queryPendingIdeas(limit = Infinity): Promise<Action[]> {
  const result = await db.query({
    actions: {
      $: {
        where: {
          and: [{ type: "idea" }, { status: "pending" }],
        },
      },
    },
  });

  let ideas = (result.actions ?? []) as Action[];

  // Filter to those that need processing:
  // - No longrunStatus (new ideas)
  // - pending_variant (user selected a different variant)
  // - pending_feedback (user provided feedback)
  ideas = ideas.filter(
    (a) =>
      !a.longrunStatus ||
      a.longrunStatus === "pending_variant" ||
      a.longrunStatus === "pending_feedback"
  );

  if (limit < ideas.length) {
    ideas = ideas.slice(0, limit);
  }

  return ideas;
}

export async function processVariantSelection(
  actionId: string,
  variantIndex: number,
  dryRun = false
): Promise<void> {
  // Get the action
  const result = await db.query({
    actions: {
      $: { where: { id: actionId } },
    },
  });

  const action = (result.actions ?? [])[0] as Action | undefined;
  if (!action) {
    throw new Error(`Action ${actionId} not found`);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Processing variant selection for: ${action.title}`);
  console.log(`Selected variant index: ${variantIndex}`);
  console.log("=".repeat(60));

  if (dryRun) {
    console.log("[DRY RUN] Would trigger /longrun for variant");
    return;
  }

  // Update to mark the selected variant and reset for reprocessing
  await updateAction(actionId, {
    selectedVariant: variantIndex,
    longrunStatus: "running",
    status: "in_progress",
    startedAt: Date.now(),
    completedAt: undefined,
    result: undefined,
    errorMessage: undefined,
  });

  // Get variant details to add to prompt
  let variantContext = "";
  if (action.variants) {
    try {
      const variants = JSON.parse(action.variants) as Variant[];
      const selected = variants[variantIndex];
      if (selected) {
        variantContext = `

SELECTED VARIANT (user chose this approach):
Name: ${selected.name}
Description: ${selected.description}
${selected.pros?.length ? `Pros: ${selected.pros.join(", ")}` : ""}
${selected.cons?.length ? `Cons: ${selected.cons.join(", ")}` : ""}

Focus on implementing THIS specific variant, not the original idea.
`;
      }
    } catch {
      // Ignore parse errors
    }
  }

  const prompt = `
/longrun

IDEA: ${action.title}
${action.description ? `\nDESCRIPTION: ${action.description}` : ""}
${action.projectPath ? `\nPROJECT PATH: ${action.projectPath}` : ""}
${variantContext}

INSTRUCTIONS:
- The user has selected a specific variant to implement
- Build a working prototype of this variant
- At the end, output a JSON block with any refinements:

\`\`\`json
{
  "assumptions": { ... },
  "variants": [ ... ],
  "implemented": ${variantIndex},
  "epicId": "epic_id_if_available"
}
\`\`\`
`;

  try {
    const proc = spawn({
      cmd: [
        "claude",
        "-p",
        prompt,
        "--dangerously-skip-permissions",
        "--output-format",
        "text",
      ],
      stdout: "pipe",
      stderr: "pipe",
    });

    const timeout = setTimeout(() => {
      proc.kill();
    }, 4 * 60 * 60 * 1000);

    const output = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    clearTimeout(timeout);

    if (exitCode !== 0) {
      await updateAction(actionId, {
        longrunStatus: "failed",
        status: "failed",
        errorMessage: `Claude exited with code ${exitCode}: ${stderr.slice(0, 500)}`,
        completedAt: Date.now(),
      });
      return;
    }

    const parsed = parseLongrunOutput(output);

    await updateAction(actionId, {
      longrunStatus: "awaiting_feedback",
      status: "completed",
      assumptions: parsed.assumptions ? JSON.stringify(parsed.assumptions) : undefined,
      variants: parsed.variants ? JSON.stringify(parsed.variants) : undefined,
      longrunEpicId: parsed.epicId,
      result: `Variant ${variantIndex} implemented.`,
      completedAt: Date.now(),
    });

    console.log(`Variant ${variantIndex} processed successfully!`);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    await updateAction(actionId, {
      longrunStatus: "failed",
      status: "failed",
      errorMessage: errMsg,
      completedAt: Date.now(),
    });
  }
}

export async function processFeedback(
  actionId: string,
  feedback: string,
  dryRun = false
): Promise<void> {
  // Get the action
  const result = await db.query({
    actions: {
      $: { where: { id: actionId } },
    },
  });

  const action = (result.actions ?? [])[0] as Action | undefined;
  if (!action) {
    throw new Error(`Action ${actionId} not found`);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Processing feedback for: ${action.title}`);
  console.log(`Feedback: ${feedback}`);
  console.log("=".repeat(60));

  if (dryRun) {
    console.log("[DRY RUN] Would trigger /longrun with feedback");
    return;
  }

  // Update to save feedback and reset for reprocessing
  await updateAction(actionId, {
    userFeedback: feedback,
    longrunStatus: "running",
    status: "in_progress",
    startedAt: Date.now(),
    completedAt: undefined,
    result: undefined,
    errorMessage: undefined,
  });

  const prompt = `
/longrun

IDEA: ${action.title}
${action.description ? `\nDESCRIPTION: ${action.description}` : ""}
${action.projectPath ? `\nPROJECT PATH: ${action.projectPath}` : ""}

PREVIOUS ASSUMPTIONS:
${action.assumptions ?? "None recorded"}

USER FEEDBACK:
${feedback}

INSTRUCTIONS:
- The user has provided feedback on the previous implementation
- Incorporate this feedback and iterate on the solution
- Build an updated working prototype
- At the end, output a JSON block with updated info:

\`\`\`json
{
  "assumptions": { ... },
  "variants": [ ... ],
  "implemented": 0,
  "epicId": "epic_id_if_available"
}
\`\`\`
`;

  try {
    const proc = spawn({
      cmd: [
        "claude",
        "-p",
        prompt,
        "--dangerously-skip-permissions",
        "--output-format",
        "text",
      ],
      stdout: "pipe",
      stderr: "pipe",
    });

    const timeout = setTimeout(() => {
      proc.kill();
    }, 4 * 60 * 60 * 1000);

    const output = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    clearTimeout(timeout);

    if (exitCode !== 0) {
      await updateAction(actionId, {
        longrunStatus: "failed",
        status: "failed",
        errorMessage: `Claude exited with code ${exitCode}: ${stderr.slice(0, 500)}`,
        completedAt: Date.now(),
      });
      return;
    }

    const parsed = parseLongrunOutput(output);

    await updateAction(actionId, {
      longrunStatus: "awaiting_feedback",
      status: "completed",
      assumptions: parsed.assumptions ? JSON.stringify(parsed.assumptions) : undefined,
      variants: parsed.variants ? JSON.stringify(parsed.variants) : undefined,
      longrunEpicId: parsed.epicId,
      result: `Feedback incorporated. Iteration complete.`,
      completedAt: Date.now(),
    });

    console.log(`Feedback processed successfully!`);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    await updateAction(actionId, {
      longrunStatus: "failed",
      status: "failed",
      errorMessage: errMsg,
      completedAt: Date.now(),
    });
  }
}
