/**
 * Log Watcher - Tails action execution logs and updates InstantDB with progress
 *
 * Surfaces what matters:
 * - Skills being used (important!)
 * - What Claude says it's doing (assistant messages)
 * - Current task from todos
 * - Simple activity timeline
 */

import { basename } from "path";
import { stat, open } from "fs/promises";
import { db, id } from "./db";

interface Action {
  id: string;
  status: string;
  logFile?: string;
  progress?: string;
  projectPath?: string;
}

// Activity types for the timeline
type ActivityType = "skill" | "tool" | "agent" | "message" | "milestone";

interface Activity {
  id: string;
  type: ActivityType;
  icon: string; // Emoji for whimsy
  label: string; // Short, human-readable
  detail?: string; // Optional extra context
  timestamp: number;
  duration?: number; // Only for completed items
  status: "active" | "done" | "error";
}

interface Progress {
  // The most important stuff up top
  currentActivity?: string; // What's happening RIGHT NOW
  skills: string[]; // Skills used (badges)

  // Task progress
  currentTask?: string; // From todos activeForm
  taskProgress?: { done: number; total: number };

  // Activity feed (timeline)
  activities: Activity[];

  // Meta
  lastUpdate: number;
}

interface WatchedFile {
  actionId: string;
  projectPath?: string;
  path: string;
  position: number;
  progress: Progress;
  buffer: string; // Accumulate partial lines
  writtenEventIds: Set<string>; // Dedup: activity IDs already written to events entity
}

const POLL_INTERVAL = 2000;
const TAIL_INTERVAL = 500;
const UPDATE_DEBOUNCE = 800;
const MAX_ACTIVITIES = 30;

const args = process.argv.slice(2);
const ONCE = args.includes("--once");
const VERBOSE = args.includes("--verbose");

const watchedFiles = new Map<string, WatchedFile>();
const pendingUpdates = new Map<string, ReturnType<typeof setTimeout>>();

function log(msg: string) {
  console.log(`[log-watcher] ${msg}`);
}

function debug(msg: string) {
  if (VERBOSE) console.log(`[log-watcher:debug] ${msg}`);
}

let activityCounter = 0;
function genId(): string {
  return `a_${Date.now()}_${++activityCounter}`;
}

// Verbose internal operations to filter from activity log
// These are infrastructure commands that don't need to surface to users
const FILTERED_BASH_DESCRIPTIONS = [
  /^update-action-cli/i,
  /^check if scripts directory/i,
  /^check action_cli/i,
  /^update action (result|status|deployurl)/i,
  /^set action (result|status|deployurl)/i,
  /^run update-action-cli/i,
];

function shouldFilterBashActivity(description: string | undefined): boolean {
  if (!description) return false;
  return FILTERED_BASH_DESCRIPTIONS.some((pattern) => pattern.test(description));
}

// Map tools to friendly names and emojis
const TOOL_DISPLAY: Record<string, { icon: string; label: string }> = {
  // Skills & agents get special treatment
  Skill: { icon: "✨", label: "Using skill" },
  Task: { icon: "🤖", label: "Running agent" },

  // File operations
  Read: { icon: "📖", label: "Reading" },
  Write: { icon: "✏️", label: "Writing" },
  Edit: { icon: "🔧", label: "Editing" },
  Glob: { icon: "🔍", label: "Finding files" },
  Grep: { icon: "🔎", label: "Searching" },

  // Web
  WebSearch: { icon: "🌐", label: "Searching web" },
  WebFetch: { icon: "📡", label: "Fetching" },

  // System
  Bash: { icon: "⚡", label: "Running" },
  TodoWrite: { icon: "📋", label: "Planning" },

  // Default
  default: { icon: "⚙️", label: "Working" },
};

function getToolDisplay(name: string): { icon: string; label: string } {
  return TOOL_DISPLAY[name] || TOOL_DISPLAY.default;
}

