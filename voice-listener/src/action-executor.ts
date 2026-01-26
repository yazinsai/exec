import { spawn } from "bun";
import { join, resolve, isAbsolute } from "path";
import { db } from "./db";

interface Action {
  id: string;
  type: string;
  title: string;
  description?: string;
  status: string;
  projectPath?: string;
  messages?: string;
}

const POLL_INTERVAL = 5000; // 5 seconds
const STALE_THRESHOLD = 60 * 60 * 1000; // 1 hour for execution (longer than extraction)

// Resolve workspace paths relative to mic-app root (one level up from voice-listener)
// voice-listener/src/action-executor.ts -> voice-listener -> mic-app root
const MIC_APP_ROOT = resolve(import.meta.dir, "../..");
const WORKSPACE_PROJECTS = join(MIC_APP_ROOT, "workspace", "projects");

// CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const ONCE = args.includes("--once");
const LIMIT = (() => {
  const idx = args.indexOf("--limit");
  if (idx !== -1 && args[idx + 1]) {
    return parseInt(args[idx + 1], 10);
  }
  return Infinity;
})();

async function recoverStaleActions(): Promise<void> {
  const now = Date.now();
  const result = await db.query({
    actions: {
      $: {
        where: {
          status: "in_progress",
        },
      },
    },
  });

  const actions = (result.actions ?? []) as (Action & { startedAt?: number })[];
  const stale = actions.filter(
    (a) => a.startedAt && now - a.startedAt > STALE_THRESHOLD
  );

  if (stale.length > 0) {
    console.log(`Recovering ${stale.length} stale actions...`);
    const txs = stale.map((a) =>
      db.tx.actions[a.id].update({
        status: "pending",
        startedAt: null,
      })
    );
    await db.transact(txs);
  }
}

async function claimAction(actionId: string): Promise<boolean> {
  try {
    await db.transact(
      db.tx.actions[actionId].update({
        status: "in_progress",
        startedAt: Date.now(),
      })
    );
    return true;
  } catch (error) {
    console.error(`Failed to claim action ${actionId}:`, error);
    return false;
  }
}

async function executeAction(action: Action): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Executing action: [${action.type.toUpperCase()}] ${action.title}`);
  if (action.description) {
    console.log(`Description: ${action.description}`);
  }
  console.log("=".repeat(60));

  if (DRY_RUN) {
    console.log(`[DRY RUN] Would execute action ${action.id} (skipped)`);
    return;
  }

  // Claim the action
  const claimed = await claimAction(action.id);
  if (!claimed) {
    console.log(`Failed to claim action ${action.id}, skipping`);
    return;
  }

  // Build the prompt for Claude Code
  const prompt = buildExecutionPrompt(action);

  // Resolve project directory
  // If projectPath is set, resolve it relative to WORKSPACE_PROJECTS (or use absolute path as-is)
  // Otherwise, use WORKSPACE_PROJECTS as base (Claude will need to find the project)
  let projectDir = WORKSPACE_PROJECTS;
  if (action.projectPath) {
    if (isAbsolute(action.projectPath)) {
      // Absolute path - use as-is
      projectDir = action.projectPath;
    } else {
      // Relative path - resolve relative to workspace/projects
      projectDir = join(WORKSPACE_PROJECTS, action.projectPath);
    }
  }

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
      cwd: projectDir,
    });

    // Stream output
    const decoder = new TextDecoder();
    const reader = proc.stdout.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      process.stdout.write(decoder.decode(value));
    }

    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      console.error(`\nClaude exited with code ${exitCode}`);
      if (stderr) console.error("stderr:", stderr);

      await db.transact(
        db.tx.actions[action.id].update({
          status: "failed",
          errorMessage: `Exit code ${exitCode}: ${stderr.slice(0, 500)}`,
          completedAt: Date.now(),
        })
      );
    } else {
      console.log(`\nAction ${action.id} completed successfully`);
      // Note: Claude Code should update the action with result/deployUrl via InstantDB
      // We just mark it complete if it hasn't been updated
      const current = await db.query({
        actions: { $: { where: { id: action.id } } },
      });
      const currentAction = (current.actions as Action[])?.[0];
      if (currentAction?.status === "in_progress") {
        await db.transact(
          db.tx.actions[action.id].update({
            status: "completed",
            completedAt: Date.now(),
          })
        );
      }
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`Error executing action ${action.id}:`, errMsg);
    await db.transact(
      db.tx.actions[action.id].update({
        status: "failed",
        errorMessage: errMsg,
        completedAt: Date.now(),
      })
    );
  }
}

function buildExecutionPrompt(action: Action): string {
  const messages = action.messages ? JSON.parse(action.messages) : [];
  const hasUserFeedback = messages.some((m: { role: string }) => m.role === "user");

  let prompt = `You are executing an action from the voice-to-action system.

