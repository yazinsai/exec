# Spec: Triage & Project-Scoped Threads

## Context

The current system maps 1 voice command → 1 task → 1 agent session. This has two problems:

1. **A single voice recording can contain multiple actions** ("Fix the bug in exec, then research pricing for the SaaS cloner, and draft a tweet about the new feature"). Currently this creates one task and the agent has to figure it out inline.

2. **There's no continuity across tasks for the same project.** If you say "build me a landing page" and later "add a pricing section," the second task starts a fresh session with no context about the first.

## Design

### New Flow

```
Voice input → Transcription → Triage → 0..N Tasks (project-scoped)
                                 │
                                 ├─ "Fix the login bug in exec"     → exec thread (resumes session)
                                 ├─ "Research pricing for cloner"   → saas-cloner thread (new)
                                 └─ "Draft a tweet about the launch"→ general (standalone, no session)
```

### Three-Phase Pipeline

**Phase 1: Capture** (unchanged)
- Phone or desktop records voice → transcribes via Groq → creates an `input` record in InstantDB

**Phase 2: Triage** (new)
- Agent reads the raw transcription
- Lightweight LLM call (Sonnet) to extract discrete actions
- For each action: identify which project it relates to, or mark as standalone
- **Triage rewrites each action to be self-contained** — resolves pronouns and references so each task makes sense independently (e.g. "deploy it" → "Deploy the exec project to dokku")
- If multiple actions target the same project and have sequential dependencies, triage assigns a `sequenceIndex` so they execute in order
- Creates one `task` per action, linked to the `input` and to a `project` (if applicable)
- Triage status transitions: `pending → triaging → triaged | empty | failed`. On crash during `triaging`, the raw LLM output is persisted on the input record (`triageResult` field) so retries replay the same parsed output rather than re-calling the LLM. All task creation + input status update happen in a single `db.transact()` call for atomicity.

**Phase 3: Execution** (mostly unchanged)
- Agent picks up pending tasks from the FIFO queue
- **One task per project at a time** — if a task's project already has a running task, it stays queued
- If the task's project has a `sessionId`, the agent **resumes** that session
- This gives the agent full context of everything previously done for that project
- On completion, the project's `sessionId` is updated

### Data Model Changes

**New entity: `inputs`** (raw voice transcriptions)
```
inputs
  text        string        # Transcribed text
  source      string        # "phone" | "mac"
  status      string        # "pending" | "triaging" | "triaged" | "empty" | "failed"
  triageResult string?      # Raw JSON from triage LLM call (persisted for idempotent retry)
  errorMessage string?      # If triage failed
  createdAt   number        # indexed
```

**New entity: `projects`** (long-lived threads)
```
projects
  name        string        # indexed, unique — e.g. "exec", "saas-cloner"
  path        string?       # e.g. "~/ai/projects/exec" (null until directory created)
  sessionId   string?       # Claude Agent SDK session ID (for resuming)
  summary     string?       # Periodically updated summary of project state (for session rotation)
  createdAt   number        # indexed
```

**Modified entity: `tasks`** — add project link, add sequenceIndex, keep sessionId for standalone tasks
```
tasks
  input       string        # The self-contained action (rewritten by triage)
  rawInput    string?       # Original slice from transcription (for provenance/audit)
  status      string        # pending | running | done | failed | cancelled
  result      string?
  sessionId   string?       # For standalone tasks (no project). Project tasks use project.sessionId
  sequenceIndex  number?    # Order within same input, for dependent tasks
  liveOutput  string?
  cancelRequested  boolean?
  errorMessage  string?
  createdAt   number
  startedAt   number?
  completedAt number?
```

Note: `source` removed from tasks — it lives on `inputs` (the authoritative source). Tasks inherit it via the `inputTasks` link.

**Messages stay task-scoped** (simpler than project-scoped). Each task has its own messages thread. Project continuity comes from session resume, not from a shared message thread. This avoids the attribution problem of figuring out which messages belong to which task in a shared thread.

**New links:**
- `inputTasks` — input has many tasks, task has one input
- `projectTasks` — project has many tasks, task has **optional** one project (standalone tasks have no project)
- `taskMessages` — task has many messages, message has one task (unchanged)

### Triage Implementation

The triage step is a lightweight API call, NOT a full Agent SDK session:

```typescript
const response = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 1024,
  system: `You extract discrete actions from voice transcriptions.

For each action, return:
- action: a self-contained description of what needs to be done. Resolve all pronouns
  and references so this makes sense without seeing the original transcription.
  Bad: "deploy it". Good: "Deploy the exec project to dokku".
- project: which project this relates to (directory name from the project index below),
  or null if it's a standalone task (research, writing, general question).
- sequenceIndex: order of execution (0-based). Tasks for the same project with
  sequential dependencies should have increasing indices.
- newProject: if this requires creating a new project, set to true and provide
  a suggested directory name in the project field.

Respond as JSON array. If the transcription contains nothing actionable, return [].

## Project Index
${projectIndex}`,
  messages: [{ role: "user", content: transcription }],
});
```

