# Recording History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track the last 10 recordings in the desktop app with a tray menu for reviewing and reprocessing failed/cancelled ones.

**Architecture:** New `history.js` module handles storage (JSON file + audio dir in `~/Library/Application Support/exec-desktop/`). Main process integrates it into the recording flow and tray menu. No overlay/preload/IPC changes.

**Tech Stack:** Electron, Node.js fs, existing sherpa-onnx transcription, InstantDB

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `desktop/history.js` | Recording history CRUD: load, save, add, remove, clear, rotate, relative time formatting |
| Modify | `desktop/main.js` | Integrate history module; change audio save path; update tray menu builder; add reprocess handler |

---

### Task 1: Create the history module

**Files:**
- Create: `desktop/history.js`

This module manages the JSON history file and audio directory. It exports functions consumed by `main.js`. No Electron APIs needed — pure Node.js.

- [ ] **Step 1: Create `desktop/history.js` with storage constants and init**

```js
const fs = require("fs");
const path = require("path");
const os = require("os");

const DATA_DIR = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "exec-desktop"
);
const RECORDINGS_DIR = path.join(DATA_DIR, "recordings");
const HISTORY_FILE = path.join(DATA_DIR, "recording-history.json");
const MAX_ENTRIES = 10;

let history = [];

function init() {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
  try {
    const data = fs.readFileSync(HISTORY_FILE, "utf-8");
    history = JSON.parse(data);
    if (!Array.isArray(history)) history = [];
  } catch {
    history = [];
  }
  // Remove entries whose audio files no longer exist
  const before = history.length;
  history = history.filter(
    (e) => e.audioPath && fs.existsSync(e.audioPath)
  );
  if (history.length !== before) save();
}
```

- [ ] **Step 2: Add save, add, rotate, and clear functions**

```js
function save() {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

function addEntry(entry) {
  history.unshift(entry);
  // Rotate: remove oldest entries beyond MAX_ENTRIES
  while (history.length > MAX_ENTRIES) {
    const old = history.pop();
    if (old.audioPath) {
      try { fs.unlinkSync(old.audioPath); } catch {}
    }
  }
  save();
}

function updateEntry(id, updates) {
  const entry = history.find((e) => e.id === id);
  if (entry) {
    Object.assign(entry, updates);
    save();
  }
}

function getAll() {
  return history;
}

function clear() {
  for (const entry of history) {
    if (entry.audioPath) {
      try { fs.unlinkSync(entry.audioPath); } catch {}
    }
  }
  history = [];
  save();
}
```

- [ ] **Step 3: Add `makeAudioPath` and `relativeTime` helpers, then exports**

```js
function makeAudioPath() {
  return path.join(RECORDINGS_DIR, `recording-${Date.now()}.wav`);
}

function relativeTime(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

module.exports = { init, addEntry, updateEntry, getAll, clear, makeAudioPath, relativeTime };
```

- [ ] **Step 4: Commit**

```bash
git add desktop/history.js
git commit -m "Add recording history module (exec)"
```

---

### Task 2: Change audio save path and initialize history on startup

**Files:**
- Modify: `desktop/main.js:1-5` (add require)
- Modify: `desktop/main.js:143-148` (startRecording — change tempAudioPath)
- Modify: `desktop/main.js:398-438` (app.whenReady — add history init)

- [ ] **Step 1: Add history require at the top of main.js**

After the existing requires (after line 14 `const { execFile } = require("child_process");`), add:

```js
const history = require("./history");
```

- [ ] **Step 2: Change `startRecording()` to use history's audio path**

Replace lines 143-148 in `startRecording()`:

```js
// OLD:
  tempAudioPath = path.join(
    os.tmpdir(),
    `exec-recording-${Date.now()}.wav`
  );

// NEW:
  tempAudioPath = history.makeAudioPath();
```

- [ ] **Step 3: Initialize history on app startup**

In the `app.whenReady()` callback, add `history.init()` right after `app.dock?.hide()` (after line 400):

```js
  app.dock?.hide();
  history.init();
```

