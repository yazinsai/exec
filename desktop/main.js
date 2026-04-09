const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  screen,
  systemPreferences,
} = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFile, execSync, spawn } = require("child_process");
const history = require("./history");

require("dotenv").config({ path: path.join(__dirname, ".env") });

// Catch native crashes and unhandled errors so they don't silently kill the process
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err);
});

const sherpa_onnx = require("sherpa-onnx-node");

const { init, id: instantId } = require("@instantdb/admin");

// --- InstantDB setup ---
const INSTANT_APP_ID = process.env.INSTANT_APP_ID;
const INSTANT_ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN;

// --- Sherpa-ONNX Model Paths ---
const MODEL_DIR = path.join(os.homedir(), ".local/share/exec/models");
const PARAKEET_DIR = path.join(MODEL_DIR, "sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8");

let recognizer = null;

function initRecognizer() {
  if (recognizer) return;
  recognizer = new sherpa_onnx.OfflineRecognizer({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      transducer: {
        encoder: path.join(PARAKEET_DIR, "encoder.int8.onnx"),
        decoder: path.join(PARAKEET_DIR, "decoder.int8.onnx"),
        joiner: path.join(PARAKEET_DIR, "joiner.int8.onnx"),
      },
      tokens: path.join(PARAKEET_DIR, "tokens.txt"),
      numThreads: 4,
      provider: "cpu",
      debug: 0,
      modelType: "nemo_transducer",
    },
  });
  console.log("Parakeet recognizer initialized");
}

function createVad() {
  return new sherpa_onnx.Vad(
    {
      sileroVad: {
        model: path.join(MODEL_DIR, "silero_vad.onnx"),
        threshold: 0.5,
        minSpeechDuration: 0.25,
        minSilenceDuration: 0.5,
        maxSpeechDuration: 30,
        windowSize: 512,
      },
      sampleRate: 16000,
      debug: false,
      numThreads: 1,
    },
    60 // bufferSizeInSeconds
  );
}

const db = init({ appId: INSTANT_APP_ID, adminToken: INSTANT_ADMIN_TOKEN });

let overlay = null;
let tray = null;
let isRecording = false;
let isPaused = false;
let recordingProcess = null;
let tempAudioPath = null;
let audioSegments = []; // paths of recorded segments (for pause/resume)
let hideTimer = null;
let pendingSave = null; // { transcription, audioPath } when save fails

// --- Overlay Window ---
function createOverlay() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  overlay = new BrowserWindow({
    width: 440,
    height: 88,
    x: Math.round((width - 440) / 2),
    y: Math.round(height * 0.25),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlay.loadFile(path.join(__dirname, "overlay.html"));
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Prevent the overlay from stealing focus
  overlay.on("blur", () => {
    // Keep it visible but don't refocus
  });
}

function showOverlay(state, text) {
  // Clear any pending auto-hide from a previous state
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (!overlay) createOverlay();
  overlay.webContents.send("state-change", { state, text });
  if (!overlay.isVisible()) {
    overlay.showInactive();
  }
}

function hideOverlay() {
  if (overlay && overlay.isVisible()) {
    overlay.webContents.send("overlay-hide");
    overlay.hide();
  }
}

function hideOverlayAfter(ms) {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    hideTimer = null;
    hideOverlay();
  }, ms);
}

// --- Default Input Device Detection ---
function getDefaultInputDevice() {
  try {
    const output = execSync(
      `system_profiler SPAudioDataType 2>/dev/null | awk '/^        [^ ]/{name=$0} /Default Input Device: Yes/{gsub(/^        |:$/,"",name); print name}'`,
      { encoding: "utf8", timeout: 5000 }
    ).trim();
    if (output) {
      console.log("Default input device:", output);
      return ":" + output;
    }
  } catch (e) {
    console.warn("Could not detect default input device:", e.message);
  }
  return ":default";
}

let audioInputDevice = null;
let audioInputDevices = []; // cached list of { name, index }

