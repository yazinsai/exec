#!/usr/bin/env bun
/**
 * Exec agent
 *
 * Notes are the top-level intake records.
 * Triage turns notes into child tasks.
 * The scheduler executes runnable child tasks with project serialization.
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
import { NOTE_STATUSES, TASK_STATUSES } from "../lib/workflow";
import { triageTranscript } from "./triage";
import { getProjectPath, getProjectsRoot } from "./project-index";
import { migrateLegacyTasksToNotes } from "./migrations";

const APP_ID = process.env.INSTANT_APP_ID!;
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN!;
const PID_FILE = "/tmp/exec-agent.pid";
const LESSONS_PATH = resolve(homedir(), "ai/lessons.md");
const AGENT_DIR = decodeURIComponent(new URL(".", import.meta.url).pathname);
const SYSTEM_PROMPT_PATH = resolve(AGENT_DIR, "system-prompt.md");
const TASK_TIMEOUT_MS = 30 * 60 * 1000;
const LIVE_OUTPUT_THROTTLE_MS = 2000;
const CANCEL_POLL_MS = 3000;
const TASK_POLL_MS = 3000;
const NOTE_POLL_MS = 3000;
const FOLLOW_UP_POLL_MS = 5000;
const MAX_CONCURRENT_TASKS = 2;
const MAX_TRIAGE_CONCURRENCY = 1;

const db: any = init({ appId: APP_ID, adminToken: ADMIN_TOKEN, schema });

const runningTasks = new Set<string>();
const runningNotes = new Set<string>();
const projectLocks = new Set<string>();
let dispatchInProgress = false;

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
    if (!existsSync(PID_FILE)) return;
    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
    if (pid === process.pid) unlinkSync(PID_FILE);
  } catch {}
}

function truncPath(p: string): string {
  const parts = p.split("/");
  return parts.length > 3 ? ".../" + parts.slice(-3).join("/") : p;
}

function truncStr(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
}

function formatToolDetail(name: string, input: Record<string, any>): string {
  switch (name) {
    case "Read":
    case "Write":
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

function getProjectSlug(task: any): string | null {
  return task.project?.slug || task.projectSlug || null;
}

function getResumeSessionId(task: any): string | undefined {
  return task.project?.sessionId || task.sessionId || undefined;
}

function hasUnreadUserMessages(task: any): boolean {
  const messages = [...(task.messages || [])].sort((a: any, b: any) => a.createdAt - b.createdAt);
  const lastSeenId = task.lastSeenMessageId;
  const lastSeenIndex = lastSeenId
    ? messages.findIndex((message: any) => message.id === lastSeenId)
    : -1;
  const relevant = lastSeenIndex >= 0 ? messages.slice(lastSeenIndex + 1) : messages;
  return relevant.some((message: any) => message.role === "user");
}

function buildFollowUpPrompt(task: any): string {
  const messages = [...(task.messages || [])].sort((a: any, b: any) => a.createdAt - b.createdAt);
  const lastSeenId = task.lastSeenMessageId;
  let startIndex = 0;

  if (lastSeenId) {
    const idx = messages.findIndex((message: any) => message.id === lastSeenId);
    if (idx >= 0) startIndex = idx + 1;
  }

  const newMessages = messages
    .slice(startIndex)
    .filter((message: any) => message.role === "user");

  if (newMessages.length === 0) {
    return "The user is following up. Check for new context.";
  }

  return newMessages.map((message: any) => message.content).join("\n\n");
}

async function ensureProject(slug: string, createdAt: number): Promise<string> {
  const existing = await db.query({
    projects: {
      $: { where: { slug } },
    },
  } as any);

  const project = existing.projects[0] as any;
  if (project) return project.id;

  const projectId = id();
  await db.transact(
    db.tx.projects[projectId].update({
      slug,
      path: getProjectPath(slug),
      createdAt,
    })
  );
  return projectId;
}

async function handleNote(noteId: string) {
  const resp = await db.query({
    notes: {
      $: { where: { id: noteId } },
      tasks: {},
    },
  } as any);

  const note = resp.notes[0] as any;
  if (!note || note.status !== NOTE_STATUSES.pending) return;
  if (!note.transcript?.trim()) {
    await db.transact(
      db.tx.notes[noteId].update({
        status: NOTE_STATUSES.empty,
        triagedAt: Date.now(),
      })
    );
    return;
  }

  await db.transact(
    db.tx.notes[noteId].update({
      status: NOTE_STATUSES.triaging,
      errorMessage: "",
    })
  );

  const dictTerms = await getDictionaryTerms();
  const triage = await triageTranscript(note.transcript, dictTerms);
  const now = Date.now();

  // Re-query the note to get the current summary — summarizeInput may have
  // updated it on the client while triage was running (race condition).
  const freshResp = await db.query({ notes: { $: { where: { id: noteId } } } } as any);
  const currentSummary = (freshResp.notes[0] as any)?.summary;
  const hasRealSummary = currentSummary && currentSummary !== "Transcribing...";

  if (triage.tasks.length === 0) {
    await db.transact(
      db.tx.notes[noteId].update({
        status: NOTE_STATUSES.empty,
        ...(hasRealSummary ? {} : triage.summary ? { summary: triage.summary } : {}),
        triageResult: JSON.stringify(triage.rawStructuredOutput ?? []),
        triagedAt: now,
      })
    );
    return;
  }

  const projectIdBySlug = new Map<string, string>();
  for (const triagedTask of triage.tasks) {
    if (!triagedTask.projectSlug) continue;
    if (projectIdBySlug.has(triagedTask.projectSlug)) continue;
    const projectId = await ensureProject(triagedTask.projectSlug, now);
    projectIdBySlug.set(triagedTask.projectSlug, projectId);
  }

  const txs: any[] = [
    db.tx.notes[noteId].update({
      status: NOTE_STATUSES.ready,
      ...(hasRealSummary ? {} : triage.summary ? { summary: triage.summary } : {}),
      triageResult: JSON.stringify(triage.rawStructuredOutput ?? []),
      triagedAt: now,
      errorMessage: "",
    }),
  ];

  const taskIds: string[] = [];

  for (const [index, triagedTask] of triage.tasks.entries()) {
    const taskId = id();
    const messageId = id();
    taskIds[index] = taskId;

    const links: Record<string, string> = { note: noteId };
    if (triagedTask.projectSlug) {
      const projectId = projectIdBySlug.get(triagedTask.projectSlug);
      if (projectId) links.project = projectId;
    }

    txs.push(
      db.tx.tasks[taskId]
        .update({
          input: triagedTask.action,
          summary: triagedTask.title,
          status:
            triagedTask.dependsOn.length > 0 ? TASK_STATUSES.blocked : TASK_STATUSES.pending,
          source: note.source,
          ...(triagedTask.sourceSnippet ? { rawInput: triagedTask.sourceSnippet } : {}),
          ...(triagedTask.dependsOn.length > 0
            ? { blockedReason: "waiting_on_dependencies" }
            : {}),
          read: false,
          errorMessage: "",
          extractionIndex: index,
          ...(triagedTask.sourceSnippet ? { sourceSnippet: triagedTask.sourceSnippet } : {}),
          ...(triagedTask.projectSlug ? { projectSlug: triagedTask.projectSlug } : {}),
          triageRunId: String(now),
          createdAt: now + index,
        })
        .link(links)
    );
    txs.push(
      db.tx.messages[messageId]
        .update({
          role: "user",
          content: triagedTask.action,
          createdAt: now + index,
        })
        .link({ task: taskId })
    );
  }

  for (const [index, triagedTask] of triage.tasks.entries()) {
    const taskId = taskIds[index];
    for (const blockerIndex of triagedTask.dependsOn) {
      const blockerTaskId = taskIds[blockerIndex];
      if (!blockerTaskId) continue;
      txs.push(
        db.tx.taskDependencies[id()]
          .update({ createdAt: now })
          .link({ task: taskId, dependsOn: blockerTaskId })
      );
    }
  }

  await db.transact(txs);
}

async function pollPendingNotes() {
  if (runningNotes.size >= MAX_TRIAGE_CONCURRENCY) return;

  try {
    const resp = await db.query({
      notes: {
        $: { where: { status: NOTE_STATUSES.pending }, order: { createdAt: "asc" } },
      },
    } as any);

    for (const note of resp.notes as any[]) {
      if (runningNotes.size >= MAX_TRIAGE_CONCURRENCY) break;
      if (runningNotes.has(note.id)) continue;

      runningNotes.add(note.id);
      handleNote(note.id)
        .catch(async (error: any) => {
          console.error(`Triage failed for note ${note.id}:`, error.message);
          await db.transact(
            db.tx.notes[note.id].update({
              status: NOTE_STATUSES.triageFailed,
              errorMessage: error.message,
            })
          );
        })
        .finally(() => {
          runningNotes.delete(note.id);
          void dispatchRunnableTasks();
        });
    }
  } catch (error: any) {
    console.error("Pending note poll error:", error.message);
  }
}

async function reconcileTaskDependencies() {
  const resp = await db.query({
    tasks: {
      $: {
        where: {
          or: [
            { status: TASK_STATUSES.pending },
            { status: TASK_STATUSES.blocked },
          ],
        },
      },
      dependencies: { dependsOn: {} },
    },
  } as any);

  for (const task of resp.tasks as any[]) {
    const blockers = (task.dependencies || [])
      .map((edge: any) => edge.dependsOn)
      .filter(Boolean);

    if (task.cancelRequested) {
      if (task.status !== TASK_STATUSES.cancelled) {
        await db.transact(
          db.tx.tasks[task.id].update({
            status: TASK_STATUSES.cancelled,
            blockedReason: "",
            errorMessage: "Cancelled by user",
            completedAt: Date.now(),
          })
        );
      }
      continue;
    }

    let desiredStatus = task.status;
    let blockedReason = "";

    if (blockers.length === 0) {
      desiredStatus = TASK_STATUSES.pending;
    } else if (blockers.some((blocker: any) => blocker.status === TASK_STATUSES.failed)) {
      desiredStatus = TASK_STATUSES.blocked;
      blockedReason = "dependency_failed";
    } else if (blockers.some((blocker: any) => blocker.status === TASK_STATUSES.cancelled)) {
      desiredStatus = TASK_STATUSES.blocked;
      blockedReason = "dependency_cancelled";
    } else if (blockers.some((blocker: any) => blocker.status !== TASK_STATUSES.done)) {
      desiredStatus = TASK_STATUSES.blocked;
      blockedReason = "waiting_on_dependencies";
    } else {
      desiredStatus = TASK_STATUSES.pending;
    }

    if (task.status !== desiredStatus || (task.blockedReason || "") !== blockedReason) {
      const update: Record<string, any> = {
        status: desiredStatus,
        blockedReason,
      };
      if (desiredStatus === TASK_STATUSES.pending) {
        update.errorMessage = "";
      }

      await db.transact(
        db.tx.tasks[task.id].update(update)
      );
    }
  }
}

function buildDependencyContext(task: any): string {
  const deps = (task.dependencies || [])
    .map((edge: any) => edge.dependsOn)
    .filter(Boolean);

  if (deps.length === 0) return "";

  const completedDeps = deps.filter(
    (dep: any) => dep.status === TASK_STATUSES.done && dep.result
  );

  if (completedDeps.length === 0) return "";

  const sections = completedDeps.map((dep: any) => {
    const title = dep.summary || dep.input;
    return `### ${title}\n\n${dep.result}`;
  });

  return `# Results from prerequisite tasks\n\nThe following tasks were completed before this one. Use their results as context.\n\n${sections.join("\n\n")}`;
}

async function handleTask(taskId: string) {
  const lessons = existsSync(LESSONS_PATH)
    ? readFileSync(LESSONS_PATH, "utf-8")
    : "";
  const systemPromptMd = existsSync(SYSTEM_PROMPT_PATH)
    ? readFileSync(SYSTEM_PROMPT_PATH, "utf-8")
    : "";

  const resp = await db.query({
    tasks: {
      $: { where: { id: taskId } },
      messages: {},
      project: {},
      note: {},
      dependencies: { dependsOn: {} },
    },
  } as any);

  const task = resp.tasks[0] as any;
  if (!task) return;

  const resumeSessionId = getResumeSessionId(task);
  const isFollowUp = Boolean(resumeSessionId && hasUnreadUserMessages(task));

  let prompt: string;
  if (isFollowUp) {
    prompt = buildFollowUpPrompt(task);
  } else {
    const depContext = buildDependencyContext(task);
    prompt = depContext ? `${depContext}\n\n---\n\n${task.input}` : task.input;
  }

  await db.transact(
    db.tx.tasks[taskId].update({
      status: TASK_STATUSES.running,
      startedAt: Date.now(),
      cancelRequested: false,
      blockedReason: "",
      errorMessage: "",
      liveOutput: "",
    })
  );

  const abortController = new AbortController();
  const cancelInterval = setInterval(async () => {
    try {
      const r = await db.query({ tasks: { $: { where: { id: taskId } } } });
      // typed as any to tolerate new reverse-link schema additions
      if ((r.tasks[0] as any)?.cancelRequested) {
        abortController.abort();
      }
    } catch {}
  }, CANCEL_POLL_MS);

  const timeoutHandle = setTimeout(() => {
    abortController.abort();
  }, TASK_TIMEOUT_MS);

  const appendText = [
    systemPromptMd,
    lessons ? `\n\n# Learned Preferences\n\n${lessons}` : "",
  ].filter(Boolean).join("\n\n");

  const queryOptions: Record<string, unknown> = {
    cwd: getProjectsRoot(),
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

  if (resumeSessionId) {
    queryOptions.resume = resumeSessionId;
  }

  let activePrompt = prompt;
  let q = query({ prompt: activePrompt, options: queryOptions as any });
  let sessionId: string | undefined = resumeSessionId;
  let lastLiveOutputTime = 0;
  const activityItems: {
    type: "tool" | "text" | "thinking";
    name?: string;
    detail?: string;
    content?: string;
    ts: number;
  }[] = [];

  function addActivity(item: (typeof activityItems)[0]) {
    activityItems.push(item);
    if (activityItems.length > 15) {
      activityItems.splice(0, activityItems.length - 15);
    }
  }

  async function flushLiveOutput() {
    const now = Date.now();
    if (now - lastLiveOutputTime < LIVE_OUTPUT_THROTTLE_MS || activityItems.length === 0) {
      return;
    }

    lastLiveOutputTime = now;
    await db.transact(
      db.tx.tasks[taskId].update({
        liveOutput: JSON.stringify(activityItems),
      })
    );
  }

  async function runQuery() {
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
            const firstLine = block.thinking.split("\n")[0].trim();
            if (firstLine) {
              addActivity({
                type: "thinking",
                content: truncStr(firstLine, 120),
                ts: Date.now(),
              });
            }
          } else if (block.type === "text" && block.text) {
            const lines = block.text.trim().split("\n");
            const lastLine = lines[lines.length - 1]?.trim();
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
        const resultMessage = message as SDKResultMessage;
        const success = resultMessage.subtype === "success";
        const resultText = success ? resultMessage.result || "" : "";
        const errors = success ? [] : resultMessage.errors || [];

        // If the error is about oversized images, throw so the catch block
        // can attempt compaction / fallback instead of marking the task failed.
        if (!success && errors.some((e: string) =>
          /image.*exceeds.*dimension|dimension.*limit|exceeds.*2000|image.*2000/i.test(e)
        )) {
          throw new Error(errors.join("\n"));
        }

        if (resultText) {
          await db.transact(
            db.tx.messages[id()]
              .create({
                role: "assistant",
                content: resultText,
                createdAt: Date.now(),
              })
              .link({ task: taskId })
          );
        }

        const updated = await db.query({
          tasks: { $: { where: { id: taskId } }, messages: {}, project: {} },
        } as any);
        const updatedTask = updated.tasks[0] as any;
        const messages = [...(updatedTask?.messages || [])].sort(
          (a: any, b: any) => b.createdAt - a.createdAt
        );
        const latestMessageId = messages[0]?.id || "";

        const taskUpdate = db.tx.tasks[taskId].update({
          status: success ? TASK_STATUSES.done : TASK_STATUSES.failed,
          result: resultText,
          ...(updatedTask?.project ? {} : { sessionId: sessionId || "" }),
          liveOutput: "",
          blockedReason: "",
          errorMessage: success ? "" : (errors.join("\n") || "Unknown error"),
          completedAt: Date.now(),
          lastSeenMessageId: latestMessageId,
          read: false,
        });

        const txs: any[] = [taskUpdate];
        if (updatedTask?.project?.id && sessionId) {
          txs.push(db.tx.projects[updatedTask.project.id].update({ sessionId }));
        } else if (sessionId) {
          txs.push(db.tx.tasks[taskId].update({ sessionId }));
        }

        await db.transact(txs);
      }
    }
  }

  try {
    await runQuery();
  } catch (error: any) {
    // Session has oversized images — try compacting the session to strip them,
    // then retry. If /compact itself fails, fall back to a fresh session with
    // text-only context from stored messages.
    if (
      resumeSessionId &&
      /image.*exceeds.*dimension|dimension.*limit|exceeds.*2000|image.*2000/i.test(error.message || "")
    ) {
      console.log(`Task ${taskId}: session has oversized images, attempting /compact`);
      try {
        const compactQuery = query({
          prompt: "/compact",
          options: { ...queryOptions, maxTurns: 1 } as any,
        });
        for await (const msg of compactQuery) {
          if ("session_id" in msg && msg.session_id) sessionId = msg.session_id;
        }
        console.log(`Task ${taskId}: compaction succeeded, retrying with compacted session`);
        q = query({ prompt: activePrompt, options: { ...queryOptions, resume: sessionId } as any });
        await runQuery();
      } catch {
        // /compact hit the same image error — fall back to text-only context
        console.log(`Task ${taskId}: compaction also failed, retrying with text context`);
        const allMessages = [...(task.messages || [])].sort((a: any, b: any) => a.createdAt - b.createdAt);
        const thread = allMessages.map((m: any) => `**${m.role}**: ${m.content}`).join("\n\n");
        const contextParts = [
          `# Original Task\n\n${task.input}`,
          thread && `# Conversation History\n\n${thread}`,
          task.result && `# Last Result\n\n${task.result}`,
          `# New Request\n\n${activePrompt}`,
        ].filter(Boolean);
        const freshPrompt = contextParts.join("\n\n---\n\n");
        delete queryOptions.resume;
        sessionId = undefined;
        q = query({ prompt: freshPrompt, options: queryOptions as any });
        await runQuery();
      }
    } else if (error.name === "AbortError" || abortController.signal.aborted) {
      const r = await db.query({ tasks: { $: { where: { id: taskId } }, messages: {}, project: {} } });
      // typed as any to tolerate new reverse-link schema additions
      const currentTask = r.tasks[0] as any;
      const wasCancelled = currentTask?.cancelRequested;
      const messages = [...(currentTask?.messages || [])].sort(
        (a: any, b: any) => b.createdAt - a.createdAt
      );
      const latestMessageId = messages[0]?.id || "";
      const txs: any[] = [
        db.tx.tasks[taskId].update({
          status: wasCancelled ? TASK_STATUSES.cancelled : TASK_STATUSES.failed,
          errorMessage: wasCancelled ? "Cancelled by user" : "Task timed out",
          liveOutput: "",
          blockedReason: "",
          completedAt: Date.now(),
          lastSeenMessageId: latestMessageId,
          ...(currentTask?.project ? {} : { sessionId: sessionId || "" }),
        }),
      ];

      if (currentTask?.project?.id && sessionId) {
        txs.push(db.tx.projects[currentTask.project.id].update({ sessionId }));
      }

      await db.transact(txs);
    } else {
      throw error;
    }
  } finally {
    clearInterval(cancelInterval);
    clearTimeout(timeoutHandle);
  }
}

function launchTask(task: any) {
  const projectSlug = getProjectSlug(task);
  runningTasks.add(task.id);
  if (projectSlug) projectLocks.add(projectSlug);

  handleTask(task.id)
    .catch(async (error: any) => {
      console.error(`Task ${task.id} failed:`, error.message);
      await db.transact(
        db.tx.tasks[task.id].update({
          status: TASK_STATUSES.failed,
          errorMessage: error.message,
          completedAt: Date.now(),
        })
      );
    })
    .finally(() => {
      runningTasks.delete(task.id);
      if (projectSlug) projectLocks.delete(projectSlug);
      void dispatchRunnableTasks();
    });
}

async function dispatchRunnableTasks() {
  if (dispatchInProgress) return;
  dispatchInProgress = true;

  try {
    await reconcileTaskDependencies();

    while (runningTasks.size < MAX_CONCURRENT_TASKS) {
      const resp = await db.query({
        tasks: {
          $: { where: { status: TASK_STATUSES.pending }, order: { createdAt: "asc" } },
          project: {},
        },
      } as any);

      let launched = false;

      for (const task of resp.tasks as any[]) {
        if (runningTasks.has(task.id)) continue;

        const projectSlug = getProjectSlug(task);
        if (projectSlug && projectLocks.has(projectSlug)) continue;

        if (task.cancelRequested) {
          await db.transact(
            db.tx.tasks[task.id].update({
              status: TASK_STATUSES.cancelled,
              errorMessage: "Cancelled by user",
              completedAt: Date.now(),
              blockedReason: "",
            })
          );
          continue;
        }

        launchTask(task);
        launched = true;
        if (runningTasks.size >= MAX_CONCURRENT_TASKS) break;
      }

      if (!launched) break;
    }
  } catch (error: any) {
    console.error("Task dispatch error:", error.message);
  } finally {
    dispatchInProgress = false;
  }
}

async function pollForFollowUps() {
  try {
    const resp = await db.query({
      tasks: {
        $: {
          where: {
            or: [
              { status: TASK_STATUSES.done },
              { status: TASK_STATUSES.failed },
              { status: TASK_STATUSES.cancelled },
            ],
          },
        },
        messages: {},
        project: {},
      },
    } as any);

    for (const task of resp.tasks as any[]) {
      if (task.cancelRequested) continue;
      if (!getResumeSessionId(task)) continue;
      if (!hasUnreadUserMessages(task)) continue;
      if (runningTasks.has(task.id)) continue;

      await db.transact(
        db.tx.tasks[task.id].update({
          status: TASK_STATUSES.pending,
          cancelRequested: false,
          blockedReason: "",
          errorMessage: "",
        })
      );
    }

    await dispatchRunnableTasks();
  } catch (error: any) {
    console.error("Follow-up poll error:", error.message);
  }
}

async function recoverStaleTasks() {
  try {
    const resp = await db.query({
      tasks: { $: { where: { status: TASK_STATUSES.running } } },
    } as any);

    for (const task of resp.tasks as any[]) {
      await db.transact(
        db.tx.tasks[task.id].update({
          status: TASK_STATUSES.pending,
          liveOutput: "",
          blockedReason: "",
        })
      );
    }
  } catch (error: any) {
    console.error("Recovery error:", error.message);
  }
}

async function getDictionaryTerms(): Promise<string[]> {
  const { dictionaryTerms } = await db.query({ dictionaryTerms: {} });
  return (dictionaryTerms || []).map((t: any) => t.term);
}

async function main() {
  if (!acquirePidLock()) process.exit(1);

  process.on("exit", releasePidLock);
  process.on("SIGINT", () => {
    releasePidLock();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    releasePidLock();
    process.exit(0);
  });

  console.log(`Exec agent started (PID ${process.pid}).`);

  await migrateLegacyTasksToNotes(db);
  await recoverStaleTasks();
  await pollPendingNotes();
  await pollForFollowUps();
  await dispatchRunnableTasks();

  setInterval(() => void pollPendingNotes(), NOTE_POLL_MS);
  setInterval(() => void pollForFollowUps(), FOLLOW_UP_POLL_MS);
  setInterval(() => void dispatchRunnableTasks(), TASK_POLL_MS);

  console.log("Listening for notes and tasks...");
}

main().catch((error) => {
  console.error("Fatal:", error);
  releasePidLock();
  process.exit(1);
});
