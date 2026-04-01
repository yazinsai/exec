# Exec v2: Autonomous Agent System

## Context

The current exec system is over-engineered: 4 workers (extraction, execution, episodes, distillation), 5 structured action types, a rule learning pipeline with confidence scores, 10+ InstantDB entities, and a 70KB main component. It works, but it's prescriptive, complex, and requires internet for the Mac workers to poll InstantDB.

The rebuild strips all of that away. One persistent Claude agent with full Mac access, triggered by voice (phone or desktop hotkey). No action types, no extraction step, no pipelines. The agent receives natural language and decides what to do.

**Offline model**: Capture is offline-capable (phone queues voice recordings locally, syncs when online). Execution requires internet (Claude API + Groq transcription are remote services). This is "offline capture with later sync", not offline execution.

## Architecture

```
Phone (Expo)  ──→  InstantDB  ←──  Agent Process (Mac)  ←──  Desktop Hotkey App (Mac)
  voice input       sync layer      Claude Agent SDK          push-to-talk
  status view       single source   full Mac access           writes to InstantDB
  offline capture   of truth        FIFO task queue
```

**Single ingestion path**: Both phone and desktop write tasks to InstantDB. The agent subscribes to InstantDB as the sole source of truth. No local IPC, no dual-write races.

### Three Components

1. **Agent Process** — Bun process using `@anthropic-ai/claude-agent-sdk`. Subscribes to InstantDB for new tasks. Has full shell, filesystem, and browser access. Reads `~/ai/lessons.md` per task. Processes tasks one at a time (FIFO); the agent itself can parallelize internally via subagents when it decides to.

2. **Mobile App** — Simplified Expo app. Voice recorder + task status list. Two screens only. Records audio locally first, transcribes via Groq when online, then creates task in InstantDB.

3. **Desktop Hotkey App** — Background Electron app. Global hotkey triggers push-to-talk overlay. Record on press, stop on release. Transcribes via Groq, creates task in InstantDB.

## Data Model (InstantDB)

Two entities total (down from 10+):

### `tasks`
| Field | Type | Indexed | Description |
|-------|------|---------|-------------|
| `input` | string | no | Raw text (transcribed voice or typed) |
| `status` | string | yes | `pending` \| `running` \| `done` \| `failed` \| `cancelled` |
| `result` | string | no | Agent's output (markdown) |
| `source` | string | no | `phone` \| `mac` |
| `sessionId` | string? | no | Claude Agent SDK session ID (for resuming follow-ups) |
| `liveOutput` | string? | no | Streaming output while running (overwritten as agent works) |
| `cancelRequested` | boolean | no | Set true to request cancellation |
| `lastSeenMessageId` | string? | no | ID of the last message the agent processed (agent updates after handling follow-ups) |
| `errorMessage` | string? | no | If failed |
| `createdAt` | number | yes | Timestamp (used for FIFO ordering) |
| `startedAt` | number? | no | When agent began processing |
| `completedAt` | number? | no | Timestamp |

### `messages` (linked to task)
| Field | Type | Description |
|-------|------|-------------|
| `role` | string | `user` \| `assistant` |
| `content` | string | Message text |
| `createdAt` | number | Timestamp |

Links: `taskMessages` — task has many messages, message has one task (cascade delete).

**Auth**: Single-user system. The InstantDB app uses a hardcoded app ID. No multi-user auth needed. The phone app and desktop app both use the client SDK; the agent process uses the admin SDK.

## Agent Process

### Location
`~/ai/projects/exec/agent/`

### Core Loop (Pseudocode)

The agent process is a single Bun process. It uses a PID file (`/tmp/exec-agent.pid`) to ensure only one instance runs at a time.