function listAudioInputDevices() {
  try {
    const output = execSync(
      `/opt/homebrew/bin/ffmpeg -f avfoundation -list_devices true -i "" 2>&1 || true`,
      { encoding: "utf8", timeout: 5000 }
    );
    const devices = [];
    let inAudio = false;
    for (const line of output.split("\n")) {
      if (line.includes("AVFoundation audio devices:")) {
        inAudio = true;
        continue;
      }
      if (inAudio) {
        const match = line.match(/\[(\d+)\]\s+(.+)/);
        if (match) {
          devices.push({ index: parseInt(match[1]), name: match[2].trim() });
        }
      }
    }
    return devices;
  } catch (e) {
    console.warn("Could not list audio devices:", e.message);
    return [];
  }
}

// --- Audio Level Metering (FFT frequency bars) ---
const NUM_BARS = 24;
let levelHistory = new Array(NUM_BARS).fill(0);
let levelInterval = null;

// Minimal radix-2 FFT (in-place, iterative)
function fft(re, im) {
  const n = re.length;
  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const angle = -2 * Math.PI / len;
    const wRe = Math.cos(angle), wIm = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let j = 0; j < half; j++) {
        const tRe = curRe * re[i + j + half] - curIm * im[i + j + half];
        const tIm = curRe * im[i + j + half] + curIm * re[i + j + half];
        re[i + j + half] = re[i + j] - tRe;
        im[i + j + half] = im[i + j] - tIm;
        re[i + j] += tRe;
        im[i + j] += tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

function startLevelMetering(proc) {
  const sampleRate = 16000;
  const bytesPerSample = 2; // s16le
  const fftSize = 512; // ~32ms window at 16kHz
  const chunkBytes = fftSize * bytesPerSample;
  let pcmBuffer = Buffer.alloc(0);
  // Hann window
  const hann = new Float64Array(fftSize);
  for (let i = 0; i < fftSize; i++) hann[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)));

  proc.stdout.on("data", (data) => {
    pcmBuffer = Buffer.concat([pcmBuffer, data]);

    while (pcmBuffer.length >= chunkBytes) {
      const chunk = pcmBuffer.subarray(0, chunkBytes);
      pcmBuffer = pcmBuffer.subarray(chunkBytes);

      // Convert to float samples and apply Hann window
      const re = new Float64Array(fftSize);
      const im = new Float64Array(fftSize);
      for (let i = 0; i < fftSize; i++) {
        re[i] = (chunk.readInt16LE(i * 2) / 32768) * hann[i];
      }

      fft(re, im);

      // Compute magnitude for positive frequencies (bins 1..fftSize/2)
      const halfN = fftSize / 2;
      const magnitudes = new Float64Array(halfN);
      for (let i = 0; i < halfN; i++) {
        magnitudes[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / halfN;
      }

      // Group into NUM_BARS bands (log-spaced for perceptual frequency distribution)
      const minFreq = 80;   // Hz — skip sub-bass rumble
      const maxFreq = 7500; // Hz — audible speech range
      const minBin = Math.floor(minFreq * fftSize / sampleRate);
      const maxBin = Math.min(halfN - 1, Math.floor(maxFreq * fftSize / sampleRate));
      const bars = new Array(NUM_BARS).fill(0);

      for (let b = 0; b < NUM_BARS; b++) {
        // Log-spaced band edges
        const loFrac = b / NUM_BARS;
        const hiFrac = (b + 1) / NUM_BARS;
        const lo = Math.floor(minBin + (maxBin - minBin) * (Math.pow(2, loFrac) - 1));
        const hi = Math.floor(minBin + (maxBin - minBin) * (Math.pow(2, hiFrac) - 1));
        const binLo = Math.max(minBin, lo);
        const binHi = Math.max(binLo + 1, hi);

        let sum = 0;
        let count = 0;
        for (let i = binLo; i < binHi && i < halfN; i++) {
          sum += magnitudes[i];
          count++;
        }
        const avg = count > 0 ? sum / count : 0;
        // Log scale with aggressive boost for speech levels
        bars[b] = Math.min(1, Math.max(0, (Math.log10(avg * 5000 + 1) / Math.log10(5001))));
      }

      // Smooth with previous frame for less jitter
      for (let i = 0; i < NUM_BARS; i++) {
        levelHistory[i] = levelHistory[i] * 0.15 + bars[i] * 0.85;
      }

      if (overlay && overlay.isVisible()) {
        overlay.webContents.send("audio-levels", [...levelHistory]);
      }
    }
  });
}

