#!/usr/bin/env bun
/**
 * Exec v2 Agent Process
 *
 * A persistent process that polls InstantDB for tasks and executes them
 * via the Claude Agent SDK with full Mac access.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
  SDKAssistantMessage,
  SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { init, id } from "@instantdb/admin";
import schema from "../instant.schema";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { homedir } from "os";
import { resolve } from "path";

// --- Config ---

const APP_ID = process.env.INSTANT_APP_ID!;
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN!;
const PID_FILE = "/tmp/exec-agent.pid";
const LESSONS_PATH = resolve(homedir(), "ai/lessons.md");
const SYSTEM_PROMPT_PATH = resolve(import.meta.dir, "system-prompt.md");
const TASK_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const LIVE_OUTPUT_THROTTLE_MS = 2000;
const CANCEL_POLL_MS = 3000;
const TASK_POLL_MS = 3000;
const FOLLOW_UP_POLL_MS = 5000;

// --- PID Lock ---

function acquirePidLock(): boolean {
  if (existsSync(PID_FILE)) {
    const existingPid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
    try {
      process.kill(existingPid, 0);
      console.error(`Another agent is running (PID ${existingPid}). Exiting.`);
      return false;
    } catch {
      console.log(`Removing stale PID file (PID ${existingPid}).`);
    }
  }
  writeFileSync(PID_FILE, String(process.pid));
  return true;
}

function releasePidLock() {
  try {
    if (existsSync(PID_FILE)) {
      const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
      if (pid === process.pid) unlinkSync(PID_FILE);
    }
  } catch {}
}

// --- InstantDB ---

const db = init({ appId: APP_ID, adminToken: ADMIN_TOKEN, schema });

// --- FIFO Queue ---

const taskQueue: string[] = [];
const inFlight = new Set<string>();
let processing = false;

function enqueue(taskId: string) {
  if (!inFlight.has(taskId) && !taskQueue.includes(taskId)) {
    taskQueue.push(taskId);
    processNext();
  }
}

async function processNext() {
  if (processing || taskQueue.length === 0) return;
  processing = true;
  const taskId = taskQueue.shift()!;
  inFlight.add(taskId);

  try {
    await handleTask(taskId);
  } catch (err: any) {
    console.error(`Task ${taskId} failed:`, err.message);
    try {
      await db.transact(
        db.tx.tasks[taskId].update({
          status: "failed",
          errorMessage: err.message,
          completedAt: Date.now(),
        })
      );
    } catch {}
  } finally {
    inFlight.delete(taskId);
    processing = false;
    processNext();
  }
}

// --- Task Handler ---

async function handleTask(taskId: string) {
  const lessons = existsSync(LESSONS_PATH)
    ? readFileSync(LESSONS_PATH, "utf-8")
    : "";

  const systemPromptMd = existsSync(SYSTEM_PROMPT_PATH)
    ? readFileSync(SYSTEM_PROMPT_PATH, "utf-8")
    : "";

  // Fetch task with messages
  const resp = await db.query({ tasks: { $: { where: { id: taskId } }, messages: {} } });
  const task = resp.tasks[0] as any;
  if (!task) {
    console.warn(`Task ${taskId} not found, skipping.`);
    return;
  }

  // Determine if follow-up
  const isFollowUp = !!task.sessionId && task.status !== "pending";
  const prompt: string = isFollowUp ? buildFollowUpPrompt(task) : task.input;

  console.log(`[${isFollowUp ? "follow-up" : "new"}] Task ${taskId}: ${String(task.input).slice(0, 80)}...`);

  // Mark running
  await db.transact(
    db.tx.tasks[taskId].update({
      status: "running",
      startedAt: Date.now(),
      cancelRequested: false,
      errorMessage: "",
      liveOutput: "",
    })
  );

  const abortController = new AbortController();

  // Cancel polling
  const cancelInterval = setInterval(async () => {
    try {
      const r = await db.query({ tasks: { $: { where: { id: taskId } } } });
      if (r.tasks[0]?.cancelRequested) {
        console.log(`Task ${taskId} cancellation requested.`);
        abortController.abort();
      }
    } catch {}
  }, CANCEL_POLL_MS);

  // Task timeout
  const timeoutHandle = setTimeout(() => {
    console.log(`Task ${taskId} timed out after ${TASK_TIMEOUT_MS / 60000} minutes.`);
    abortController.abort();
  }, TASK_TIMEOUT_MS);

  // Build system prompt context
  const appendText = [
    systemPromptMd,
    lessons ? `\n\n# Learned Preferences\n\n${lessons}` : "",
  ].filter(Boolean).join("\n\n");

  const queryOptions: Record<string, unknown> = {
    cwd: resolve(homedir(), "ai/projects"),
    systemPrompt: {
      type: "preset" as const,
      preset: "claude_code" as const,
      append: appendText,
    },
    tools: { type: "preset", preset: "claude_code" },
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    abortController,
  };

  if (isFollowUp && task.sessionId) {
    queryOptions.resume = task.sessionId;
  }

  const q = query({ prompt, options: queryOptions as any });

  let sessionId: string | undefined = task.sessionId || undefined;
  let lastLiveOutputTime = 0;

  // Activity tracking for live output
  const MAX_ACTIVITY_ITEMS = 15;
  const activityItems: Array<{
    type: "tool" | "text" | "thinking";
    name?: string;
    detail?: string;
    content?: string;
    ts: number;
  }> = [];

  function addActivity(item: (typeof activityItems)[0]) {
    activityItems.push(item);
    if (activityItems.length > MAX_ACTIVITY_ITEMS) {
      activityItems.splice(0, activityItems.length - MAX_ACTIVITY_ITEMS);
    }
  }

  function formatToolDetail(name: string, input: Record<string, any>): string {
    switch (name) {
      case "Read":
        return input.file_path ? truncPath(input.file_path) : "";
      case "Write":
        return input.file_path ? truncPath(input.file_path) : "";
      case "Edit":
        return input.file_path ? truncPath(input.file_path) : "";
      case "Glob":
        return input.pattern || "";
      case "Grep":
        return input.pattern ? `"${input.pattern}"` : "";
      case "Bash":
        return input.command ? truncStr(input.command, 80) : "";
      case "Agent":
        return input.description || input.prompt?.slice(0, 60) || "";
      case "WebSearch":
        return input.query || "";
      case "WebFetch":
        return input.url ? truncStr(input.url, 60) : "";
      default:
        return "";
    }
  }

  function truncPath(p: string): string {
    // Show last 3 segments
    const parts = p.split("/");
    return parts.length > 3 ? ".../" + parts.slice(-3).join("/") : p;
  }

  function truncStr(s: string, max: number): string {
    return s.length > max ? s.slice(0, max) + "..." : s;
  }

  async function flushLiveOutput() {
    const now = Date.now();
    if (now - lastLiveOutputTime >= LIVE_OUTPUT_THROTTLE_MS && activityItems.length > 0) {
      lastLiveOutputTime = now;
      await db.transact(
        db.tx.tasks[taskId].update({
          liveOutput: JSON.stringify(activityItems),
        })
      );
    }
  }

  try {
    for await (const message of q) {
      if (abortController.signal.aborted) break;

      if (message.type === "assistant") {
        const assistantMsg = message as SDKAssistantMessage;
        if (assistantMsg.session_id) sessionId = assistantMsg.session_id;

        for (const block of assistantMsg.message.content as any[]) {
          if (block.type === "tool_use") {
            addActivity({
              type: "tool",
              name: block.name,
              detail: formatToolDetail(block.name, block.input || {}),
              ts: Date.now(),
            });
          } else if (block.type === "thinking" && block.thinking) {
            // Capture first line of thinking as a summary
            const firstLine = block.thinking.split("\n")[0].trim();
            if (firstLine) {
              addActivity({
                type: "thinking",
                content: truncStr(firstLine, 120),
                ts: Date.now(),
              });
            }
          } else if (block.type === "text" && block.text) {
            // Capture latest text snippet
            const lines = block.text.trim().split("\n");
            const lastLine = lines[lines.length - 1].trim();
            if (lastLine) {
              addActivity({
                type: "text",
                content: truncStr(lastLine, 150),
                ts: Date.now(),
              });
            }
          }
        }

        await flushLiveOutput();
      }

      if (message.type === "result") {
        const resultMsg = message as any; // SDKResultMessage union type
        const success = resultMsg.subtype === "success";
        const resultText: string = resultMsg.result || "";
        const errors: string[] = resultMsg.errors || [];

        // Write assistant reply to thread
        if (resultText) {
          await db.transact(
            db.tx.messages[id()].create({
              role: "assistant",
              content: resultText,
              createdAt: Date.now(),
            }).link({ task: taskId })
          );
        }

        // Re-fetch to get latest message ID (can't paginate nested relations, so fetch all messages)
        const updated = await db.query({
          tasks: { $: { where: { id: taskId } }, messages: {} },
        });
        const msgs = (updated.tasks[0] as any)?.messages || [];
        const sortedMsgs = msgs.sort((a: any, b: any) => b.createdAt - a.createdAt);
        const latestMsgId = sortedMsgs[0]?.id || "";

        await db.transact(
          db.tx.tasks[taskId].update({
            status: success ? "done" : "failed",
            result: resultText,
            sessionId: sessionId || "",
            liveOutput: "",
            errorMessage: success ? "" : (errors.join("\n") || "Unknown error"),
            completedAt: Date.now(),
            lastSeenMessageId: latestMsgId,
          })
        );

        console.log(`Task ${taskId} ${success ? "completed" : "failed"}.`);
      }
    }
  } catch (err: any) {
    if (err.name === "AbortError" || abortController.signal.aborted) {
      const r = await db.query({ tasks: { $: { where: { id: taskId } } } });
      const wasCancelled = (r.tasks[0] as any)?.cancelRequested;

      await db.transact(
        db.tx.tasks[taskId].update({
          status: wasCancelled ? "cancelled" : "failed",
          errorMessage: wasCancelled ? "Cancelled by user" : "Task timed out",
          liveOutput: "",
          sessionId: sessionId || "",
          completedAt: Date.now(),
        })
      );
    } else {
      throw err;
    }
  } finally {
    clearInterval(cancelInterval);
    clearTimeout(timeoutHandle);
  }
}

// --- Follow-up Helpers ---

function buildFollowUpPrompt(task: any): string {
  const messages = task.messages || [];
  const lastSeenId = task.lastSeenMessageId;
  let newMessages = messages.filter((m: any) => m.role === "user");

  if (lastSeenId) {
    const lastSeenIdx = messages.findIndex((m: any) => m.id === lastSeenId);
    if (lastSeenIdx >= 0) {
      newMessages = messages
        .slice(lastSeenIdx + 1)
        .filter((m: any) => m.role === "user");
    }
  }

  if (newMessages.length === 0) return "The user is following up. Check for new context.";
  return newMessages.map((m: any) => m.content).join("\n\n");
}

// --- Polling ---

async function pollForPendingTasks() {
  try {
    const resp = await db.query({
      tasks: { $: { where: { status: "pending" }, order: { createdAt: "asc" } } },
    });
    for (const task of resp.tasks) {
      enqueue(task.id);
    }
  } catch (err: any) {
    console.error("Poll error:", err.message);
  }
}

async function pollForFollowUps() {
  try {
    const resp = await db.query({
      tasks: {
        $: { where: { status: "done" } },
        messages: {},
      },
    });
    for (const task of resp.tasks as any[]) {
      const msgs = (task.messages || []).sort((a: any, b: any) => b.createdAt - a.createdAt);
      const latestMsg = msgs[0];
      if (
        latestMsg &&
        latestMsg.role === "user" &&
        task.sessionId &&
        latestMsg.id !== task.lastSeenMessageId
      ) {
        console.log(`Follow-up detected for task ${task.id}`);
        enqueue(task.id);
      }
    }
  } catch (err: any) {
    console.error("Follow-up poll error:", err.message);
  }
}

// --- Crash Recovery ---

async function recoverStaleTasks() {
  try {
    const resp = await db.query({
      tasks: { $: { where: { status: "running" } } },
    });
    for (const task of resp.tasks) {
      console.log(`Recovering stale task ${task.id} (was running).`);
      await db.transact(db.tx.tasks[task.id].update({ status: "pending" }));
    }
  } catch (err: any) {
    console.error("Recovery error:", err.message);
  }
}

// --- Main ---

async function main() {
  if (!acquirePidLock()) process.exit(1);

  process.on("exit", releasePidLock);
  process.on("SIGINT", () => { releasePidLock(); process.exit(0); });
  process.on("SIGTERM", () => { releasePidLock(); process.exit(0); });

  console.log(`Exec agent started (PID ${process.pid}).`);

  await recoverStaleTasks();

  // Poll for new tasks
  setInterval(pollForPendingTasks, TASK_POLL_MS);
  pollForPendingTasks(); // immediate first poll

  // Poll for follow-ups
  setInterval(pollForFollowUps, FOLLOW_UP_POLL_MS);

  console.log("Listening for tasks...");
}

main().catch((err) => {
  console.error("Fatal:", err);
  releasePidLock();
  process.exit(1);
});
