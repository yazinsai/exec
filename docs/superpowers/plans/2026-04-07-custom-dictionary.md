# Custom Dictionary Implementation Plan

## Steps

### Step 1: Schema + Permissions
- Add `dictionaryTerms` entity to `instant.schema.ts`
- Add permissions to `instant.perms.ts`
- Push schema + perms

### Step 2: Agent — Auto-sync INDEX.md terms
- In `agent/index.ts`, add `syncDictionaryTerms()` function
- Uses `parseProjectIndex()` to get project slugs
- Queries existing `dictionaryTerms` with `source: "auto"`
- Inserts missing, deletes stale
- Call on agent startup (after db init, before polling loop)

### Step 3: Agent — Inject dictionary into triage
- In `agent/triage.ts`, accept optional `dictionaryTerms: string[]` parameter
- Add manual terms to the triage prompt between project index and voice note
- In `agent/index.ts`, fetch manual terms before calling `triageTranscript()`

### Step 4: Mobile — Build prompt from dictionary
- In `app/index.tsx`, query `dictionaryTerms` via `db.useQuery`
- Build a `buildDictionaryPrompt(terms)` utility in `lib/transcription.ts`
  - Manual terms first, then auto terms
  - Join with commas, truncate to ~800 chars
- Pass prompt to all `transcribeAudio()` call sites

### Step 5: Mobile — Dictionary management UI
- New component `components/DictionarySheet.tsx`
- Modal (pageSheet style) with:
  - Text input + add button
  - FlatList of terms (manual first, then auto)
  - Swipe-to-delete on manual terms
  - Auto terms labeled, not deletable
- Add gear/book icon in header to open the sheet
