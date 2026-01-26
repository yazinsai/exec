# Voice Listener

Two-worker system for processing voice transcriptions into executable actions.

## Architecture

```
┌─────────────────┐     ┌─────────────┐     ┌─────────────────┐
│  Recordings     │ ──► │  Extractor  │ ──► │    Actions      │
│  (transcribed)  │     │  Worker     │     │   (pending)     │
└─────────────────┘     └─────────────┘     └────────┬────────┘
                                                     │
                                                     ▼
                                            ┌─────────────────┐
                                            │    Executor     │
                                            │    Worker       │
                                            └────────┬────────┘
                                                     │
                                                     ▼
                                            ┌─────────────────┐
                                            │  Claude Code    │
                                            │  (implements)   │
                                            └─────────────────┘
```

**Extractor Worker** (`src/index.ts`):
- Polls for transcribed recordings
- Extracts and classifies actions using Claude
- Saves actions to InstantDB as "pending"

**Executor Worker** (`src/action-executor.ts`):
- Polls for pending actions
- Spawns Claude Code to implement each action
- Claude Code updates action with result, deployUrl, messages

## Running

```bash
# Start both workers (recommended)
./start.sh

# Or run individually:
bun run extract    # Extraction worker only
bun run execute    # Execution worker only

# One-shot mode (process once and exit)
./start.sh --once
```

## CLI Options

Both workers support:
- `--dry-run` - Preview without making changes
- `--once` - Process once and exit
- `--limit N` - Only process N items

```bash
# Test extraction
bun run src/index.ts --dry-run --once --limit 1

# Test execution
bun run src/action-executor.ts --dry-run --once --limit 1
```

## Action Types

- `bug`: Reports of bugs, issues, or things broken
- `feature`: Feature requests or enhancements
- `todo`: Tasks to complete, reminders
- `question`: Questions that need answers
- `command`: Direct commands to execute
- `idea`: Ideas for products/features

## Recovery

Both workers recover stale items on startup:
- Extractor: Recordings stuck in "processing" for >10 min
- Executor: Actions stuck in "in_progress" for >30 min