**Project resolution for follow-ups**: The triage prompt includes:
- The project index (names + one-line descriptions only, not full details — scales to hundreds of projects)
- Recently active projects (last 5 with tasks in the past 7 days, plus their latest task summary)

This gives the LLM context to match "add a pricing section" to the landing page project even when the user doesn't name it explicitly. If genuinely ambiguous, triage creates the task as standalone (no project) — the agent can ask the user for clarification during execution and link it to a project afterward. This is safer than guessing wrong and sending destructive work to the wrong repo.

**New project creation**: When triage identifies a request for a new project (e.g. "build me a habit tracker"), it sets `newProject: true`. The triage step immediately creates the `projects` record (with `path: null`) so tasks from the same input can link to it. Name is slugified and checked for uniqueness — collisions get a numeric suffix (e.g. `landing-page-2`). During execution, the agent creates the actual directory and updates the path. The project is also added to `INDEX.md`.

### Project Session Continuity

When the agent executes a task:
1. Look up the task's project (if any — standalone tasks have no project)
2. If the project has a `sessionId`, pass `resume: sessionId` to the Agent SDK
3. The agent gets full context of all previous work on that project
4. After completion, update the project's `sessionId`

**Session rotation**: Sessions will eventually grow too large. When a session resume fails (context limit, stale session, SDK error), the agent:
1. Reads the project's `summary` field (a condensed history)
2. Starts a fresh session with the summary injected into the system prompt
3. Saves the new `sessionId` on the project

**Summary updates**: After each task completes, the agent appends a one-line summary to the project's `summary` field (e.g. "Built landing page with React + Tailwind, deployed to landing.whhite.com"). This is lightweight — just an append, not a rewrite. If the summary exceeds ~2000 chars, it's compressed via an LLM call to keep the essential context.

**Continuity is best-effort**: Session resume gives rich context when available but sessions will eventually expire or hit limits. The summary is a safety net, not a perfect reconstruction. This is acceptable — the agent can always read the project's actual code and git history for ground truth. The summary just saves it from starting cold.

### Standalone Tasks (No Project)

Tasks not tied to a project (research, writing, general questions) have no project link. They:
- Start fresh sessions every time (no resume)
- Store their own `sessionId` on the task (not on a project)
- Have their own task-scoped message thread
- **Follow-ups on standalone tasks** inject the parent task's result and messages into the new session's prompt, since there's no project session to resume

This avoids the "general" project problem entirely — there's no shared bucket. Standalone tasks are just tasks without a project.

### Execution Ordering

**Within a project**: One task at a time, ordered by `createdAt` then `sequenceIndex`. If multiple tasks target the same project, they queue behind the currently running one. This handles "fix the bug, then deploy it."

**Dependency failure**: If a task in a sequence fails or is cancelled, subsequent tasks from the same input with higher `sequenceIndex` are auto-cancelled (since they likely depend on the failed task). Tasks from other inputs for the same project are unaffected.

**Across projects**: Tasks for different projects can run concurrently. A standalone task and a project task can run at the same time.

**Scheduler**: The agent scans all pending tasks. For each, check if its project (if any) has a running task — if so, skip it. Pick the oldest non-blocked task. This is FIFO with project-level exclusion, not strict FIFO.

**Cross-project dependencies**: Not supported. Triage rewrites each task to be self-contained.

### Mobile App Changes

- Keep the flat task list (unchanged)
- Each task row now optionally shows a project badge/label
- Tap a task → same detail view (task-scoped messages, result, follow-up)
- **Follow-up from detail view**: creates a new task on the same project (if the task has a project). This new task gets the project's session continuity. If the task is standalone, the follow-up creates a new standalone task.
- No new screens needed

### Agent Process Changes

1. **New poll: inputs** — watch for `inputs` with `status: "pending"`, set to `triaging`, run triage, set to `triaged` or `empty`
2. **Modified poll: tasks** — same FIFO, but skip tasks whose project already has a running task
3. **Session resume** — look up project's sessionId instead of task's sessionId
4. **Session rotation** — fall back to summary if resume fails
5. **Summary maintenance** — append one-liner after each task completes

### What This Enables

- "Fix the login bug in exec, deploy it, and then write a tweet about it" → 3 tasks: 2 sequential on exec project (fix → deploy), 1 standalone (tweet)
- "Add dark mode to the landing page" (said days later) → resumes the landing page project session with full context of previous work
- "Never mind about the tweet" → cancel just that task, project tasks continue
- Voice recordings with no actionable content → triaged as "empty," nothing spawned
- "Build me a habit tracker" → new project created, directory allocated during execution

## Resolved Questions

1. **UI shows flat task list** (not inputs, not grouped). Same as current design. Tasks show optional project badge.
2. **No "general" project** — standalone tasks have no project link and start fresh.
3. **Project creation** — triage flags `newProject: true`, agent creates directory during execution, updates INDEX.md.
4. **Messages stay task-scoped** — project continuity comes from session resume, not shared threads.
5. **Task text is self-contained** — triage rewrites pronouns/references so each task is independently understandable.
6. **One task per project at a time** — sequential within a project, parallel across projects.
7. **Session rotation** — when sessions get too large, fall back to project summary + fresh session.
