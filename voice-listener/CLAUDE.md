# Voice Listener

This project listens to InstantDB for new voice transcriptions and processes them with Claude to extract actionable items.

## Running

```bash
bun install
bun run start
```

## CLI Options

```bash
# Test with one recording (dry run - no DB changes)
bun run src/index.ts --dry-run --once --limit 1

# Process 5 recordings and exit
bun run src/index.ts --once --limit 5

# Run continuously (production mode)
bun run src/index.ts
```

- `--dry-run` - Extract actions but don't save to database
- `--once` - Process once and exit (don't poll continuously)
- `--limit N` - Only process N recordings

## Architecture

1. **Subscription**: Listens for recordings with `status: "transcribed"` or `status: "sent"` and no `processingStatus`
2. **Claim**: Sets `processingStatus: "processing"` to prevent duplicate processing
3. **Process**: Spawns Claude CLI to extract actions from transcription
4. **Save**: Writes extracted actions to InstantDB with links to the recording
5. **Complete**: Marks recording as `processingStatus: "processed"`

## Action Types

- `bug`: Reports of bugs, issues, or things broken
- `feature`: Feature requests or enhancements
- `todo`: Tasks to complete, reminders
- `note`: General notes or observations
- `question`: Questions that need answers
- `command`: Direct commands to execute
- `idea`: Ideas for products/features

## Recovery

On startup, any recordings stuck in `processingStatus: "processing"` for more than 10 minutes are reset to allow reprocessing.
