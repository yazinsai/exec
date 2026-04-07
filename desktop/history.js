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

module.exports = { init, addEntry, updateEntry, removeEntry, getAll, clear, makeAudioPath, relativeTime };