ACTION DETAILS:
- ID: ${action.id}
- Type: ${action.type}
- Title: ${action.title}
${action.description ? `- Description: ${action.description}` : ""}

`;

  if (hasUserFeedback) {
    prompt += `CONVERSATION THREAD:
${messages.map((m: { role: string; content: string }) => `[${m.role.toUpperCase()}]: ${m.content}`).join("\n\n")}

The user has provided feedback. Continue iterating based on their input.
`;
  }

  prompt += `
INSTRUCTIONS:
1. **Working Directory**: ${action.projectPath ? `You are in the project directory: ${action.projectPath}. This project should already exist in workspace/projects/.` : `You are in workspace/projects/. ${action.type !== "idea" ? `For ${action.type} actions, you need to locate the target project directory first (it must already exist).` : ""}`}
2. **Notes**: Store documentation, research, and planning notes in workspace/notes/ (use relative path from current directory).
3. Read workspace/CLAUDE.md for detailed guidelines on handling different action types. Also check for project-specific CLAUDE.md files if present.
4. Execute this ${action.type} action appropriately (see workspace/CLAUDE.md for type-specific guidance):
${action.type === "idea" ? `   - idea: Research, plan, and create a NEW project in workspace/projects/` : action.type === "bug" || action.type === "feature" ? `   - ${action.type}: Work within the existing project directory. The project must already exist.` : `   - ${action.type}: Complete the task`}
5. Update the action in InstantDB as you work:
   - Use the db from voice-listener/src/db.ts
   - Update 'result' field with your progress/output (for ideas, include research, services, and plan)
   - If you deploy something, set 'deployUrl'
   - Append assistant messages to the 'messages' JSON array
6. When done, set status to "completed"

To update the action in InstantDB:
\`\`\`typescript
// Adjust the import path based on your current directory depth
// From workspace/projects/: "../../voice-listener/src/db"
// From workspace/projects/my-app/: "../../../voice-listener/src/db"
import { db } from "../../voice-listener/src/db";

// Update result
await db.transact(db.tx.actions["${action.id}"].update({
  result: "Description of what was done...",
  deployUrl: "http://...", // if deployed
}));

// Append a message to the thread
const messages = ${JSON.stringify(messages)};
messages.push({ role: "assistant", content: "Your response", timestamp: Date.now() });
await db.transact(db.tx.actions["${action.id}"].update({
  messages: JSON.stringify(messages),
}));
\`\`\`

Now execute this action.`;

  return prompt;
}

async function pollForActions(): Promise<number> {
  try {
    const result = await db.query({
      actions: {
        $: {
          where: {
            status: "pending",
          },
        },
      },
    });

    let actions = (result.actions ?? []) as Action[];

    if (actions.length === 0) {
      return 0;
    }

    console.log(`Found ${actions.length} pending action(s)`);

    // Apply limit
    if (LIMIT < actions.length) {
      console.log(`Limiting to ${LIMIT} action(s)`);
      actions = actions.slice(0, LIMIT);
    }

    // Execute one at a time
    for (const action of actions) {
      await executeAction(action);
    }

    return actions.length;
  } catch (error) {
    console.error("Polling error:", error);
    return 0;
  }
}

function printUsage(): void {
  console.log(`
Action Executor - Execute pending actions with Claude Code

Usage: bun run src/action-executor.ts [options]

Options:
  --dry-run     Show what would be executed without running
  --once        Process once and exit (don't poll continuously)
  --limit N     Only process N actions

Examples:
  bun run src/action-executor.ts --dry-run --once --limit 1
  bun run src/action-executor.ts --once --limit 5
  bun run src/action-executor.ts
`);
}

async function main(): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  console.log("Action Executor starting...");
  if (DRY_RUN) console.log("  Mode: DRY RUN (no changes will be made)");
  if (ONCE) console.log("  Mode: ONCE (will exit after processing)");
  if (LIMIT < Infinity) console.log(`  Limit: ${LIMIT}`);

  // Recover stale actions
  if (!DRY_RUN) {
    await recoverStaleActions();
  }

  console.log("\nPolling for pending actions...");

  // Initial poll
  const processed = await pollForActions();

  if (ONCE) {
    console.log(`\nDone. Processed ${processed} action(s).`);
    process.exit(0);
  }

  // Set up polling interval
  setInterval(pollForActions, POLL_INTERVAL);

  console.log(`\nListening for new actions (polling every ${POLL_INTERVAL / 1000}s)...`);
}

main().catch(console.error);
