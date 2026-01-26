import { db, id } from "./db";
import { processTranscription, type ExtractedAction } from "./processor";
import { processIdea, queryPendingIdeas } from "./idea-processor";

interface Recording {
  id: string;
  transcription?: string;
  status: string;
  processingStatus?: string;
  processingStartedAt?: number;
}

const STALE_THRESHOLD = 10 * 60 * 1000; // 10 minutes
const POLL_INTERVAL = 5000; // 5 seconds

// CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const ONCE = args.includes("--once");
const IDEAS_MODE = args.includes("--ideas");
const NO_LONGRUN = args.includes("--no-longrun");
const LIMIT = (() => {
  const idx = args.indexOf("--limit");
  if (idx !== -1 && args[idx + 1]) {
    return parseInt(args[idx + 1], 10);
  }
  return Infinity;
})();

async function recoverStaleRecordings(): Promise<void> {
  const now = Date.now();
  const result = await db.query({
    recordings: {
      $: {
        where: {
          processingStatus: "processing",
        },
      },
    },
  });

  const stale = (result.recordings as Recording[]).filter(
    (r) => r.processingStartedAt && now - r.processingStartedAt > STALE_THRESHOLD
  );

  if (stale.length > 0) {
    console.log(`Recovering ${stale.length} stale recordings...`);
    const txs = stale.map((r) =>
      db.tx.recordings[r.id].update({
        processingStatus: null,
        processingStartedAt: null,
      })
    );
    await db.transact(txs);
  }
}

async function claimRecording(recordingId: string): Promise<boolean> {
  try {
    await db.transact(
      db.tx.recordings[recordingId].update({
        processingStatus: "processing",
        processingStartedAt: Date.now(),
      })
    );
    return true;
  } catch (error) {
    console.error(`Failed to claim recording ${recordingId}:`, error);
    return false;
  }
}

async function markProcessed(recordingId: string): Promise<void> {
  await db.transact(
    db.tx.recordings[recordingId].update({
      processingStatus: "processed",
      processingCompletedAt: Date.now(),
      processingError: null,
    })
  );
}

async function markFailed(recordingId: string, error: string): Promise<void> {
  await db.transact(
    db.tx.recordings[recordingId].update({
      processingStatus: "failed",
      processingCompletedAt: Date.now(),
      processingError: error,
    })
  );
}

async function saveActions(recordingId: string, actions: ExtractedAction[]): Promise<void> {
  if (actions.length === 0) return;

  const now = Date.now();
  const txs = actions.map((action, index) => {
    const actionId = id();
    const syncToken = `${recordingId}:${index}`;

    return db.tx.actions[actionId]
      .update({
        type: action.type,
        title: action.title,
        description: action.description ?? null,
        status: "pending",
        extractedAt: now,
        syncToken,
        projectPath: action.projectPath ?? null,
      })
      .link({ recording: recordingId });
  });

  await db.transact(txs);
}

