import { spawn } from "bun";
import { join, resolve, isAbsolute } from "path";
import { mkdir, appendFile } from "fs/promises";
import { db, id, lookup } from "./db";
import { initPromptVersioning, getCurrentVersionId } from "./prompt-versioning";
import { classifyError } from "./error-categories";
import { loadPrompt } from "./prompt-loader";
import { notifyActionCompleted, notifyActionFailed, notifyActionAwaitingFeedback } from "./notifications";

interface DependsOnAction {
  id: string;
  status: string;
  title: string;
}

interface Action {
  id: string;
  type: string;
  subtype?: string; // For CodeChange: bug|feature|refactor
  title: string;
  description?: string;
  status: string;
  projectPath?: string;
  messages?: string;
  cancelRequested?: boolean;
  sessionId?: string; // Claude session ID for resuming conversations
  sequenceIndex?: number; // Position in sequence (1-based)
  dependsOn?: DependsOnAction[]; // Action this depends on (from link)
  // UserTask fields
  task?: string;
  why_user?: string;
  prep_allowed?: string;
  remind_at?: string;
}

const POLL_INTERVAL = 5000; // 5 seconds
const MAX_CONCURRENCY = 15; // Maximum parallel action executions
const HEARTBEAT_INTERVAL = 10000; // 10 seconds
const WORKER_NAME = "execution";

interface ThreadMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

function parseMessages(json: string | undefined): ThreadMessage[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as ThreadMessage[];
  } catch {
    return [];
  }
}

function hasNewUserFeedback(action: Action): boolean {
  const messages = parseMessages(action.messages);
  if (messages.length === 0) return false;
  const lastMessage = messages[messages.length - 1];
  return lastMessage.role === "user";
}

function isDependencyComplete(action: Action): boolean {
  // No dependency means it's ready to run
  if (!action.dependsOn || action.dependsOn.length === 0) {
    return true;
  }

  const dependency = action.dependsOn[0]; // We only support one dependency (has: "one")
  return dependency.status === "completed";
}

function getDependencyStatus(action: Action): string | null {
  if (!action.dependsOn || action.dependsOn.length === 0) {
    return null;
  }
  return action.dependsOn[0].status;
}

async function sendHeartbeat(status?: string): Promise<void> {
  try {
    // Check if heartbeat record exists
    const result = await db.query({
      workerHeartbeats: { $: { where: { name: WORKER_NAME } } },
    });
    const existing = result.workerHeartbeats[0];

    if (existing) {
      // Update existing record
      await db.transact(
        db.tx.workerHeartbeats[existing.id].update({
          lastSeen: Date.now(),
          status: status ?? null,
        })
      );
    } else {
      // Create new record with proper UUID
      await db.transact(
        db.tx.workerHeartbeats[id()].update({
          name: WORKER_NAME,
          lastSeen: Date.now(),
          status: status ?? null,
        })
      );
    }
  } catch (error) {
    // Ignore heartbeat errors - non-critical
    console.error("Heartbeat error:", error);
  }
}

// CLI flag to skip immediate recovery (for testing)
const SKIP_RECOVERY = process.argv.includes("--skip-recovery");

// Resolve workspace paths relative to mic-app root (one level up from voice-listener)
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
const DEBUG_LOG = !args.includes("--no-debug-log");
const SINCE = (() => {
  const idx = args.indexOf("--since");
  if (idx !== -1 && args[idx + 1]) {
    const val = args[idx + 1];
    if (val === "today") {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    }
    const parsed = Date.parse(val);
    if (!isNaN(parsed)) {
      return parsed;
    }
    const epoch = parseInt(val, 10);
    if (!isNaN(epoch)) {
      return epoch;
    }
    console.error(`Invalid --since value: ${val}. Use "today", ISO date, or epoch timestamp.`);
    process.exit(1);
  }
  return null;
})();

