#!/usr/bin/env bun
/**
 * Backfill note and task summaries using the updated LLM prompt.
 * Regenerates titles for all notes with transcripts and tasks with input text.
 *
 * Usage: cd ~/ai/projects/exec && bun run scripts/backfill-summaries.ts
 */

import { init } from "@instantdb/admin";
import schema from "../instant.schema";

const APP_ID = process.env.EXPO_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID;
const ADMIN_TOKEN = process.env.INSTANT_APP_ADMIN_TOKEN || process.env.INSTANT_ADMIN_TOKEN;
const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY;

if (!APP_ID || !ADMIN_TOKEN || !GROQ_API_KEY) {
  console.error("Missing env vars. Need INSTANT_APP_ID, ADMIN_TOKEN, and GROQ_API_KEY.");
  process.exit(1);
}

const db: any = init({ appId: APP_ID, adminToken: ADMIN_TOKEN, schema });

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

async function summarize(input: string): Promise<string | null> {
  try {
    const response = await fetch(GROQ_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "Generate a short, descriptive title (max 60 chars) that captures the actual subject matter of the user's voice command. Focus on WHAT the command is about semantically — the topic, project, or goal — not HOW it's structured (e.g. never say 'two sequential tasks' or 'multi-step request'). Examples: 'Twitter morning paper pipeline', 'Fix auth middleware bug', 'Deploy landing page to production'. Return only the title, nothing else. No quotes.",
          },
          { role: "user", content: input },
        ],
        max_tokens: 30,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      console.error(`  Groq error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (e: any) {
    console.error(`  Groq exception: ${e.message}`);
    return null;
  }
}

// Small delay to respect rate limits
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function backfillNotes() {
  console.log("Fetching notes...");
  const { notes } = await db.query({ notes: {} });

  const candidates = (notes as any[]).filter(
    (n) => n.transcript && n.transcript.length > 10
  );
  console.log(`Found ${candidates.length} notes with transcripts (${notes.length} total)\n`);

  let updated = 0;
  let skipped = 0;

  for (const note of candidates) {
    const oldTitle = note.summary || "(none)";
    const newTitle = await summarize(note.transcript);

    if (!newTitle) {
      console.log(`  SKIP [note] ${note.id.slice(0, 8)} — LLM returned null`);
      skipped++;
      continue;
    }

    if (newTitle === oldTitle) {
      console.log(`  SAME [note] ${note.id.slice(0, 8)} — "${oldTitle}"`);
      skipped++;
      continue;
    }

    console.log(`  UPDATE [note] ${note.id.slice(0, 8)}: "${oldTitle}" → "${newTitle}"`);
    await db.transact(db.tx.notes[note.id].update({ summary: newTitle }));
    updated++;
    await sleep(200);
  }

  console.log(`\nNotes: ${updated} updated, ${skipped} skipped\n`);
}

async function backfillTasks() {
  console.log("Fetching tasks...");
  const { tasks } = await db.query({ tasks: {} });

  const candidates = (tasks as any[]).filter(
    (t) => t.input && t.input.length > 10
  );
  console.log(`Found ${candidates.length} tasks with input text (${tasks.length} total)\n`);

  let updated = 0;
  let skipped = 0;

  for (const task of candidates) {
    const oldTitle = task.summary || "(none)";
    const newTitle = await summarize(task.input);

    if (!newTitle) {
      console.log(`  SKIP [task] ${task.id.slice(0, 8)} — LLM returned null`);
      skipped++;
      continue;
    }

    if (newTitle === oldTitle) {
      console.log(`  SAME [task] ${task.id.slice(0, 8)} — "${oldTitle}"`);
      skipped++;
      continue;
    }

    console.log(`  UPDATE [task] ${task.id.slice(0, 8)}: "${oldTitle}" → "${newTitle}"`);
    await db.transact(db.tx.tasks[task.id].update({ summary: newTitle }));
    updated++;
    await sleep(200);
  }

  console.log(`\nTasks: ${updated} updated, ${skipped} skipped`);
}

async function main() {
  console.log("=== Backfilling summaries with updated prompt ===\n");
  await backfillNotes();
  await backfillTasks();
  console.log("\n=== Done ===");
  process.exit(0);
}

main();
