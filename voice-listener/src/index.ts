import { db, id, lookup } from "./db";
import { processTranscription, type ExtractedAction } from "./processor";

interface RecordingImage {
  id: string;
  url?: string;
}

interface Recording {
  id: string;
  transcription?: string;
  status: string;
  processingStatus?: string;
  processingStartedAt?: number;
  images?: RecordingImage[];
}

const STALE_THRESHOLD = 10 * 60 * 1000; // 10 minutes
const POLL_INTERVAL = 5000; // 5 seconds
const HEARTBEAT_INTERVAL = 10000; // 10 seconds
const WORKER_NAME = "extraction";

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

async function sendHeartbeat(status?: string): Promise<void> {
  try {
    await db.transact(
      db.tx.workerHeartbeats[lookup("name", WORKER_NAME)].update({
        name: WORKER_NAME,
        lastSeen: Date.now(),
        status: status ?? null,
      })
    );
  } catch (error) {
    // Ignore heartbeat errors - non-critical
    console.error("Heartbeat error:", error);
  }
}

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

    // Build the update object with all fields
    const updateData: Record<string, unknown> = {
      type: action.type,
      title: action.title,
      description: action.description ?? null,
      status: "pending",
      extractedAt: now,
      syncToken,
      projectPath: action.projectPath ?? null,
    };

    // Add CodeChange subtype
    if (action.subtype) {
      updateData.subtype = action.subtype;
    }

    // Add UserTask-specific fields
    if (action.type === "UserTask") {
      if (action.task) updateData.task = action.task;
      if (action.why_user) updateData.why_user = action.why_user;
      if (action.prep_allowed) updateData.prep_allowed = action.prep_allowed;
      if (action.remind_at) updateData.remind_at = action.remind_at;
    }

    return db.tx.actions[actionId]
      .update(updateData)
      .link({ recording: recordingId });
  });

  await db.transact(txs);
}

async function processRecording(recording: Recording): Promise<void> {
  const { id: recordingId, transcription, images } = recording;

  if (!transcription) {
    console.log(`Recording ${recordingId} has no transcription, skipping`);
    return;
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Processing recording ${recordingId}`);
  console.log(`Transcription: "${transcription.slice(0, 200)}${transcription.length > 200 ? "..." : ""}"`);

  // Get image URLs if available
  const imageUrls = (images ?? [])
    .filter((img) => img.url)
    .map((img) => img.url as string);

  if (imageUrls.length > 0) {
    console.log(`Images: ${imageUrls.length} attached`);
  }
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
  const result = await processTranscription(transcription, imageUrls);

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
        images: {},
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

function printUsage(): void {
  console.log(`
Voice Listener - Extract actions from voice transcriptions

Usage: bun run src/index.ts [options]

Options:
  --dry-run     Extract actions but don't save to database
  --once        Process once and exit (don't poll continuously)
  --limit N     Only process N recordings

Examples:
  bun run src/index.ts --dry-run --once --limit 1    # Test with one recording
  bun run src/index.ts --once --limit 5              # Process 5 recordings and exit
  bun run src/index.ts                               # Run continuously (production)
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
  if (LIMIT < Infinity) console.log(`  Limit: ${LIMIT}`);

  // Send initial heartbeat
  if (!DRY_RUN) {
    await sendHeartbeat("starting");
  }

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

  // Send heartbeat on startup
  if (!DRY_RUN) {
    await sendHeartbeat("listening");
    // Set up heartbeat interval
    setInterval(() => sendHeartbeat("listening"), HEARTBEAT_INTERVAL);
  }

  // Set up polling interval
  setInterval(pollForRecordings, POLL_INTERVAL);

  console.log(`\nListening for new recordings (polling every ${POLL_INTERVAL / 1000}s)...`);
}

main().catch(console.error);
