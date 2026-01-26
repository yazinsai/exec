import { spawn } from "bun";
import { join, resolve, isAbsolute } from "path";
import { mkdir, appendFile } from "fs/promises";
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
const LOGS_DIR = join(MIC_APP_ROOT, "workspace", "logs");

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
const ACTION_ID = (() => {
  const idx = args.indexOf("--action-id");
  if (idx !== -1 && args[idx + 1]) {
    return args[idx + 1];
  }
  return null;
})();
const DEBUG_LOG = args.includes("--debug-log");

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

// Format stream-json events for console and log file
interface StreamEvent {
  type?: string;
  message?: {
    role?: string;
    content?: Array<{
      type: string;
      thinking?: string;
      text?: string;
      name?: string;
      input?: unknown;
      id?: string;
    }>;
  };
  content_block?: {
    type: string;
    thinking?: string;
    text?: string;
    name?: string;
    input?: unknown;
  };
  delta?: {
    type?: string;
    thinking?: string;
    text?: string;
  };
  result?: unknown;
  subtype?: string;
}

function formatStreamEvent(event: StreamEvent): { console: string; log: string } {
  let consoleOut = "";
  let logOut = "";

  // Handle different event types
  if (event.type === "assistant") {
    // Full assistant message - extract content
    const content = event.message?.content || [];
    for (const block of content) {
      if (block.type === "thinking" && block.thinking) {
        logOut += `\n<thinking>\n${block.thinking}\n</thinking>\n`;
        consoleOut += `[thinking] ${block.thinking.slice(0, 100)}...\n`;
      } else if (block.type === "text" && block.text) {
        logOut += `\n${block.text}`;
        consoleOut += block.text;
      } else if (block.type === "tool_use") {
        logOut += `\n<tool_use name="${block.name}">\n${JSON.stringify(block.input, null, 2)}\n</tool_use>\n`;
        consoleOut += `[tool] ${block.name}\n`;
      }
    }
  } else if (event.type === "content_block_start") {
    const block = event.content_block;
    if (block?.type === "thinking") {
      logOut += "\n<thinking>\n";
    } else if (block?.type === "tool_use") {
      logOut += `\n<tool_use name="${block.name}">\n`;
      consoleOut += `[tool] ${block.name}`;
    }
  } else if (event.type === "content_block_delta") {
    const delta = event.delta;
    if (delta?.type === "thinking_delta" && delta.thinking) {
      logOut += delta.thinking;
      // Don't spam console with thinking deltas, just show in log
    } else if (delta?.type === "text_delta" && delta.text) {
      logOut += delta.text;
      consoleOut += delta.text;
    } else if (delta?.type === "input_json_delta") {
      // Tool input streaming - just log it
      logOut += JSON.stringify(delta);
    }
  } else if (event.type === "content_block_stop") {
    // Close the block
    logOut += "\n";
  } else if (event.type === "result") {
    logOut += `\n<result>\n${JSON.stringify(event.result, null, 2)}\n</result>\n`;
  } else if (event.subtype === "tool_result") {
    logOut += `\n<tool_result>\n${JSON.stringify(event, null, 2)}\n</tool_result>\n`;
  } else {
    // Unknown event type - log the raw JSON for debugging
    logOut += `\n<!-- event: ${JSON.stringify(event)} -->\n`;
  }

  return { console: consoleOut, log: logOut };
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

async function executeAction(action: Action): Promise<string | null> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Executing action: [${action.type.toUpperCase()}] ${action.title}`);
  if (action.description) {
    console.log(`Description: ${action.description}`);
  }
  console.log("=".repeat(60));

  // Setup debug log file if enabled
  let logFile: string | null = null;
  if (DEBUG_LOG) {
    await mkdir(LOGS_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    logFile = join(LOGS_DIR, `${action.id}-${timestamp}.log`);
    const header = `=== Action Execution Log ===
Action ID: ${action.id}
Type: ${action.type}
Title: ${action.title}
Description: ${action.description || "(none)"}
Started: ${new Date().toISOString()}
${"=".repeat(60)}

`;
    await appendFile(logFile, header);
    console.log(`Debug log: ${logFile}`);
  }

  if (DRY_RUN) {
    console.log(`[DRY RUN] Would execute action ${action.id} (skipped)`);
    return logFile;
  }

  // Claim the action
  const claimed = await claimAction(action.id);
  if (!claimed) {
    console.log(`Failed to claim action ${action.id}, skipping`);
    return logFile;
  }

  // Build the prompt for Claude Code
  const prompt = buildExecutionPrompt(action);

  // Log the prompt if debug logging
  if (logFile) {
    await appendFile(logFile, `=== PROMPT ===\n${prompt}\n\n=== OUTPUT ===\n`);
  }

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
    // Use stream-json for debug logging to capture thinking/reasoning
    const outputFormat = DEBUG_LOG ? "stream-json" : "text";

    const cmd = [
      "claude",
      "-p",
      prompt,
      "--dangerously-skip-permissions",
      "--output-format",
      outputFormat,
    ];

    // stream-json requires --verbose in print mode
    if (DEBUG_LOG) {
      cmd.push("--verbose");
    }

    const proc = spawn({
      cmd,
      stdout: "pipe",
      stderr: "pipe",
      cwd: projectDir,
    });

    // Stream output and capture for log
    const decoder = new TextDecoder();
    const reader = proc.stdout.getReader();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);

      if (DEBUG_LOG) {
        // Parse stream-json format line by line
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            const formatted = formatStreamEvent(event);
            if (formatted.console) {
              process.stdout.write(formatted.console);
            }
            if (logFile && formatted.log) {
              await appendFile(logFile, formatted.log);
            }
          } catch {
            // Not valid JSON, just output as-is
            process.stdout.write(line + "\n");
            if (logFile) {
              await appendFile(logFile, line + "\n");
            }
          }
        }
      } else {
        // Plain text mode
        process.stdout.write(chunk);
        if (logFile) {
          await appendFile(logFile, chunk);
        }
      }
    }

    // Process remaining buffer
    if (DEBUG_LOG && buffer.trim()) {
      try {
        const event = JSON.parse(buffer);
        const formatted = formatStreamEvent(event);
        if (formatted.console) {
          process.stdout.write(formatted.console);
        }
        if (logFile && formatted.log) {
          await appendFile(logFile, formatted.log);
        }
      } catch {
        process.stdout.write(buffer);
        if (logFile) {
          await appendFile(logFile, buffer);
        }
      }
    }

    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (logFile) {
      await appendFile(logFile, `\n\n=== EXIT ===\nCode: ${exitCode}\nStderr: ${stderr || "(none)"}\n`);
    }

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
    if (logFile) {
      await appendFile(logFile, `\n\n=== ERROR ===\n${errMsg}\n`);
    }
    await db.transact(
      db.tx.actions[action.id].update({
        status: "failed",
        errorMessage: errMsg,
        completedAt: Date.now(),
      })
    );
  }

  return logFile;
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
  --dry-run         Show what would be executed without running
  --once            Process once and exit (don't poll continuously)
  --limit N         Only process N actions
  --action-id ID    Execute a specific action by ID (for testing)
  --debug-log       Save FULL Claude output including thinking/reasoning to
                    workspace/logs/{action-id}-{timestamp}.log

Examples:
  bun run src/action-executor.ts --dry-run --once --limit 1
  bun run src/action-executor.ts --once --limit 5
  bun run src/action-executor.ts

  # Debug a specific action with full output logging
  bun run src/action-executor.ts --action-id abc123 --debug-log
`);
}