async function recoverStaleActions(): Promise<void> {
  const result = await db.query({
    actions: {
      $: {
        where: {
          status: "in_progress",
        },
      },
    },
  });

  const actions = (result.actions ?? []) as Action[];

  if (actions.length > 0) {
    console.log(`Recovering ${actions.length} orphaned in_progress actions...`);
    const txs = actions.map((a) =>
      db.tx.actions[a.id].update({
        status: "pending",
        startedAt: null,
        logFile: null,
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
  session_id?: string;
}

function formatStreamEvent(event: StreamEvent): { console: string; log: string } {
  let consoleOut = "";
  let logOut = "";

  if (event.type === "assistant") {
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
    } else if (delta?.type === "text_delta" && delta.text) {
      logOut += delta.text;
      consoleOut += delta.text;
    } else if (delta?.type === "input_json_delta") {
      logOut += JSON.stringify(delta);
    }
  } else if (event.type === "content_block_stop") {
    logOut += "\n";
  } else if (event.type === "result") {
    logOut += `\n<result>\n${JSON.stringify(event.result, null, 2)}\n</result>\n`;
  } else if (event.subtype === "tool_result") {
    logOut += `\n<tool_result>\n${JSON.stringify(event, null, 2)}\n</tool_result>\n`;
  } else {
    logOut += `\n<!-- event: ${JSON.stringify(event)} -->\n`;
  }

  return { console: consoleOut, log: logOut };
}

async function claimAction(actionId: string, logFile: string | null): Promise<boolean> {
  const promptVersionId = getCurrentVersionId();
  try {
    await db.transact(
      db.tx.actions[actionId].update({
        status: "in_progress",
        startedAt: Date.now(),
        logFile: logFile,
        progress: null,
        promptVersionId: promptVersionId ?? null,
      })
    );
    return true;
  } catch (error) {
    console.error(`Failed to claim action ${actionId}:`, error);
    return false;
  }
}

interface ClaudeExecutionResult {
  success: boolean;
  sessionId?: string;
  exitCode: number;
  stderr: string;
  toolsUsedCount: number;
  wasCancelled: boolean;
}

async function runClaudeSession(
  cmd: string[],
  projectDir: string,
  logFile: string | null,
  action: Action,
  onCancel: () => void,
  env?: Record<string, string>,
): Promise<ClaudeExecutionResult> {
  const proc = spawn({
    cmd,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    cwd: projectDir,
    env: env ? { ...process.env, ...env } : undefined,
  });

  console.log(`Process spawned, PID: ${proc.pid}`);
  proc.stdin.end();

  let sessionId: string | undefined;
  let toolsUsedCount = 0;
  let wasCancelled = false;

  // Poll for cancellation requests
  const pollForCancellation = async () => {
    try {
      const result = await db.query({
        actions: { $: { where: { id: action.id } } },
      });
      const currentAction = (result.actions as Action[])?.[0];
      if (!currentAction) return;

      if (currentAction.cancelRequested) {
        console.log(`\nCancellation requested for action ${action.id}`);
        wasCancelled = true;
        proc.kill("SIGTERM");
        onCancel();
      }
    } catch (error) {
      console.error("Polling error:", error);
    }
  };

  const pollInterval = setInterval(pollForCancellation, 3000);

  // Stream output
  const decoder = new TextDecoder();
  const reader = proc.stdout.getReader();
  let buffer = "";

  console.log("Starting to read stdout...");

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      console.log("Stdout stream ended");
      break;
    }
    const chunk = decoder.decode(value);

    if (logFile) {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event: StreamEvent = JSON.parse(line);
          if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
            toolsUsedCount++;
          }
          if (event.type === "result" && event.session_id) {
            sessionId = event.session_id;
            console.log(`Captured session ID: ${sessionId}`);
          }
          const formatted = formatStreamEvent(event);
          if (formatted.console) {
            process.stdout.write(formatted.console);
          }
          if (formatted.log) {
            await appendFile(logFile, formatted.log);
          }
        } catch {
          process.stdout.write(line + "\n");
          await appendFile(logFile, line + "\n");
        }
      }
    } else {
      process.stdout.write(chunk);
    }
  }

  // Process remaining buffer
  if (logFile && buffer.trim()) {
    try {
      const event: StreamEvent = JSON.parse(buffer);
      if (event.type === "result" && event.session_id) {
        sessionId = event.session_id;
        console.log(`Captured session ID: ${sessionId}`);
      }
      const formatted = formatStreamEvent(event);
      if (formatted.console) {
        process.stdout.write(formatted.console);
      }
      if (formatted.log) {
        await appendFile(logFile, formatted.log);
      }
    } catch {
      process.stdout.write(buffer);
      await appendFile(logFile, buffer);
    }
  }

  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  clearInterval(pollInterval);

  if (logFile) {
    await appendFile(logFile, `\n\n=== EXIT ===\nCode: ${exitCode}\nStderr: ${stderr || "(none)"}\nCancelled: ${wasCancelled}\nSession ID: ${sessionId || "(none)"}\n`);
  }

  return {
    success: exitCode === 0 && !wasCancelled,
    sessionId,
    exitCode,
    stderr,
    toolsUsedCount,
    wasCancelled,
  };
}