async function processRecording(recording: Recording): Promise<void> {
  const { id: recordingId, transcription } = recording;

  if (!transcription) {
    console.log(`Recording ${recordingId} has no transcription, skipping`);
    return;
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Processing recording ${recordingId}`);
  console.log(`Transcription: "${transcription.slice(0, 200)}${transcription.length > 200 ? "..." : ""}"`);
  console.log("=".repeat(60));

  if (!DRY_RUN) {
    // Claim the recording
    const claimed = await claimRecording(recordingId);
    if (!claimed) {
      console.log(`Failed to claim recording ${recordingId}, skipping`);
      return;
    }
  }

  // Process with Claude
  const result = await processTranscription(transcription);

  if (!result.success) {
    console.error(`Failed to process recording ${recordingId}:`, result.error);
    if (!DRY_RUN) {
      await markFailed(recordingId, result.error ?? "Unknown error");
    }
    return;
  }

  console.log(`\nExtracted ${result.actions.length} actions:`);
  for (const action of result.actions) {
    console.log(`  [${action.type.toUpperCase()}] ${action.title}`);
    if (action.description) {
      console.log(`           ${action.description}`);
    }
  }

  if (DRY_RUN) {
    console.log(`\n[DRY RUN] Would save ${result.actions.length} actions (skipped)`);
    return;
  }

  // Save actions
  try {
    await saveActions(recordingId, result.actions);
    await markProcessed(recordingId);
    console.log(`\nSuccessfully saved actions for recording ${recordingId}`);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`Failed to save actions for ${recordingId}:`, errMsg);
    await markFailed(recordingId, errMsg);
  }
}

async function pollForRecordings(): Promise<number> {
  try {
    const result = await db.query({
      recordings: {
        $: {
          where: {
            or: [{ status: "transcribed" }, { status: "sent" }],
          },
        },
      },
    });

    const recordings = (result.recordings ?? []) as Recording[];

    // Filter to unprocessed recordings (no processingStatus set)
    let unprocessed = recordings.filter(
      (r) => !r.processingStatus && r.transcription
    );

    if (unprocessed.length === 0) {
      return 0;
    }

    console.log(`Found ${unprocessed.length} unprocessed recordings`);

    // Apply limit
    if (LIMIT < unprocessed.length) {
      console.log(`Limiting to ${LIMIT} recording(s)`);
      unprocessed = unprocessed.slice(0, LIMIT);
    }

    // Process one at a time to avoid race conditions
    for (const recording of unprocessed) {
      await processRecording(recording);
    }

    return unprocessed.length;
  } catch (error) {
    console.error("Polling error:", error);
    return 0;
  }
}

async function processIdeas(): Promise<number> {
  try {
    const ideas = await queryPendingIdeas(LIMIT);

    if (ideas.length === 0) {
      console.log("No pending ideas found.");
      return 0;
    }

    console.log(`Found ${ideas.length} pending idea(s)`);

    for (const idea of ideas) {
      await processIdea(idea, DRY_RUN);
    }

    return ideas.length;
  } catch (error) {
    console.error("Error processing ideas:", error);
    return 0;
  }
}

function printUsage(): void {
  console.log(`
Voice Listener - Extract actions from voice transcriptions

Usage: bun run src/index.ts [options]

Options:
  --dry-run     Extract actions but don't save to database
  --once        Process once and exit (don't poll continuously)
  --limit N     Only process N recordings/ideas
  --ideas       Process idea actions (trigger /longrun workflow)
  --no-longrun  Skip longrun trigger (just extract as idea type)

Examples:
  bun run src/index.ts --dry-run --once --limit 1    # Test with one recording
  bun run src/index.ts --once --limit 5              # Process 5 recordings and exit
  bun run src/index.ts                               # Run continuously (production)
  bun run src/index.ts --ideas --once --limit 1      # Process one idea with longrun
  bun run src/index.ts --ideas --dry-run             # Preview what ideas would trigger
`);
}

async function main(): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  console.log("Voice Listener starting...");
  if (DRY_RUN) console.log("  Mode: DRY RUN (no changes will be saved)");
  if (ONCE) console.log("  Mode: ONCE (will exit after processing)");
  if (IDEAS_MODE) console.log("  Mode: IDEAS (processing idea actions with /longrun)");
  if (NO_LONGRUN) console.log("  Mode: NO_LONGRUN (ideas extracted but not processed)");
  if (LIMIT < Infinity) console.log(`  Limit: ${LIMIT}`);

  // Ideas mode: process pending ideas
  if (IDEAS_MODE) {
    console.log("\nQuerying for pending ideas...");
    const processed = await processIdeas();

    if (ONCE) {
      console.log(`\nDone. Processed ${processed} idea(s).`);
      process.exit(0);
    }

    // Set up polling interval for ideas
    setInterval(processIdeas, POLL_INTERVAL);
    console.log(`\nListening for new ideas (polling every ${POLL_INTERVAL / 1000}s)...`);
    return;
  }

  // Regular mode: process recordings
  // Recover any stale processing records (skip in dry run)
  if (!DRY_RUN) {
    await recoverStaleRecordings();
  }

  console.log("\nPolling for transcribed recordings...");

  // Initial poll
  const processed = await pollForRecordings();

  if (ONCE) {
    console.log(`\nDone. Processed ${processed} recording(s).`);
    process.exit(0);
  }

  // Set up polling interval
  setInterval(pollForRecordings, POLL_INTERVAL);

  console.log(`\nListening for new recordings (polling every ${POLL_INTERVAL / 1000}s)...`);
}

main().catch(console.error);