async function executeSpecificAction(actionId: string): Promise<void> {
  console.log(`Fetching action: ${actionId}`);

  const result = await db.query({
    actions: {
      $: {
        where: {
          id: actionId,
        },
      },
    },
  });

  const actions = (result.actions ?? []) as Action[];
  if (actions.length === 0) {
    console.error(`Action not found: ${actionId}`);
    process.exit(1);
  }

  const action = actions[0];
  console.log(`Found action: [${action.type.toUpperCase()}] ${action.title}`);
  console.log(`Status: ${action.status}`);

  // Reset status to pending if needed (so we can re-execute)
  if (action.status !== "pending" && !DRY_RUN) {
    console.log(`Resetting status from "${action.status}" to "pending"...`);
    await db.transact(
      db.tx.actions[actionId].update({
        status: "pending",
        startedAt: null,
        completedAt: null,
        errorMessage: null,
      })
    );
    action.status = "pending";
  }

  const logFile = await executeAction(action);

  if (logFile) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Full output saved to: ${logFile}`);
    console.log("=".repeat(60));
  }
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
  if (ACTION_ID) console.log(`  Action ID: ${ACTION_ID}`);
  if (DEBUG_LOG) console.log(`  Debug logging: ENABLED`);

  // If specific action ID provided, execute that and exit
  if (ACTION_ID) {
    await executeSpecificAction(ACTION_ID);
    console.log("\nDone.");
    process.exit(0);
  }

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