// Extract meaningful detail from tool parameters
function extractDetail(toolName: string, line: string): string | undefined {
  // Skill name
  if (toolName === "Skill") {
    const match = line.match(/"skill"\s*:\s*"([^"]+)"/);
    return match?.[1];
  }

  // Agent description
  if (toolName === "Task") {
    const desc = line.match(/"description"\s*:\s*"([^"]+)"/);
    return desc?.[1];
  }

  // Bash description
  if (toolName === "Bash") {
    const desc = line.match(/"description"\s*:\s*"([^"]+)"/);
    return desc?.[1];
  }

  // File path (just filename)
  if (["Read", "Write", "Edit"].includes(toolName)) {
    const match = line.match(/"file_path"\s*:\s*"([^"]+)"/);
    if (match) return basename(match[1]);
  }

  // Search query
  if (toolName === "WebSearch") {
    const match = line.match(/"query"\s*:\s*"([^"]+)"/);
    if (match) return `"${match[1].slice(0, 50)}${match[1].length > 50 ? "..." : ""}"`;
  }

  // Glob pattern
  if (toolName === "Glob") {
    const match = line.match(/"pattern"\s*:\s*"([^"]+)"/);
    return match?.[1];
  }

  return undefined;
}

// Track active activities for completion matching
const activeActivities = new Map<string, string>(); // toolUseId -> activityId

function addActivity(progress: Progress, activity: Omit<Activity, "id">): string {
  const id = genId();
  progress.activities.push({ id, ...activity });

  // Keep only recent activities
  if (progress.activities.length > MAX_ACTIVITIES) {
    progress.activities = progress.activities.slice(-MAX_ACTIVITIES);
  }

  return id;
}

function completeActivity(progress: Progress, id: string, status: "done" | "error" = "done"): boolean {
  const activity = progress.activities.find((a) => a.id === id);
  if (activity && activity.status === "active") {
    activity.status = status;
    activity.duration = Date.now() - activity.timestamp;
    return true;
  }
  return false;
}

// Pending events to write (batched with progress updates)
const pendingEvents = new Map<string, { actionId: string; projectPath?: string; activities: Activity[] }>();

function queueEventWrite(actionId: string, projectPath: string | undefined, activity: Activity, writtenIds: Set<string>) {
  if (writtenIds.has(activity.id)) return;
  writtenIds.add(activity.id);

  let batch = pendingEvents.get(actionId);
  if (!batch) {
    batch = { actionId, projectPath, activities: [] };
    pendingEvents.set(actionId, batch);
  }
  batch.activities.push(activity);
}

async function flushEvents(actionId: string) {
  const batch = pendingEvents.get(actionId);
  if (!batch || batch.activities.length === 0) return;

  const activities = batch.activities.splice(0);
  pendingEvents.delete(actionId);

  try {
    const txs: any[] = [];
    let lastTimestamp = 0;
    for (const activity of activities) {
      const eventId = id();
      txs.push(
        db.tx.events[eventId].update({
          actionId: batch.actionId,
          projectPath: batch.projectPath ?? null,
          type: activity.type,
          icon: activity.icon,
          label: activity.label,
          detail: activity.detail ?? null,
          status: activity.status,
          duration: activity.duration ?? null,
          createdAt: activity.timestamp,
        }),
        db.tx.events[eventId].link({ action: batch.actionId }),
      );
      if (activity.timestamp > lastTimestamp) lastTimestamp = activity.timestamp;
    }
    if (lastTimestamp > 0) {
      txs.push(db.tx.actions[batch.actionId].update({ lastEventAt: lastTimestamp }));
    }
    await db.transact(txs);
    debug(`Wrote ${activities.length} events for ${actionId}`);
  } catch (error) {
    console.error(`Failed to write events for ${actionId}:`, error);
  }
}

/**
 * Parse a chunk of log content
 */