async function executeAction(action: Action): Promise<string | null> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Executing action: [${action.type.toUpperCase()}] ${action.title}`);
  if (action.description) {
    console.log(`Description: ${action.description}`);
  }
  console.log("=".repeat(60));

  // Setup debug log file
  const willResume = action.sessionId && hasNewUserFeedback(action);
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
Mode: ${willResume ? `RESUME (session: ${action.sessionId})` : "NEW SESSION"}
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
  const claimed = await claimAction(action.id, logFile);
  if (!claimed) {
    console.log(`Failed to claim action ${action.id}, skipping`);
    return logFile;
  }

  // Build the prompt
  const prompt = buildExecutionPrompt(action);

  if (logFile) {
    await appendFile(logFile, `=== PROMPT ===\n${prompt}\n\n=== OUTPUT ===\n`);
  }

  // Resolve project directory
  let projectDir = WORKSPACE_PROJECTS;
  if (action.projectPath) {
    if (isAbsolute(action.projectPath)) {
      projectDir = action.projectPath;
    } else {
      projectDir = join(WORKSPACE_PROJECTS, action.projectPath);
    }
  }

  const executionStartTime = Date.now();
  let totalToolsUsed = 0;
  let wasCancelled = false;

  try {
    const outputFormat = DEBUG_LOG ? "stream-json" : "text";

    // Check if we should resume a previous session (has sessionId + new user feedback)
    const shouldResume = action.sessionId && hasNewUserFeedback(action);

    let cmd: string[];
    if (shouldResume) {
      // Resume previous session with the new feedback
      const messages = parseMessages(action.messages);
      const latestFeedback = messages.filter(m => m.role === "user").pop();
      const feedbackPrompt = `The user has provided feedback on your previous work:

"${latestFeedback?.content}"

