import { db, id } from "./db";
import { loadPrompt } from "./prompt-loader";
import { runDistillation } from "./distillation-engine";

interface Action {
  id: string;
  type: string;
  subtype?: string;
  title: string;
  description?: string;
  projectPath?: string;
  result?: string;
  rating?: number;
  ratingTags?: string;
  ratingComment?: string;
  messages?: string;
  episodesGenerated?: boolean;
}

interface ThreadMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface EpisodeFromClaude {
  shouldCapture: boolean;
  narrative: string;
  feedbackType: "correction" | "approval" | "rejection";
  projectType: string | null;
  workContext: string | null;
  tags: string[];
  skipReason?: string;
}

const POLL_INTERVAL = 30000; // 30 seconds
const DISTILLATION_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
const WORKER_NAME = "learning";

const args = process.argv.slice(2);
const ONCE = args.includes("--once");

/**
 * Extract user feedback messages from thread (messages after completion).
 */
function extractUserFeedback(messagesJson: string | undefined): string {
  if (!messagesJson) return "";
  try {
    const messages = JSON.parse(messagesJson) as ThreadMessage[];
    const userMessages = messages.filter((m) => m.role === "user");
    if (userMessages.length === 0) return "";
    return userMessages.map((m) => `User: ${m.content}`).join("\n");
  } catch {
    return "";
  }
}

/**
 * Call Claude API to generate an episode from feedback.
 */
async function generateEpisode(action: Action): Promise<EpisodeFromClaude | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Episode recorder: ANTHROPIC_API_KEY not set");
    return null;
  }

  const threadMessages = extractUserFeedback(action.messages);

  const prompt = loadPrompt("episode-generation", {
    ACTION_TYPE: action.type,
    ACTION_TITLE: action.title,
    ACTION_DESCRIPTION: action.description || "(none)",
    PROJECT_PATH: action.projectPath || "(none)",
    RATING: String(action.rating ?? "N/A"),
    RATING_TAGS: action.ratingTags || "(none)",
    RATING_COMMENT: action.ratingComment || "(none)",
    THREAD_MESSAGES: threadMessages || "(no thread messages)",
    ACTION_RESULT: action.result ? action.result.slice(0, 2000) : "(no result)",
  });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`Episode recorder: Claude API error ${response.status}:`, text.slice(0, 300));
      return null;
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text?: string }>;
    };

    const textBlock = data.content.find((b) => b.type === "text");
    if (!textBlock?.text) return null;

    return JSON.parse(textBlock.text) as EpisodeFromClaude;
  } catch (error) {
    console.error("Episode recorder: failed to generate episode:", error);
    return null;
  }
}

/**
 * Process a single rated action: generate and store an episode.
 */
async function processAction(action: Action): Promise<void> {
  console.log(`Processing feedback for: "${action.title}" (rating: ${action.rating})`);

  const episode = await generateEpisode(action);
  if (!episode) {
    console.log(`  Failed to generate episode, will retry later`);
    return;
  }

  if (!episode.shouldCapture) {
    console.log(`  Skipping: ${episode.skipReason || "not a reusable signal"}`);
    // Still mark as processed so we don't retry
    await db.transact(
      db.tx.actions[action.id].update({ episodesGenerated: true })
    );
    return;
  }

  // Build the raw user input from available feedback
  const userInput = [
    action.ratingComment,
    extractUserFeedback(action.messages),
  ]
    .filter(Boolean)
    .join("\n")
    .trim();

  // Write episode to InstantDB
  const episodeId = id();
  const txs = [
    db.tx.episodes[episodeId].update({
      narrative: episode.narrative,
      feedbackType: episode.feedbackType,
      projectType: episode.projectType ?? null,
      projectPath: action.projectPath ?? null,
      workContext: episode.workContext ?? null,
      userInput: userInput || action.ratingComment || "(no direct input)",
      tags: JSON.stringify(episode.tags),
      distilled: false,
      createdAt: Date.now(),
      sourceType: action.rating ? "rating" : "thread",
      sourceActionId: action.id,
    }),
    // Link episode to action
    db.tx.episodes[episodeId].link({ action: action.id }),
    // Mark action as processed
    db.tx.actions[action.id].update({ episodesGenerated: true }),
  ];

  await db.transact(txs);
  console.log(`  Created episode: ${episode.feedbackType} - "${episode.narrative.slice(0, 80)}..."`);
}

/**
 * Poll for actions with unprocessed feedback.
 */
async function pollForFeedback(): Promise<number> {
  try {
    // Find actions with ratings that haven't been processed
    const result = await db.query({
      actions: {
        $: {
          where: {
            and: [
              { rating: { $isNull: false } },
              {
                or: [
                  { episodesGenerated: false },
                  { episodesGenerated: { $isNull: true } },
                ],
              },
            ],
          },
        },
      },
    });

    const actions = (result.actions ?? []) as Action[];

    if (actions.length === 0) {
      return 0;
    }

    console.log(`Found ${actions.length} action(s) with unprocessed feedback`);

    for (const action of actions) {
      await processAction(action);
    }

    return actions.length;
  } catch (error) {
    console.error("Episode recorder poll error:", error);
    return 0;
  }
}

/**
 * Send heartbeat for the learning worker.
 */
async function sendHeartbeat(status?: string): Promise<void> {
  try {
    const result = await db.query({
      workerHeartbeats: { $: { where: { name: WORKER_NAME } } },
    });
    const existing = result.workerHeartbeats[0];

    if (existing) {
      await db.transact(
        db.tx.workerHeartbeats[existing.id].update({
          lastSeen: Date.now(),
          status: status ?? null,
        })
      );
    } else {
      await db.transact(
        db.tx.workerHeartbeats[id()].update({
          name: WORKER_NAME,
          lastSeen: Date.now(),
          status: status ?? null,
        })
      );
    }
  } catch (error) {
    console.error("Heartbeat error:", error);
  }
}

async function main(): Promise<void> {
  console.log("Episode Recorder starting...");
  if (ONCE) console.log("  Mode: ONCE (will exit after processing)");

  await sendHeartbeat("starting");

  // Initial poll
  const processed = await pollForFeedback();
  console.log(`Initial poll: processed ${processed} action(s)`);

  if (ONCE) {
    // In --once mode, also run distillation if enough episodes
    console.log("Running distillation check...");
    await runDistillation();
    console.log("Done.");
    process.exit(0);
  }

  // Set up polling interval for episode recording
  setInterval(async () => {
    await sendHeartbeat("listening");
    await pollForFeedback();
  }, POLL_INTERVAL);

  // Set up distillation timer (every 6 hours)
  setInterval(async () => {
    console.log("Running scheduled distillation...");
    await sendHeartbeat("distilling");
    try {
      await runDistillation();
    } catch (error) {
      console.error("Scheduled distillation failed:", error);
    }
    await sendHeartbeat("listening");
  }, DISTILLATION_INTERVAL);

  await sendHeartbeat("listening");
  console.log(
    `Listening for feedback (poll: ${POLL_INTERVAL / 1000}s, distillation: ${DISTILLATION_INTERVAL / 3600000}h)...`
  );
}

main().catch(console.error);