- [ ] **Step 4: Commit**

```bash
git add desktop/main.js
git commit -m "Wire history module into main process (exec)"
```

---

### Task 3: Add history entries on every recording outcome

**Files:**
- Modify: `desktop/main.js:261-279` (cancelRecording)
- Modify: `desktop/main.js:294-321` (handleHotkeyUp)
- Modify: `desktop/main.js:323-337` (saveNote)
- Modify: `desktop/main.js:345-351` (dismissSave)

This task changes the recording flow so every outcome (success, failure, cancel) creates a history entry and audio is never deleted immediately.

- [ ] **Step 1: Update `cancelRecording()` — add history entry, keep audio**

Replace the current `cancelRecording()` function (lines 261-279):

```js
function cancelRecording() {
  if (!isRecording) return;
  isRecording = false;

  if (recordingProcess) {
    const proc = recordingProcess;
    recordingProcess = null;
    proc.kill("SIGINT");
  }

  // Add to history instead of deleting
  if (tempAudioPath) {
    // Wait briefly for ffmpeg to flush the file
    setTimeout(() => {
      history.addEntry({
        id: `rec-${Date.now()}`,
        audioPath: tempAudioPath,
        transcript: null,
        status: "cancelled",
        error: null,
        noteId: null,
        createdAt: Date.now(),
      });
      tempAudioPath = null;
      rebuildTrayMenu();
    }, 300);
  }

  showOverlay("error", "Cancelled");
  hideOverlayAfter(800);
}
```

- [ ] **Step 2: Update `handleHotkeyUp()` — add history entries for failures**

Replace the current `handleHotkeyUp()` function (lines 294-321):

```js
async function handleHotkeyUp() {
  if (!isRecording) return;
  isRecording = false;

  showOverlay("transcribing", "Transcribing...");

  try {
    const audioPath = await stopRecording();
    if (!audioPath) {
      showOverlay("error", "No audio captured");
      hideOverlayAfter(1500);
      return;
    }

    let transcription;
    try {
      transcription = await transcribeAudio(audioPath);
    } catch (err) {
      console.error("Transcription error:", err);
      history.addEntry({
        id: `rec-${Date.now()}`,
        audioPath,
        transcript: null,
        status: "failed",
        error: err.message.slice(0, 100),
        noteId: null,
        createdAt: Date.now(),
      });
      rebuildTrayMenu();
      showOverlay("error", "Error: " + err.message.slice(0, 50));
      hideOverlayAfter(2500);
      return;
    }

    if (!transcription || transcription.trim().length === 0) {
      history.addEntry({
        id: `rec-${Date.now()}`,
        audioPath,
        transcript: null,
        status: "failed",
        error: "No speech detected",
        noteId: null,
        createdAt: Date.now(),
      });
      rebuildTrayMenu();
      showOverlay("error", "No speech detected");
      hideOverlayAfter(1500);
      return;
    }

    await saveNote(transcription.trim(), audioPath);
  } catch (err) {
    console.error("Error processing recording:", err);
    showOverlay("error", "Error: " + err.message.slice(0, 50));
    hideOverlayAfter(2500);
  }
}
```

- [ ] **Step 3: Update `saveNote()` — add history entry on success, keep audio**

Replace the current `saveNote()` function (lines 323-337):

```js
async function saveNote(transcription, audioPath) {
  showOverlay("creating", "Saving note...");
  try {
    const noteId = await createNote(transcription);
    pendingSave = null;
    history.addEntry({
      id: `rec-${Date.now()}`,
      audioPath,
      transcript: transcription,
      status: "success",
      error: null,
      noteId,
      createdAt: Date.now(),
    });
    rebuildTrayMenu();
    showOverlay("done", "Got it ✓");
    hideOverlayAfter(1200);
  } catch (err) {
    console.error("Save failed, keeping recording for retry:", err);
    // Add failed entry to history
    history.addEntry({
      id: `rec-${Date.now()}`,
      audioPath,
      transcript: transcription,
      status: "failed",
      error: "Save failed: " + err.message.slice(0, 80),
      noteId: null,
      createdAt: Date.now(),
    });
    rebuildTrayMenu();
    pendingSave = { transcription, audioPath };
    showOverlay("save-failed", "Save failed — tap to retry");
  }
}
```

