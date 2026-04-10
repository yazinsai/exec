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
const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

if (!APP_ID || !ADMIN_TOKEN || !OPENAI_API_KEY) {
  console.error("Missing env vars. Need INSTANT_APP_ID, ADMIN_TOKEN, and OPENAI_API_KEY.");
  process.exit(1);
}

const db: any = init({ appId: APP_ID, adminToken: ADMIN_TOKEN, schema });

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

async function summarize(input: string): Promise<string | null> {
  try {
    const response = await fetch(OPENAI_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.4-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a title generator. Given a voice transcript, output a single short title (max 60 chars) that names the specific project, tool, or topic and the action being taken.\n\nRules:\n- Name the actual thing: the project, app, API, language, or domain\n- Include the verb: fix, add, build, research, deploy, update\n- NEVER describe the structure of the request (e.g. 'one concrete task', 'two sequential tasks', 'multi-step request', 'three tasks extracted')\n- NEVER use vague words like 'concrete', 'various', 'multiple', 'several'\n- If multiple topics, pick the most important one\n\nExamples:\n- 'Fix exec app cancel bug' not 'One bug fix task'\n- 'Bahrain solar feasibility research' not 'Three research tasks'\n- 'Add TTS to exec messages' not 'One concrete feature request'\n\nReturn ONLY the title. No quotes, no explanation.",
          },
          { role: "user", content: input },
        ],
        max_completion_tokens: 40,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      console.error(`  OpenAI error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (e: any) {
    console.error(`  OpenAI exception: ${e.message}`);
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
