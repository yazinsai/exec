# Voice Listener

Two-worker system for processing voice transcriptions into executable actions.

## Prompts

All prompts are in `prompts/*.md` files with `{{VARIABLE}}` placeholders:

- `prompts/extraction.md` - Extract actions from voice transcriptions
- `prompts/extraction-images.md` - Extract actions from transcriptions + screenshots
- `prompts/execution.md` - Execute an action with Claude Code

To iterate on prompts, edit the `.md` files directly.

**Version tracking includes:**
- `prompts/*.md` - Prompt templates
- `workspace/CLAUDE.md` - Action type definitions
- `workspace/projects/CLAUDE.md` - Project-specific lessons

Changes to any of these files create a new prompt version for analytics.

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

- `CodeChange`: Changes to existing code (subtype: bug|feature|refactor). Requires projectPath.
- `Project`: New standalone projects/ideas. Creates new directory in workspace/projects/.
- `Research`: Questions needing investigation or analysis.
- `Write`: Content creation - posts, docs, articles, emails.
- `UserTask`: Tasks requiring human action (has task, why_user, prep_allowed, remind_at fields).

## Recovery

Both workers recover orphaned items on startup:
- Extractor: Recordings stuck in "processing" for >10 min
- Executor: ALL actions in "in_progress" state (since they're orphaned when worker restarts)

Use `--skip-recovery` flag to disable recovery on startup if needed.