```
On startup:
  1. Acquire PID lock (exit if another instance is running)
  2. Recover stale tasks: query tasks where status="running", reset to "pending"
  3. Subscribe to InstantDB for tasks where status="pending" (ordered by createdAt asc)
  4. Periodically reconcile: query tasks with messages newer than their lastSeenMessageId (for follow-ups)
  5. Start FIFO processing loop

FIFO loop:
  - Maintain an in-memory queue of task IDs (deduped)
  - Process one task at a time
  - On new pending tasks from subscription: add to queue (skip if already queued or in-flight)
  - On follow-up detected (messages newer than lastSeenMessageId): add task to queue for session resumption

handleTask(taskId):
  1. Read ~/ai/lessons.md (fresh per task)
  2. Set task status="running", startedAt=now
  3. Start Claude Agent SDK query with:
     - prompt: task.input (or follow-up messages if resuming)
     - systemPrompt: preset "claude_code" + appended context (lessons, user info)
     - tools: preset "claude_code"
     - permissionMode: "bypassPermissions"
     - resume: task.sessionId (if follow-up)
     - abortController: for cancellation
  4. Stream assistant messages → write to task.liveOutput (throttled: max once per 2 seconds to avoid write amplification)
  5. Capture sessionId from assistant messages → store on task
  6. Poll cancelRequested every 3s → abort if true
  7. On result: set status="done"/"failed", write result, clear liveOutput
  8. On abort/error: clear cancel poller, set status="cancelled"/"failed"
  9. Write assistant response to messages entity for thread history
  10. Task timeout: if running > 30 minutes, abort and mark failed

Cleanup on all exit paths:
  - Always clear the cancel polling interval
  - Always update task status (never leave stuck in "running")
```

### System Prompt

A single `system-prompt.md` file that includes:
- Who the user is (Yazin, builds projects in ~/ai/projects)
- Full Mac access — filesystem, shell, browser, git, everything
- Contents of `~/ai/lessons.md` (learned preferences)
- Instruction to update `~/ai/lessons.md` when learning something new (append-only, structured format)
- No prescribed action types — agent decides approach based on the request
- Access to all existing projects and notes

### Learning

`~/ai/lessons.md` — a single markdown file.

- **Re-read per task** so new lessons take effect immediately
- Agent appends to it when the user explicitly corrects it or expresses a preference
- Human-readable, manually editable
- No confidence scores, no distillation, no episodes

**Structure**:
```markdown
# Lessons

## Preferences
- [lesson]

## Patterns
- [lesson]

## Mistakes to Avoid
- [lesson]
```

**Rules for agent writes**:
- The agent may only append bullet points under existing sections
- It must not rewrite or remove existing entries
- It should only write when the user explicitly corrects it or states a preference — not from inference, web content, or transcription artifacts
- If the file exceeds ~200 lines, the agent flags it for manual pruning

### Concurrency

The process-level queue is **FIFO, one task at a time**. The agent itself can parallelize internally using Claude Code's subagent/worktree features when it decides to. This keeps the outer loop simple and predictable while giving the agent freedom for complex tasks.

**Timeout**: Tasks are aborted after 30 minutes to prevent queue starvation. The agent is informed of the time limit in its system prompt.

### Cancellation

Tasks have a `cancelRequested` boolean. The agent polls this every 3 seconds and aborts via `AbortController` if set. The phone and desktop UIs expose a cancel button that sets this flag. Cancel polling is always cleaned up on task completion, abort, or error.

### Follow-up Conversations

When the user sends a follow-up message on a task:
1. App creates a message in `messages` linked to the task
2. Agent periodically queries tasks that have messages newer than `lastSeenMessageId`
3. When the task is processed, agent updates `lastSeenMessageId` to the latest message ID
4. Agent resumes the session using `resume: task.sessionId`
5. Agent writes its response to `messages` (role: "assistant")
6. The task detail UI renders the full thread from `messages`

This uses a monotonic cursor instead of a boolean — multiple follow-ups can't be lost.

**Initial message**: When a task is created, the first `input` text is also written as the first message (role: "user") in the `messages` entity. This ensures the thread view is complete without special-casing the first turn.

## Mobile App

### Screens

**Home (single screen with bottom sheet for details):**

- **Top**: Minimal header
- **Center**: Large record button (push-to-talk)
- **Below**: Flat list of recent tasks
  - Each row: task input text (truncated), status dot (blue/green/red), relative time
  - Tap → bottom sheet with full details

**Task Detail (bottom sheet):**
- Input text
- Live output while running (from `liveOutput` field)
- Result (rendered markdown) when done
- Message thread (chat bubbles) from `messages` entity
- Text input for follow-up (creates message + sets `hasNewMessage`)
- Cancel button (sets `cancelRequested`)

**No tabs.** No settings. No ratings. No vocabulary.

### Tech Stack
- Expo/React Native (reuse existing project structure)
- InstantDB for data (`@instantdb/react-native`)
- Groq for transcription (requires internet; audio is saved locally first)
- NativeWind for styling

### Offline Behavior
- Voice recordings saved to local filesystem (Expo FileSystem) with metadata (timestamp, duration)
- When online: transcribe via Groq → create task in InstantDB
- When offline: audio queued locally in AsyncStorage with metadata for retry
- On app restart or connectivity change: process the local queue (transcribe + sync)
- UI shows "recorded, waiting to sync" state for queued items
- InstantDB's built-in offline cache keeps the task list visible without internet

