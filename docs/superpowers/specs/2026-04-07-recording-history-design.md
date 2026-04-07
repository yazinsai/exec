# Recording History — Design Spec

## Overview

Add a recording history to the desktop app that tracks the last 10 recordings (including cancelled and failed ones) and allows reprocessing failed/cancelled recordings from the tray menu.

## Problem

Recordings are fire-and-forget. If transcription fails or the user accidentally cancels, the audio is deleted and the recording is lost. Users must re-record, which is frustrating.

## Storage

### History File

- **Path**: `~/Library/Application Support/exec-desktop/recording-history.json`
- JSON array of up to 10 entries, newest first
- Loaded into memory on app start, written to disk after every change

### Audio Files

- **Directory**: `~/Library/Application Support/exec-desktop/recordings/`
- WAV files saved here instead of `os.tmpdir()`
- Naming: `recording-{timestamp}.wav` (same as current, different directory)
- Deleted only when rotated out of the 10-item history or when user clears history

### Rotation

When a new recording pushes the array past 10 entries:
1. Remove the oldest entry
2. Delete its audio file from disk
3. Save updated history to JSON file

## History Entry Schema

```js
{
  id: string,                  // "rec-{Date.now()}"
  audioPath: string,           // absolute path to WAV file in recordings dir
  transcript: string | null,   // null if transcription failed or was cancelled before transcription
  status: "success" | "failed" | "cancelled",
  error: string | null,        // error message if status is "failed"
  noteId: string | null,       // InstantDB note ID if successfully submitted
  createdAt: number            // Date.now() timestamp
}
```

## Recording Flow Changes

Current flow stores audio in `os.tmpdir()` and deletes it after success or cancel. New flow:

1. `startRecording()` saves audio to `recordings/` directory instead of tmpdir
2. On **success**: add entry with `status: "success"`, keep audio file
3. On **transcription failure**: add entry with `status: "failed"`, `error` set, keep audio file
4. On **cancel**: add entry with `status: "cancelled"`, keep audio file (audio may be short/empty but we keep it)
5. On **save failure** (InstantDB error): add entry with `status: "failed"`, keep audio file. The existing retry/dismiss flow still works for the immediate attempt; the history entry is written regardless so the recording is never lost.
6. After adding entry, rotate history if > 10 items

No changes to the overlay UI, hotkey, or IPC channels.

## Tray Menu

Add a "Recording History" submenu to the existing tray context menu. Structure:

```
Recording History  >
  "Send the invoice to..."    ✓   2m ago
  "Remind me to call..."      ✓   15m ago
  "Build a landing pa..."     ✗   32m ago
    > Reprocess
  [cancelled] "Check the..."  1h ago
    > Reprocess
  ─────────────
  Clear History
```

### Menu Item Format

- **Label**: `{prefix}{transcript} {statusIcon}  {relativeTime}`
  - `prefix`: `[cancelled] ` for cancelled items, empty otherwise
  - `transcript`: first 30 characters of transcript, or `[No transcript]` if null
  - `statusIcon`: `✓` for success, `✗` for failed, empty for cancelled
  - `relativeTime`: "2m ago", "1h ago", "3h ago", etc.
- **Submenu**: Failed and cancelled items get a submenu with a single "Reprocess" item
- **Successful items**: displayed for reference only, no submenu, not clickable

### Clear History

- Deletes all audio files in the recordings directory
- Clears the history JSON file (writes `[]`)
- Rebuilds the tray menu

### Menu Rebuild

The tray context menu is rebuilt after:
- A new recording completes (any outcome)
- A reprocess completes
- User clicks "Clear History"

## Reprocess Flow

When user clicks "Reprocess" on a failed/cancelled history item:

1. Verify the audio file still exists at `entry.audioPath`; if not, show overlay error "Audio file missing" and remove the entry from history
2. Show overlay in "transcribing" state: "Reprocessing..."
3. Call `transcribeAudio(entry.audioPath)` (uses whatever engine is current — will be Parakeet v2)
4. If transcription succeeds and is non-empty:
   - Call `createNote(transcription)` to submit to InstantDB
   - Update entry: `status: "success"`, `transcript`, `noteId`, clear `error`
   - Show overlay "Got it ✓", hide after 1200ms
5. If transcription fails or is empty:
   - Update entry: keep `status: "failed"`, update `error` message
   - Show overlay with error message, hide after 2500ms
6. Save history to disk, rebuild tray menu

## Initialization

On app start (`app.whenReady`):
1. Ensure `recordings/` directory exists (`fs.mkdirSync` with `recursive: true`)
2. Load history from JSON file (default to `[]` if file doesn't exist or is corrupted)
3. Validate entries: remove any whose audio files no longer exist on disk
4. Save cleaned history back to disk
5. Build tray menu with history submenu

## Implementation Scope

### New code
- `RecordingHistory` module: load, save, add, remove, clear, get functions
- Tray menu builder with history submenu
- Reprocess handler

### Modified code
- `startRecording()`: change audio path from tmpdir to recordings dir
- `handleHotkeyUp()`: add history entry on every outcome
- `cancelRecording()`: add history entry instead of deleting audio
- `saveNote()`: add history entry on success, update on save-failure
- `createTray()` / tray menu setup: include history submenu
- Remove audio file cleanup from success/cancel paths

### Not changed
- Overlay HTML/CSS/JS
- Preload script
- IPC channels
- InstantDB schema or permissions
- Hotkey registration