- [ ] **Step 4: Update `dismissSave()` — stop deleting audio**

Replace the current `dismissSave()` function (lines 345-351):

```js
function dismissSave() {
  if (!pendingSave) return;
  pendingSave = null;
  hideOverlay();
}
```

The audio is already tracked in history — no deletion needed.

- [ ] **Step 5: Commit**

```bash
git add desktop/main.js
git commit -m "Track all recording outcomes in history (exec)"
```

---

### Task 4: Build tray menu with history submenu

**Files:**
- Modify: `desktop/main.js:354-394` (createTray / tray menu)

- [ ] **Step 1: Extract tray menu building into a `rebuildTrayMenu()` function and add reprocess handler**

Replace the current `createTray()` function (lines 354-394) and add `rebuildTrayMenu()` and `reprocessEntry()` right before it:

```js
function rebuildTrayMenu() {
  if (!tray) return;

  const entries = history.getAll();
  const historyItems = [];

  for (const entry of entries) {
    const prefix = entry.status === "cancelled" ? "[cancelled] " : "";
    const transcript = entry.transcript
      ? entry.transcript.slice(0, 30) + (entry.transcript.length > 30 ? "..." : "")
      : "[No transcript]";
    const icon = entry.status === "success" ? " \u2713" : entry.status === "failed" ? " \u2717" : "";
    const time = history.relativeTime(entry.createdAt);
    const label = `${prefix}${transcript}${icon}  ${time}`;

    if (entry.status === "success") {
      historyItems.push({ label, enabled: false });
    } else {
      historyItems.push({
        label,
        submenu: [
          {
            label: "Reprocess",
            click: () => reprocessEntry(entry.id),
          },
        ],
      });
    }
  }

  if (entries.length > 0) {
    historyItems.push({ type: "separator" });
    historyItems.push({
      label: "Clear History",
      click: () => {
        history.clear();
        rebuildTrayMenu();
      },
    });
  }

  const template = [
    { label: "Exec Desktop", enabled: false },
    { type: "separator" },
    { label: "Record (Cmd+Option+Space)", click: () => handleHotkeyDown() },
    { type: "separator" },
    {
      label: "Recording History",
      submenu: entries.length > 0
        ? historyItems
        : [{ label: "No recordings yet", enabled: false }],
    },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ];

  tray.setContextMenu(Menu.buildFromTemplate(template));
}

async function reprocessEntry(entryId) {
  const entries = history.getAll();
  const entry = entries.find((e) => e.id === entryId);
  if (!entry) return;

  // Verify audio file exists
  if (!entry.audioPath || !fs.existsSync(entry.audioPath)) {
    showOverlay("error", "Audio file missing");
    hideOverlayAfter(2500);
    // Remove the broken entry
    const idx = entries.indexOf(entry);
    if (idx !== -1) entries.splice(idx, 1);
    history.updateEntry(entryId, {}); // triggers save via the filter in getAll
    rebuildTrayMenu();
    return;
  }

  showOverlay("transcribing", "Reprocessing...");

  try {
    const transcription = await transcribeAudio(entry.audioPath);
    if (!transcription || transcription.trim().length === 0) {
      history.updateEntry(entryId, {
        status: "failed",
        error: "No speech detected",
      });
      rebuildTrayMenu();
      showOverlay("error", "No speech detected");
      hideOverlayAfter(2500);
      return;
    }

    const noteId = await createNote(transcription.trim());
    history.updateEntry(entryId, {
      status: "success",
      transcript: transcription.trim(),
      noteId,
      error: null,
    });
    rebuildTrayMenu();
    showOverlay("done", "Got it \u2713");
    hideOverlayAfter(1200);
  } catch (err) {
    console.error("Reprocess failed:", err);
    history.updateEntry(entryId, {
      status: "failed",
      error: err.message.slice(0, 100),
    });
    rebuildTrayMenu();
    showOverlay("error", "Error: " + err.message.slice(0, 50));
    hideOverlayAfter(2500);
  }
}
```