function stopLevelMetering() {
  levelHistory = new Array(LEVEL_HISTORY_SIZE).fill(0);
  if (overlay && overlay.isVisible()) {
    overlay.webContents.send("audio-levels", levelHistory);
  }
}

// --- Audio Recording (macOS using ffmpeg/avfoundation) ---
function startRecording() {
  if (!audioInputDevice) audioInputDevice = getDefaultInputDevice();
  console.log("Starting recording with device:", audioInputDevice);
  tempAudioPath = history.makeAudioPath();

  // Spawn ffmpeg: write WAV to file + pipe raw PCM to stdout for metering
  const proc = spawn("/opt/homebrew/bin/ffmpeg", [
    "-f", "avfoundation",
    "-i", audioInputDevice,
    "-ar", "16000",
    "-ac", "1",
    "-y", tempAudioPath,
    "-f", "s16le",
    "-ar", "16000",
    "-ac", "1",
    "pipe:1",
  ], { timeout: 120000 });

  proc.stderr.on("data", () => {}); // drain stderr to prevent blocking
  proc.on("error", (err) => console.error("Recording error:", err.message));

  startLevelMetering(proc);
  recordingProcess = proc;
}

function stopCurrentRecordingProcess() {
  return new Promise((resolve) => {
    if (!recordingProcess) {
      resolve(null);
      return;
    }
    const proc = recordingProcess;
    recordingProcess = null;
    stopLevelMetering();

    proc.kill("SIGINT");

    setTimeout(() => {
      if (tempAudioPath && fs.existsSync(tempAudioPath)) {
        const stats = fs.statSync(tempAudioPath);
        if (stats.size > 1000) {
          resolve(tempAudioPath);
        } else {
          console.warn("Audio file too small, discarding");
          resolve(null);
        }
      } else {
        resolve(null);
      }
    }, 300);
  });
}

function stopRecording() {
  return new Promise(async (resolve) => {
    // Stop any active ffmpeg process
    const lastPath = await stopCurrentRecordingProcess();
    if (lastPath) {
      audioSegments.push(lastPath);
    }

    if (audioSegments.length === 0) {
      resolve(null);
      return;
    }

    if (audioSegments.length === 1) {
      const finalPath = audioSegments[0];
      audioSegments = [];
      resolve(finalPath);
      return;
    }

    // Concatenate multiple segments
    const concatPath = history.makeAudioPath();
    const listPath = concatPath + ".txt";
    const listContent = audioSegments.map((p) => `file '${p}'`).join("\n");
    fs.writeFileSync(listPath, listContent);

    execFile(
      "/opt/homebrew/bin/ffmpeg",
      ["-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-y", concatPath],
      { timeout: 30000 },
      (error) => {
        // Clean up list file and segments
        try { fs.unlinkSync(listPath); } catch {}
        for (const seg of audioSegments) {
          if (seg !== concatPath) {
            try { fs.unlinkSync(seg); } catch {}
          }
        }
        audioSegments = [];

        if (error) {
          console.error("Concat error:", error.message);
          resolve(null);
        } else {
          resolve(concatPath);
        }
      }
    );
  });
}