Please address this feedback and continue iterating on the task.`;

      cmd = [
        "claude",
        "--resume",
        action.sessionId!,
        "-p",
        feedbackPrompt,
        "--dangerously-skip-permissions",
        "--output-format",
        outputFormat,
      ];
      console.log(`Resuming session ${action.sessionId} with user feedback`);
    } else {
      // Fresh execution with full prompt
      cmd = [
        "claude",
        "-p",
        prompt,
        "--dangerously-skip-permissions",
        "--output-format",
        outputFormat,
      ];
    }

    if (DEBUG_LOG) {
      cmd.push("--verbose");
    }

    console.log(`Spawning: ${cmd.join(" ").slice(0, 100)}...`);
    console.log(`Working directory: ${projectDir}`);
    if (shouldResume) {
      console.log(`Mode: RESUME (session: ${action.sessionId})`);
    } else {
      console.log(`Mode: NEW SESSION`);
    }

    // Prepare env vars for the CLI script
    const cliScriptPath = join(import.meta.dir, "../scripts/update-action-cli.sh");
    const claudeEnv = {
      ACTION_ID: action.id,
      ACTION_CLI: cliScriptPath,
    };

    // Run Claude Code once
    const result = await runClaudeSession(
      cmd,
      projectDir,
      logFile,
      action,
      () => { wasCancelled = true; },
      claudeEnv,
    );

    totalToolsUsed = result.toolsUsedCount;
    const durationMs = Date.now() - executionStartTime;

    if (result.wasCancelled) {
      console.log(`\nAction ${action.id} was cancelled`);
      const { category } = classifyError(0, "", true);
      await db.transact(
        db.tx.actions[action.id].update({
          status: "cancelled",
          cancelRequested: null,
          completedAt: Date.now(),
          durationMs,
          toolsUsed: totalToolsUsed,
          errorCategory: category,
          sessionId: result.sessionId ?? null,
        })
      );
      return logFile;
    }

    if (!result.success) {
      console.error(`\nClaude exited with code ${result.exitCode}`);
      if (result.stderr) console.error("stderr:", result.stderr);

      const errorMsg = `Exit code ${result.exitCode}: ${result.stderr.slice(0, 500)}`;
      const { category } = classifyError(result.exitCode, result.stderr, false);
      await db.transact(
        db.tx.actions[action.id].update({
          status: "failed",
          errorMessage: errorMsg,
          completedAt: Date.now(),
          durationMs,
          toolsUsed: totalToolsUsed,
          errorCategory: category,
          sessionId: result.sessionId ?? null,
        })
      );

      // Send push notification for failed action
      await notifyActionFailed(action.id, action.title, errorMsg);
      return logFile;
    }

    // Check if Claude set the status to awaiting_feedback during execution
    const currentAction = await db.query({
      actions: { $: { where: { id: action.id } } },
    });
    const currentStatus = currentAction.actions[0]?.status;

    if (currentStatus === "awaiting_feedback") {
      // Claude requested user input - don't overwrite status, just update metadata
      console.log(`\nAction ${action.id} is awaiting user feedback`);
      await db.transact(
        db.tx.actions[action.id].update({
          durationMs,
          toolsUsed: totalToolsUsed,
          sessionId: result.sessionId ?? null,
        })
      );

      // Send push notification for awaiting feedback
      await notifyActionAwaitingFeedback(action.id, action.title, action.type);
    } else {
      // Success - mark as completed (goes directly to Done tab)
      console.log(`\nAction ${action.id} completed successfully`);
      await db.transact(
        db.tx.actions[action.id].update({
          status: "completed",
          completedAt: Date.now(),
          durationMs,
          toolsUsed: totalToolsUsed,
          sessionId: result.sessionId ?? null,
        })
      );

      // Send push notification for completed action
      await notifyActionCompleted(action.id, action.title, action.type);
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`Error executing action ${action.id}:`, errMsg);
    if (logFile) {
      await appendFile(logFile, `\n\n=== ERROR ===\n${errMsg}\n`);
    }
    const durationMs = Date.now() - executionStartTime;
    const { category } = classifyError(1, errMsg, false);
    await db.transact(
      db.tx.actions[action.id].update({
        status: "failed",
        errorMessage: errMsg,
        completedAt: Date.now(),
        durationMs,
        toolsUsed: totalToolsUsed,
        errorCategory: category,
      })
    );

    // Send push notification for failed action
    await notifyActionFailed(action.id, action.title, errMsg);
  }

  return logFile;
}

function buildExecutionPrompt(action: Action): string {
  // Calculate relative path to workspace/CLAUDE.md from projectDir
  const workspaceClaudePath = action.projectPath
    ? "../../CLAUDE.md"
    : "../CLAUDE.md";

  // Build working directory instruction based on type (use absolute paths for clarity)
  let workingDirInstruction: string;
  if (action.projectPath) {
    const absolutePath = isAbsolute(action.projectPath)
      ? action.projectPath
      : join(WORKSPACE_PROJECTS, action.projectPath);
    workingDirInstruction = `Your working directory is \`${absolutePath}\`. This project should already exist.`;
  } else if (action.type === "Project") {
    workingDirInstruction = `Your working directory is \`${WORKSPACE_PROJECTS}/\`. Create a NEW project subdirectory here.`;
  } else if (action.type === "CodeChange") {
    workingDirInstruction = `Your working directory is \`${WORKSPACE_PROJECTS}/\`. Locate the target project subdirectory first (it must already exist).`;
  } else {
    workingDirInstruction = `Your working directory is \`${WORKSPACE_PROJECTS}/\`.`;
  }

  // Build type-specific instruction with skill routing
  let typeSpecificInstruction: string;
  switch (action.type) {
    case "CodeChange":
      typeSpecificInstruction = `   - CodeChange (${action.subtype || "change"}): Work within the existing project directory. Implement the ${action.subtype || "change"}.${
        action.projectPath === "mic-app" || action.projectPath?.includes("mic-app")
          ? "\n   - After completing mic-app changes, push an OTA update: `cd /Users/rock/projects/mic-app && pnpm update:preview`"
          : ""
      }`;
      break;
    case "Project":
      typeSpecificInstruction = "   - Project: Research, plan, and create a NEW project in workspace/projects/. Use /frontend-design skill if building UI. Deploy web apps to dokku.";
      break;
    case "Research":
      typeSpecificInstruction = "   - Research: Use the /research skill for comprehensive multi-source analysis. Save findings to result with markdown formatting (Summary → Details → Sources).";
      break;
    case "Write":
      typeSpecificInstruction = "   - Write: For social media posts, use the /typefully skill immediately. For other content, write directly and save to result field.";
      break;
    case "UserTask":
      typeSpecificInstruction = action.prep_allowed
        ? `   - UserTask: This requires human action (${action.why_user || "user involvement needed"}). Maximize prep work:\n     - Research and document background info\n     - Draft templates/scripts/checklists\n     - Create any supporting materials\n     - Save everything to result field\n     Prep allowed: ${action.prep_allowed}`
        : `   - UserTask: This requires human action (${action.why_user || "user involvement needed"}). Document what the user needs to do clearly in the result field.`;
      break;
    default:
      typeSpecificInstruction = `   - ${action.type}: Complete the task`;
  }

  // Build description block
  let descriptionBlock = "";
  if (action.description) {
    descriptionBlock = `- Description: ${action.description}`;
  }
  // For UserTask, include the task field
  if (action.type === "UserTask" && action.task) {
    descriptionBlock += `\n- Task: ${action.task}`;
    if (action.why_user) descriptionBlock += `\n- Why user: ${action.why_user}`;
    if (action.prep_allowed) descriptionBlock += `\n- Prep allowed: ${action.prep_allowed}`;
    if (action.remind_at) descriptionBlock += `\n- Remind at: ${action.remind_at}`;
  }

  // Build subtype line for CodeChange
  const subtypeLine = action.type === "CodeChange" && action.subtype
    ? `- Subtype: ${action.subtype}`
    : "";

  // Build conversation thread if there are messages
  let conversationThread = "";
  if (action.messages) {
    try {
      const messages = JSON.parse(action.messages) as Array<{ role: string; content: string }>;
      if (messages.length > 0) {
        conversationThread = `CONVERSATION THREAD:
${messages.map((m) => `[${m.role.toUpperCase()}]: ${m.content}`).join("\n\n")}

The user has provided feedback. Continue iterating based on their input.
`;
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Build conditional safeguards (full version only for Project type)
  let safeguards: string;
  if (action.type === "Project") {
    safeguards = `
CRITICAL SAFEGUARDS - DO NOT VIOLATE:
- DO NOT push InstantDB schema changes (no \`npx instant-cli push schema\`)
- DO NOT push InstantDB permission changes (no \`npx instant-cli push perms\`)
- DO NOT use or reference INSTANT_APP_ID or INSTANT_ADMIN_TOKEN environment variables from the parent mic-app
- DO NOT reuse existing InstantDB app IDs - always create new apps with \`npx instant-cli init-without-files\`
- DO NOT read .env files from the parent mic-app directory or voice-listener directory
- Create standalone projects without shared database dependencies
- If you need a database for a new project, create a fresh InstantDB app with its own credentials
`;
  } else {
    safeguards = "";
  }

  // Build result formatting guidance
  const resultFormatting = `
RESULT FORMATTING:
- Use markdown formatting (bold headers, bullet points)
- Keep it scannable - key findings/links at the top
- For Write: Include Typefully draft IDs and links
- For Research: Structure as Summary → Details → Sources
- For Project: Include deployment URL and key features
`;

  return loadPrompt("execution", {
    ACTION_ID: action.id,
    ACTION_TYPE: action.type,
    ACTION_SUBTYPE: subtypeLine,
    ACTION_TITLE: action.title,
    ACTION_DESCRIPTION: descriptionBlock,
    CONVERSATION_THREAD: conversationThread,
    WORKING_DIR_INSTRUCTION: workingDirInstruction,
    WORKSPACE_CLAUDE_PATH: workspaceClaudePath,
    TYPE_SPECIFIC_INSTRUCTION: typeSpecificInstruction,
    SAFEGUARDS: safeguards,
    RESULT_FORMATTING: resultFormatting,
  });
}

async function pollForActions(): Promise<number> {
  try {
    const whereClause: Record<string, unknown> = {
      status: "pending",
    };

    if (SINCE) {
      whereClause.extractedAt = { $gte: SINCE };
    }

    const result = await db.query({
      actions: {
        $: {
          where: whereClause,
        },
        dependsOn: {}, // Include the dependency relationship
      },
    });

    let actions = (result.actions ?? []) as Action[];

    if (actions.length === 0) {
      return 0;
    }

    // Filter out actions waiting on incomplete dependencies
    const readyActions: Action[] = [];
    const waitingActions: Action[] = [];

    for (const action of actions) {
      if (isDependencyComplete(action)) {
        readyActions.push(action);
      } else {
        waitingActions.push(action);
      }
    }

    if (waitingActions.length > 0) {
      console.log(`${waitingActions.length} action(s) waiting on dependencies:`);
      for (const action of waitingActions) {
        const depStatus = getDependencyStatus(action);
        const depTitle = action.dependsOn?.[0]?.title ?? "unknown";
        console.log(`  - "${action.title}" waiting on "${depTitle}" (${depStatus})`);
      }
    }

    if (readyActions.length === 0) {
      return 0;
    }

    console.log(`Found ${readyActions.length} pending action(s) ready to execute`);

    // Sort by sequenceIndex (if present) to execute in order
    readyActions.sort((a, b) => {
      const aIdx = a.sequenceIndex ?? Infinity;
      const bIdx = b.sequenceIndex ?? Infinity;
      return aIdx - bIdx;
    });

    if (LIMIT < readyActions.length) {
      console.log(`Limiting to ${LIMIT} action(s)`);
      readyActions.splice(LIMIT);
    }

    // Execute actions in parallel batches
    let processed = 0;
    while (processed < readyActions.length) {
      const batch = readyActions.slice(processed, processed + MAX_CONCURRENCY);
      console.log(`\nExecuting batch of ${batch.length} action(s) in parallel...`);
      await Promise.all(batch.map((action) => executeAction(action)));
      processed += batch.length;
    }

    return readyActions.length;
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
  --no-debug-log    Disable debug logging (logging is ON by default)
  --skip-recovery   Skip recovering orphaned in_progress actions on startup
  --since DATE      Only process actions extracted on or after DATE
                    Accepts: "today", ISO date (2026-01-28), or epoch timestamp

Debug logging saves FULL Claude output including thinking/reasoning to
workspace/logs/{action-id}-{timestamp}.log. The log file path is stored
in the action record for the log watcher to tail.

Actions are executed in parallel batches of up to ${MAX_CONCURRENCY} at a time.

On startup, the executor recovers any actions stuck in "in_progress" state
(orphaned when the worker was previously stopped). Use --skip-recovery to
disable this behavior.

Examples:
  bun run src/action-executor.ts --dry-run --once --limit 1
  bun run src/action-executor.ts --once --limit 5
  bun run src/action-executor.ts --since today
  bun run src/action-executor.ts

  # Execute a specific action
  bun run src/action-executor.ts --action-id abc123
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
  if (SINCE) console.log(`  Since: ${new Date(SINCE).toLocaleString()}`);

  // Initialize prompt versioning
  if (!DRY_RUN) {
    try {
      const versionId = await initPromptVersioning();
      console.log(`  Prompt version: ${versionId}`);
    } catch (error) {
      console.error("Warning: Failed to initialize prompt versioning:", error);
    }
  }

  if (ACTION_ID) {
    await executeSpecificAction(ACTION_ID);
    console.log("\nDone.");
    process.exit(0);
  }

  // Send initial heartbeat
  if (!DRY_RUN) {
    await sendHeartbeat("starting");
  }

  if (!DRY_RUN && !SKIP_RECOVERY) {
    await recoverStaleActions();
  }

  console.log("\nPolling for pending actions...");

  const processed = await pollForActions();

  if (ONCE) {
    console.log(`\nDone. Processed ${processed} action(s).`);
    process.exit(0);
  }

  // Send heartbeat and set up interval
  if (!DRY_RUN) {
    await sendHeartbeat("listening");
    setInterval(() => sendHeartbeat("listening"), HEARTBEAT_INTERVAL);
  }

  setInterval(pollForActions, POLL_INTERVAL);

  console.log(`\nListening for new actions (polling every ${POLL_INTERVAL / 1000}s)...`);
}

main().catch(console.error);