- [ ] **Step 2: Simplify `createTray()` to just create the tray and call `rebuildTrayMenu()`**

Replace the old `createTray()` with:

```js
function createTray() {
  const iconPath = path.join(__dirname, "tray-iconTemplate.png");
  const icon2xPath = path.join(__dirname, "tray-iconTemplate@2x.png");
  let icon;

  if (fs.existsSync(icon2xPath)) {
    icon = nativeImage.createFromPath(icon2xPath);
    icon.setTemplateImage(true);
    icon = icon.resize({ width: 18, height: 18 });
    icon.setTemplateImage(true);
  } else if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
    icon.setTemplateImage(true);
  } else {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip("Exec — Cmd+Option+Space to record");
  rebuildTrayMenu();
}
```

- [ ] **Step 3: Commit**

```bash
git add desktop/main.js
git commit -m "Add recording history tray menu with reprocess (exec)"
```

---

### Task 5: Fix reprocess edge case for missing audio and remove stale entry

**Files:**
- Modify: `desktop/history.js` (add `removeEntry`)
- Modify: `desktop/main.js` (use `removeEntry` in `reprocessEntry`)

- [ ] **Step 1: Add `removeEntry` to history module**

Add this function to `desktop/history.js` before the `module.exports` line:

```js
function removeEntry(id) {
  const idx = history.findIndex((e) => e.id === id);
  if (idx !== -1) {
    const entry = history[idx];
    if (entry.audioPath) {
      try { fs.unlinkSync(entry.audioPath); } catch {}
    }
    history.splice(idx, 1);
    save();
  }
}
```

Update the exports:

```js
module.exports = { init, addEntry, updateEntry, removeEntry, getAll, clear, makeAudioPath, relativeTime };
```

- [ ] **Step 2: Fix the missing-audio branch in `reprocessEntry`**

In `reprocessEntry()` in `main.js`, replace the missing-audio-file block:

```js
  // Verify audio file exists
  if (!entry.audioPath || !fs.existsSync(entry.audioPath)) {
    showOverlay("error", "Audio file missing");
    hideOverlayAfter(2500);
    history.removeEntry(entryId);
    rebuildTrayMenu();
    return;
  }
```

- [ ] **Step 3: Commit**

```bash
git add desktop/history.js desktop/main.js
git commit -m "Handle missing audio files in reprocess (exec)"
```

---

### Task 6: Manual verification

- [ ] **Step 1: Start the desktop app**

```bash
cd /Users/rock/ai/projects/exec/desktop && npm start
```

- [ ] **Step 2: Verify initialization**

Check that the directory was created:
```bash
ls -la ~/Library/Application\ Support/exec-desktop/recordings/
```

- [ ] **Step 3: Test a successful recording**

1. Press Cmd+Option+Space to start recording
2. Speak something
3. Press Cmd+Option+Space to stop
4. Verify overlay shows "Got it ✓"
5. Check tray menu → Recording History — should show the recording with ✓

- [ ] **Step 4: Test a cancelled recording**

1. Press Cmd+Option+Space to start recording
2. Press Escape to cancel
3. Check tray menu → Recording History — should show `[cancelled]` entry with Reprocess submenu

- [ ] **Step 5: Test reprocessing**

1. Find a cancelled or failed entry in the tray menu
2. Click its Reprocess submenu item
3. Verify overlay shows "Reprocessing..." then "Got it ✓"
4. Check the entry now shows ✓ in the tray menu

- [ ] **Step 6: Test clear history**

1. Click "Clear History" in the Recording History submenu
2. Verify the submenu now shows "No recordings yet"
3. Verify `~/Library/Application Support/exec-desktop/recordings/` is empty

- [ ] **Step 7: Test rotation**

Record more than 10 times and verify the oldest entries are removed from both the menu and disk.