// --- Pause / Resume ---
async function togglePause() {
  if (!isRecording) return;

  if (!isPaused) {
    // Pause: stop current ffmpeg, save segment
    isPaused = true;
    const segPath = await stopCurrentRecordingProcess();
    if (segPath) audioSegments.push(segPath);
    showOverlay("paused", "Paused");
  } else {
    // Resume: start new ffmpeg segment
    isPaused = false;
    if (!audioInputDevice) audioInputDevice = getDefaultInputDevice();
    tempAudioPath = history.makeAudioPath();
    const proc = spawn("/opt/homebrew/bin/ffmpeg", [
      "-f", "avfoundation",
      "-i", audioInputDevice,
      "-ar", "16000", "-ac", "1", "-y", tempAudioPath,
      "-f", "s16le", "-ar", "16000", "-ac", "1", "pipe:1",
    ], { timeout: 120000 });
    proc.stderr.on("data", () => {});
    proc.on("error", (err) => console.error("Recording error:", err.message));
    startLevelMetering(proc);
    recordingProcess = proc;
    showOverlay("recording", "Recording...");
  }
}

// --- Local Transcription (Parakeet TDT + Silero VAD via sherpa-onnx) ---
function transcribeAudio(audioPath) {
  initRecognizer();
  // Pass false to disable external buffers (required for Electron)
  const wave = sherpa_onnx.readWave(audioPath, false);
  const samples = wave.samples;
  const vad = createVad();

  const segments = [];
  const windowSize = 512;

  for (let i = 0; i < samples.length; i += windowSize) {
    const chunk = samples.subarray(i, i + windowSize);
    vad.acceptWaveform(chunk);
    while (!vad.isEmpty()) {
      segments.push(vad.front(false));
      vad.pop();
    }
  }

  vad.flush();
  while (!vad.isEmpty()) {
    segments.push(vad.front(false));
    vad.pop();
  }

  if (segments.length === 0) return "";

  const texts = [];
  for (const seg of segments) {
    const stream = recognizer.createStream();
    stream.acceptWaveform({ samples: seg.samples, sampleRate: wave.sampleRate });
    recognizer.decode(stream);
    const result = recognizer.getResult(stream);
    if (result.text.trim()) {
      texts.push(result.text.trim());
    }
  }

  return texts.join(" ");
}

// --- InstantDB Note Creation ---
async function createNote(transcription) {
  const noteId = instantId();
  const now = Date.now();

  await db.transact(
    db.tx.notes[noteId].update({
      transcript: transcription,
      status: "pending",
      source: "mac",
      errorMessage: "",
      createdAt: now,
      transcribedAt: now,
    })
  );

  return noteId;
}