function parseContent(content: string, progress: Progress): boolean {
  let changed = false;
  const lines = content.split("\n");

  for (const line of lines) {
    if (!line.trim()) continue;

    // === SKILL INVOCATION (most important!) ===
    if (line.includes('<tool_use name="Skill">')) {
      // Look for skill name in nearby content
      const skillMatch = content.match(/<tool_use name="Skill">[^}]*"skill"\s*:\s*"([^"]+)"/s);
      if (skillMatch) {
        const skillName = skillMatch[1];
        if (!progress.skills.includes(skillName)) {
          progress.skills.push(skillName);
          debug(`Skill used: ${skillName}`);
        }
        const display = getToolDisplay("Skill");
        const activityId = addActivity(progress, {
          type: "skill",
          icon: display.icon,
          label: display.label,
          detail: skillName,
          timestamp: Date.now(),
          status: "active",
        });
        progress.currentActivity = `Using ${skillName}`;
        changed = true;
      }
    }

    // === TOOL USE ===
    const toolMatch = line.match(/<tool_use name="([^"]+)">/);
    if (toolMatch && toolMatch[1] !== "Skill") {
      const toolName = toolMatch[1];
      const display = getToolDisplay(toolName);
      const detail = extractDetail(toolName, content);

      // Filter out verbose internal operations for Bash
      if (toolName === "Bash" && shouldFilterBashActivity(detail)) {
        debug(`Filtered internal Bash: ${detail}`);
        // Still track for completion but don't add to activities
        const toolIdMatch = line.match(/"id"\s*:\s*"([^"]+)"/);
        if (toolIdMatch) {
          activeActivities.set(toolIdMatch[1], "_filtered");
        }
        continue;
      }

      // Determine activity type
      let type: ActivityType = "tool";
      if (toolName === "Task") type = "agent";

      const activityId = addActivity(progress, {
        type,
        icon: display.icon,
        label: display.label,
        detail,
        timestamp: Date.now(),
        status: "active",
      });

      // Set current activity with detail
      if (detail) {
        progress.currentActivity = `${display.label}: ${detail}`;
      } else {
        progress.currentActivity = display.label;
      }

      // Track for completion
      const toolIdMatch = line.match(/"id"\s*:\s*"([^"]+)"/);
      if (toolIdMatch) {
        activeActivities.set(toolIdMatch[1], activityId);
      }

      changed = true;
      debug(`Tool: ${toolName} ${detail ? `(${detail})` : ""}`);
    }

    // === TOOL RESULT (completion) ===
    if (line.includes("<tool_result>") || line.includes('"tool_result"')) {
      const toolIdMatch = line.match(/"tool_use_id"\s*:\s*"([^"]+)"/);
      if (toolIdMatch) {
        const activityId = activeActivities.get(toolIdMatch[1]);
        if (activityId) {
          // Skip filtered activities (internal operations)
          if (activityId === "_filtered") {
            activeActivities.delete(toolIdMatch[1]);
            continue;
          }
          // Check if it's an error
          const isError = line.includes('"is_error":true') || line.includes('"is_error": true');
          completeActivity(progress, activityId, isError ? "error" : "done");
          activeActivities.delete(toolIdMatch[1]);
          changed = true;
        }
      }
    }

    // === TODOS (task progress) ===
    const todoEventMatch = line.match(/<!-- event:.*"tool_use_result":\s*(\{[^}]*"newTodos"[^}]*\})/);
    if (todoEventMatch || line.includes('"newTodos"')) {
      try {
        // Try to parse todos from the line
        const todosMatch = content.match(/"newTodos"\s*:\s*\[([\s\S]*?)\]/);
        if (todosMatch) {
          const todosStr = `[${todosMatch[1]}]`;
          const todos = JSON.parse(todosStr) as Array<{ content: string; status: string; activeForm?: string }>;

          // Update task progress
          const done = todos.filter((t) => t.status === "completed").length;
          progress.taskProgress = { done, total: todos.length };

          // Find current task
          const current = todos.find((t) => t.status === "in_progress");
          if (current) {
            progress.currentTask = current.activeForm || current.content;

            // Add milestone for new task
            addActivity(progress, {
              type: "milestone",
              icon: "📌",
              label: current.activeForm || current.content,
              timestamp: Date.now(),
              status: "active",
            });
          }

          changed = true;
          debug(`Tasks: ${done}/${todos.length}`);
        }
      } catch {
        // Ignore parse errors
      }
    }

    // === ASSISTANT MESSAGE (what Claude says) ===
    // These appear as plain text between tool blocks
    // Look for sentences that describe intent
    if (
      !line.startsWith("<") &&
      !line.startsWith("{") &&
      !line.startsWith("<!--") &&
      line.length > 20 &&
      line.length < 200
    ) {
      // Check if it looks like an intent message
      const intentPatterns = [
        /^(I'll|I will|Let me|Now I|First,|Next,)/i,
        /^(Creating|Building|Implementing|Setting up|Adding)/i,
        /^(This will|This should|This creates)/i,
      ];

      const isIntent = intentPatterns.some((p) => p.test(line.trim()));
      if (isIntent) {
        const message = line.trim().slice(0, 100);
        addActivity(progress, {
          type: "message",
          icon: "💭",
          label: message,
          timestamp: Date.now(),
          status: "done", // Messages are instant
        });
        progress.currentActivity = message;
        changed = true;
        debug(`Message: ${message.slice(0, 50)}...`);
      }
    }
  }

  return changed;
}

