# Custom Dictionary for Transcription

## Problem

Voice transcriptions frequently misspell proper nouns, brand names, and project names (e.g., "instant db" instead of "InstantDB", "doc you" instead of "Dokku"). There's no way to guide the transcription engine with correct spellings.

## Solution

A custom dictionary stored in InstantDB that feeds into transcription at two layers:
1. **Mobile (Groq Whisper)**: Dictionary terms passed as the `prompt` parameter to guide spelling
2. **Agent triage (Claude)**: Manual/brand terms injected into the triage prompt for correction

Desktop (sherpa-onnx) has no prompt parameter — correction happens at the agent triage layer.

## Data Model

### New entity: `dictionaryTerms`

| Field | Type | Notes |
|-------|------|-------|
| `term` | `string.unique().indexed()` | Correct spelling (e.g., "InstantDB") |
| `source` | `string` | `"manual"` or `"auto"` |
| `createdAt` | `number.indexed()` | Timestamp |

Flat list, no links. Permissions: all open (single-user app).

## Auto-population from INDEX.md

On agent startup, read `~/ai/projects/INDEX.md`, extract project slugs, and sync to `dictionaryTerms` with `source: "auto"`:
- New projects: insert with `source: "auto"`
- Removed projects: delete entries with `source: "auto"` that no longer exist
- Manual entries: never touched
- Runs once per agent boot via the existing `parseProjectIndex()` utility

## Mobile Transcription (Groq Whisper)

The `prompt` parameter has a **224-token limit** (~160 project names alone would exceed this). Strategy:

1. Fetch all `dictionaryTerms` from InstantDB via `useQuery`
2. Build prompt string with **manual terms first** (highest priority), then auto terms
3. Join with commas, truncate to ~200 tokens (~800 chars as safety margin)
4. Pass to `transcribeAudio(filePath, prompt)`

Terms are available via the existing InstantDB subscription — no extra fetch needed. The `useQuery` result updates reactively.

Call sites to update:
- `app/index.tsx` line 519 (`transcribeNote`)
- `app/index.tsx` line 947 (direct recording flow)
- `hooks/useShareIntent.tsx` line 140

## Agent Triage Correction

The triage prompt (`agent/triage.ts`) already includes the full project index, so project names are already covered. Add only **manual terms** to the triage prompt:

```
# Custom Dictionary
Use these exact spellings when referenced in the transcript:
InstantDB, NativeWind, Dokku, ...
```

This is injected between the project index and voice note sections. The agent fetches manual terms from InstantDB before triage.

## Mobile UI

Simple dictionary management accessible from a settings entry point:

- **List view**: All terms, manual terms first (deletable), then auto terms (labeled "from projects", not deletable)
- **Add**: Text input + add button at the top
- **Delete**: Swipe-to-delete on manual terms only
- **No edit**: Delete and re-add (it's a word list, not complex data)

Entry point: settings/gear icon on the main screen (or wherever settings currently live).

## Changes Summary

| File | Change |
|------|--------|
| `instant.schema.ts` | Add `dictionaryTerms` entity |
| `instant.perms.ts` | Add permissions for `dictionaryTerms` |
| `app/index.tsx` | Fetch dictionary terms, build prompt, pass to `transcribeAudio` |
| `hooks/useShareIntent.tsx` | Pass dictionary prompt to `transcribeAudio` |
| `agent/index.ts` | Sync INDEX.md to `dictionaryTerms` on startup |
| `agent/triage.ts` | Accept + inject manual dictionary terms into prompt |
| New: dictionary UI | List/add/delete terms screen |
| Desktop | No changes |