// --- Cancel Recording ---
function cancelRecording() {
  if (!isRecording) return;
  isRecording = false;
  isPaused = false;
  unregisterPauseShortcut();
  unregisterEscShortcut();

  if (recordingProcess) {
    const proc = recordingProcess;
    recordingProcess = null;
    proc.kill("SIGINT");
  }

  // Clean up any saved segments
  for (const seg of audioSegments) {
    try { fs.unlinkSync(seg); } catch {}
  }
  audioSegments = [];

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

// --- Pause shortcut management ---
function registerPauseShortcut() {
  globalShortcut.register("Space", togglePause);
}

function unregisterPauseShortcut() {
  globalShortcut.unregister("Space");
}

function registerEscShortcut() {
  globalShortcut.register("Escape", cancelRecording);
}

function unregisterEscShortcut() {
  globalShortcut.unregister("Escape");
}

// --- Microphone Permission ---
async function ensureMicPermission() {
  const status = systemPreferences.getMediaAccessStatus("microphone");
  if (status === "granted") return true;

  if (status === "not-determined") {
    const granted = await systemPreferences.askForMediaAccess("microphone");
    if (granted) return true;
  }

  // denied, restricted, or prompt failed — open System Settings
  showOverlay("error", "Opening mic settings...");
  hideOverlayAfter(2000);
  const { shell } = require("electron");
  shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone");
  return false;
}

// --- Hotkey Handler ---
async function handleHotkeyDown() {
  if (isRecording) {
    // Already recording — stop and process
    await handleHotkeyUp();
    return;
  }

  if (!(await ensureMicPermission())) return;

  isRecording = true;
  isPaused = false;
  audioSegments = [];
  showOverlay("recording", "Recording...");
  startRecording();
  registerPauseShortcut();
  registerEscShortcut();
}

async function handleHotkeyUp() {
  if (!isRecording) return;
  isRecording = false;
  isPaused = false;
  unregisterPauseShortcut();
  unregisterEscShortcut();

  showOverlay("transcribing", "Transcribing...");

  try {
    const audioPath = await stopRecording();
    if (!audioPath) {
      showOverlay("error", "No audio captured");
      hideOverlayAfter(1500);
      return;
    }

    // Save history entry immediately so recording is never lost
    const entryId = `rec-${Date.now()}`;
    history.addEntry({
      id: entryId,
      audioPath,
      transcript: null,
      status: "transcribing",
      error: null,
      noteId: null,
      createdAt: Date.now(),
    });
    rebuildTrayMenu();

    let transcription;
    try {
      transcription = await transcribeWithTimeout(audioPath, 60000);
    } catch (err) {
      console.error("Transcription error:", err);
      history.updateEntry(entryId, {
        status: "failed",
        error: err.message.slice(0, 100),
      });
      rebuildTrayMenu();
      showOverlay("error", "Error: " + err.message.slice(0, 50));
      hideOverlayAfter(2500);
      return;
    }

    if (!transcription || transcription.trim().length === 0) {
      history.updateEntry(entryId, {
        status: "failed",
        error: "No speech detected",
      });
      rebuildTrayMenu();
      showOverlay("error", "No speech detected");
      hideOverlayAfter(1500);
      return;
    }

    await saveNote(transcription.trim(), audioPath, entryId);
  } catch (err) {
    console.error("Error processing recording:", err);
    showOverlay("error", "Error: " + err.message.slice(0, 50));
    hideOverlayAfter(2500);
  }
}

// Run transcription asynchronously with a timeout to prevent hangs
function transcribeWithTimeout(audioPath, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Transcription timed out"));
    }, timeoutMs);

    // Use setImmediate to yield to the event loop before blocking
    setImmediate(() => {
      try {
        const result = transcribeAudio(audioPath);
        clearTimeout(timer);
        resolve(result);
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  });
}

async function saveNote(transcription, audioPath, entryId) {
  showOverlay("creating", "Saving note...");
  try {
    const noteId = await createNote(transcription);
    pendingSave = null;
    if (entryId) {
      history.updateEntry(entryId, {
        transcript: transcription,
        status: "success",
        error: null,
        noteId,
      });
    } else {
      history.addEntry({
        id: `rec-${Date.now()}`,
        audioPath,
        transcript: transcription,
        status: "success",
        error: null,
        noteId,
        createdAt: Date.now(),
      });
    }
    rebuildTrayMenu();
    showOverlay("done", "Got it ✓");
    hideOverlayAfter(1200);
  } catch (err) {
    console.error("Save failed, keeping recording for retry:", err);
    if (entryId) {
      history.updateEntry(entryId, {
        transcript: transcription,
        status: "failed",
        error: "Save failed: " + err.message.slice(0, 80),
      });
    } else {
      history.addEntry({
        id: `rec-${Date.now()}`,
        audioPath,
        transcript: transcription,
        status: "failed",
        error: "Save failed: " + err.message.slice(0, 80),
        noteId: null,
        createdAt: Date.now(),
      });
    }
    rebuildTrayMenu();
    pendingSave = { transcription, audioPath };
    showOverlay("save-failed", "Save failed — tap to retry");
  }
}

async function retrySave() {
  if (!pendingSave) return;
  const { transcription, audioPath } = pendingSave;
  await saveNote(transcription, audioPath);
}

function dismissSave() {
  if (!pendingSave) return;
  pendingSave = null;
  hideOverlay();
}