async function tailFile(watched: WatchedFile): Promise<boolean> {
  try {
    const stats = await stat(watched.path);
    if (stats.size <= watched.position) return false;

    const fileHandle = await open(watched.path, "r");
    const buffer = Buffer.alloc(stats.size - watched.position);
    await fileHandle.read(buffer, 0, buffer.length, watched.position);
    await fileHandle.close();

    const newContent = buffer.toString("utf-8");
    watched.position = stats.size;
    watched.progress.lastUpdate = Date.now();

    const prevCount = watched.progress.activities.length;
    const changed = parseContent(newContent, watched.progress);

    // Queue new activities for persistent event writes
    if (watched.progress.activities.length > prevCount) {
      const newActivities = watched.progress.activities.slice(prevCount);
      for (const activity of newActivities) {
        queueEventWrite(watched.actionId, watched.projectPath, activity, watched.writtenEventIds);
      }
    }

    return changed;
  } catch (error) {
    debug(`Error tailing ${watched.path}: ${error}`);
    return false;
  }
}

function scheduleUpdate(actionId: string, progress: Progress) {
  const existing = pendingUpdates.get(actionId);
  if (existing) clearTimeout(existing);

  const timeout = setTimeout(async () => {
    pendingUpdates.delete(actionId);
    try {
      await db.transact(
        db.tx.actions[actionId].update({
          progress: JSON.stringify(progress),
        })
      );
      debug(`Updated progress for ${actionId}`);
    } catch (error) {
      console.error(`Failed to update progress for ${actionId}:`, error);
    }
    // Flush persistent events alongside progress update
    await flushEvents(actionId);
  }, UPDATE_DEBOUNCE);

  pendingUpdates.set(actionId, timeout);
}

async function pollForActions(): Promise<number> {
  try {
    const result = await db.query({
      actions: {
        $: { where: { status: "in_progress" } },
      },
    });

    const actions = (result.actions ?? []) as Action[];
    let newWatches = 0;

    for (const action of actions) {
      if (action.logFile && !watchedFiles.has(action.id)) {
        log(`Watching: ${basename(action.logFile)}`);
        watchedFiles.set(action.id, {
          actionId: action.id,
          projectPath: action.projectPath,
          path: action.logFile,
          position: 0,
          progress: {
            skills: [],
            activities: [],
            lastUpdate: Date.now(),
          },
          buffer: "",
          writtenEventIds: new Set(),
        });
        newWatches++;
      }
    }

    // Stop watching completed actions
    const activeIds = new Set(actions.map((a) => a.id));
    for (const [actionId, watched] of watchedFiles) {
      if (!activeIds.has(actionId)) {
        log(`Stopped: ${basename(watched.path)}`);
        watchedFiles.delete(actionId);
        const pending = pendingUpdates.get(actionId);
        if (pending) {
          clearTimeout(pending);
          pendingUpdates.delete(actionId);
        }
        // Flush any remaining events
        await flushEvents(actionId);
      }
    }

    return newWatches;
  } catch (error) {
    console.error("Polling error:", error);
    return 0;
  }
}

async function tailAll(): Promise<void> {
  for (const [actionId, watched] of watchedFiles) {
    const changed = await tailFile(watched);
    if (changed) {
      scheduleUpdate(actionId, watched.progress);
    }
  }
}

async function main(): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Log Watcher - Surface what Claude is doing

Usage: bun run src/log-watcher.ts [options]

Options:
  --once      Process once and exit
  --verbose   Show debug output
`);
    process.exit(0);
  }

  log("Starting...");
  if (ONCE) log("  Mode: ONCE");
  if (VERBOSE) log("  Verbose: ON");

  await pollForActions();

  if (ONCE) {
    await tailAll();
    // Flush pending updates
    for (const [actionId, timeout] of pendingUpdates) {
      clearTimeout(timeout);
      const watched = watchedFiles.get(actionId);
      if (watched) {
        await db.transact(
          db.tx.actions[actionId].update({
            progress: JSON.stringify(watched.progress),
          })
        );
      }
    }
    log("Done.");
    process.exit(0);
  }

  setInterval(pollForActions, POLL_INTERVAL);
  setInterval(tailAll, TAIL_INTERVAL);

  log(`Watching (poll: ${POLL_INTERVAL / 1000}s, tail: ${TAIL_INTERVAL}ms)...`);
}

main().catch(console.error);