## Desktop Hotkey App

### Behavior
1. App runs in background on login (menubar icon optional)
2. Global hotkey registered (e.g. `Cmd+Shift+Space`)
3. On keydown: small floating overlay appears, recording starts
4. On keyup: recording stops, overlay shows "Transcribing..."
5. Transcription via Groq API
6. Task created in InstantDB with `source: "mac"`
7. Overlay shows "Got it" briefly, then dismisses

### Implementation
Electron app with:
- `globalShortcut.register()` for the hotkey
- `BrowserWindow` with `alwaysOnTop`, `transparent`, `frame: false` for the overlay
- Web Audio API for recording
- Groq API for transcription
- Writes task directly to InstantDB (same client SDK as phone)
- **macOS permissions**: microphone access (Electron dialog on first use), accessibility for global shortcut (System Settings prompt)

### Process Supervision
The agent process and desktop app are managed via `launchd` plist files for auto-start on login:
- `~/Library/LaunchAgents/com.exec.agent.plist` — agent process
- `~/Library/LaunchAgents/com.exec.desktop.plist` — Electron hotkey app

### Optional: Status Indicator
Menubar tray icon that changes color when agent is working (subscribes to InstantDB for running tasks). Click to see task list. Low priority — phone app covers this.

## What Gets Cut

| Current | v2 |
|---------|----|
| 4 workers (extraction, execution, episodes, distillation) | 1 agent process |
| 5 action types (CodeChange, Project, Research, Write, UserTask) | Natural language, agent decides |
| Extraction step (transcription → structured actions) | Eliminated |
| Scope analyzer (simple vs complex heuristics) | Agent decides |
| Episode/distillation pipeline | Single lessons.md |
| Rule system (confidence, conflicts, categories) | Gone |
| Prompt versioning (hash tracking, analytics) | Gone |
| Dependency chains (sequenceIndex, dependsOnIndex) | Agent decides ordering |
| Rating system (1-5 stars + episodes) | Follow-up messages |
| 9 prompt template files | 1 system prompt |
| 10+ InstantDB entities | 2 entities |
| 70KB index.tsx with 5 tabs | 1 screen + bottom sheet |
| Worker heartbeats | Gone |
| Vocabulary terms | Gone |

## File Structure

```
~/ai/projects/exec/
├── agent/
│   ├── index.ts              # Agent process entry point
│   ├── system-prompt.md      # Single system prompt
│   └── package.json
├── app/                      # Expo app (simplified)
│   ├── index.tsx             # Home screen (recorder + task list)
│   └── _layout.tsx           # Router layout
├── components/
│   ├── RecordButton.tsx      # Push-to-talk button
│   ├── TaskList.tsx          # Flat list of tasks
│   └── TaskDetail.tsx        # Bottom sheet with result + thread
├── desktop/                  # Hotkey app
│   ├── main.ts               # Electron main process
│   ├── overlay.html           # Recording overlay UI
│   └── package.json
├── instant.schema.ts         # 2 entities
├── lib/
│   └── db.ts                 # InstantDB client init
└── package.json
~/ai/lessons.md               # Learned preferences (single file)
```

## Verification Plan

1. **Agent process**: Start agent, create a task in InstantDB manually, verify it picks it up and executes
2. **Mobile app**: Record voice, verify transcription, verify task appears in list, verify status updates in real-time
3. **Desktop hotkey**: Press hotkey, speak, verify task is created, verify agent picks it up
4. **Follow-up**: Send a follow-up message on a completed task, verify agent resumes and responds
5. **Cancellation**: Start a long task, cancel it, verify it aborts and status updates
6. **Crash recovery**: Kill agent mid-task, restart, verify running tasks are reset to pending
7. **Learning**: Correct agent behavior, verify it appends to lessons.md (and doesn't overwrite)
8. **Offline**: Turn off wifi, record on phone, verify it queues locally and syncs when back online

## Implementation Order

1. **Schema** — new instant.schema.ts with 2 entities, push to InstantDB
2. **Agent process** — core loop, InstantDB subscription, Claude Agent SDK integration, PID lock, crash recovery
3. **Mobile app** — gut and rebuild (recorder + task list + detail sheet + offline queue)
4. **Desktop hotkey app** — Electron app with global shortcut, recording, and transcription
5. **System prompt + learning** — write system-prompt.md, seed ~/ai/lessons.md
6. **Process supervision** — launchd plists for auto-start