// --- Tray Menu ---
function rebuildTrayMenu() {
  if (!tray) return;

  const entries = history.getAll();
  const historyItems = [];

  for (const entry of entries) {
    const prefix = entry.status === "cancelled" ? "[cancelled] " : "";
    const transcript = entry.transcript
      ? entry.transcript.slice(0, 30) + (entry.transcript.length > 30 ? "..." : "")
      : "[No transcript]";
    const icon = entry.status === "success" ? " ✓" : entry.status === "failed" ? " ✗" : "";
    const time = history.relativeTime(entry.createdAt);
    const label = `${prefix}${transcript}${icon}  ${time}`;

    const submenu = [];
    if (entry.audioPath && fs.existsSync(entry.audioPath)) {
      submenu.push({
        label: "Show in Finder",
        click: () => {
          const { shell } = require("electron");
          shell.showItemInFolder(entry.audioPath);
        },
      });
    }
    if (entry.status !== "success") {
      submenu.push({
        label: "Reprocess",
        click: () => reprocessEntry(entry.id),
      });
    }
    historyItems.push({
      label,
      submenu: submenu.length > 0 ? submenu : [{ label: "No audio file", enabled: false }],
    });
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

  // Build input device submenu
  audioInputDevices = listAudioInputDevices();
  const currentDevice = audioInputDevice || getDefaultInputDevice();
  const deviceItems = audioInputDevices.map((dev) => ({
    label: dev.name,
    type: "radio",
    checked: currentDevice === ":" + dev.name,
    click: () => {
      audioInputDevice = ":" + dev.name;
      console.log("Input device changed to:", dev.name);
      rebuildTrayMenu();
    },
  }));

  const template = [
    { label: "Exec Desktop", enabled: false },
    { type: "separator" },
    { label: "Record (Cmd+Option+Space)", click: () => handleHotkeyDown() },
    { type: "separator" },
    {
      label: "Input Device",
      submenu: deviceItems.length > 0
        ? deviceItems
        : [{ label: "No devices found", enabled: false }],
    },
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
    history.removeEntry(entryId);
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
    showOverlay("done", "Got it ✓");
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

// --- Tray Icon ---
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


// --- App Lifecycle ---
app.whenReady().then(async () => {
  history.init();

  // Request mic permission before hiding dock (prompt needs a visible, active app)
  const micStatus = systemPreferences.getMediaAccessStatus("microphone");
  console.log("Mic permission status:", micStatus);
  if (micStatus !== "granted") {
    // App must be visible + frontmost for macOS to show the permission dialog
    app.dock?.show();
    app.focus({ steal: true });
    const granted = await systemPreferences.askForMediaAccess("microphone");
    console.log("Mic permission granted:", granted);
    if (!granted) {
      // Open System Settings as fallback
      const { shell } = require("electron");
      shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone");
    }
  }

  // Hide dock icon — this is a background utility
  app.dock?.hide();

  // Check models exist
  const modelsExist =
    fs.existsSync(path.join(PARAKEET_DIR, "encoder.int8.onnx")) &&
    fs.existsSync(path.join(MODEL_DIR, "silero_vad.onnx"));

  if (!modelsExist) {
    console.error("Models not found. Run: ./desktop/setup-models.sh");
    console.error("Expected at:", MODEL_DIR);
  }

  createOverlay();
  createTray();

  // Listen for overlay UI actions
  ipcMain.on("cancel-recording", cancelRecording);
  ipcMain.on("retry-save", retrySave);
  ipcMain.on("dismiss-save", dismissSave);

  // Register global shortcut
  // We use a single shortcut and track key state via IPC
  const registered = globalShortcut.register("CommandOrControl+Option+Space", () => {
    if (!isRecording) {
      handleHotkeyDown();
    } else {
      handleHotkeyUp();
    }
  });

  if (!registered) {
    console.error("Failed to register global shortcut Cmd+Option+Space");
    console.error("Another app may be using this shortcut.");
  } else {
    console.log("Exec Desktop ready — Cmd+Option+Space to record");
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (recordingProcess) {
    recordingProcess.kill("SIGINT");
  }
});

// Prevent app from quitting when all windows close (it's a tray app)
app.on("window-all-closed", (e) => {
  // Don't quit
});
