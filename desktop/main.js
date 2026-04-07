const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  screen,
} = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFile } = require("child_process");

require("dotenv").config({ path: path.join(__dirname, ".env") });

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
let recordingProcess = null;
let tempAudioPath = null;
let hideTimer = null;
let pendingSave = null; // { transcription, audioPath } when save fails

// --- Overlay Window ---
function createOverlay() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  overlay = new BrowserWindow({
    width: 360,
    height: 88,
    x: Math.round((width - 360) / 2),
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

// --- Audio Recording (macOS using sox/rec) ---
function startRecording() {
  tempAudioPath = path.join(
    os.tmpdir(),
    `exec-recording-${Date.now()}.wav`
  );

  // Use ffmpeg with avfoundation for macOS audio capture
  recordingProcess = execFile(
    "/opt/homebrew/bin/ffmpeg",
    [
      "-f", "avfoundation",
      "-i", ":default",
      "-ar", "16000",
      "-ac", "1",
      "-y",
      tempAudioPath,
    ],
    { timeout: 120000 },
    (error) => {
      if (error && error.killed) return; // Normal — we killed it to stop
      if (error) {
        console.error("Recording error:", error.message);
      }
    }
  );
}

function stopRecording() {
  return new Promise((resolve) => {
    if (!recordingProcess) {
      resolve(null);
      return;
    }
    const proc = recordingProcess;
    recordingProcess = null;

    // Send SIGINT for graceful stop (sox/ffmpeg flush file)
    proc.kill("SIGINT");

    // Wait a moment for the file to be finalized
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
      const seg = vad.front();
      segments.push({ samples: new Float32Array(seg.samples), start: seg.start });
      vad.pop();
    }
  }

  vad.flush();
  while (!vad.isEmpty()) {
    const seg = vad.front();
    segments.push({ samples: new Float32Array(seg.samples), start: seg.start });
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

  if (recordingProcess) {
    const proc = recordingProcess;
    recordingProcess = null;
    proc.kill("SIGINT");
  }

  // Clean up temp file
  if (tempAudioPath && fs.existsSync(tempAudioPath)) {
    try { fs.unlinkSync(tempAudioPath); } catch {}
  }
  tempAudioPath = null;

  showOverlay("error", "Cancelled");
  hideOverlayAfter(800);
}

// --- Hotkey Handler ---
async function handleHotkeyDown() {
  if (isRecording) {
    // Already recording — stop and process
    await handleHotkeyUp();
    return;
  }

  isRecording = true;
  showOverlay("recording", "Recording...");
  startRecording();
}

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

    const transcription = await transcribeAudio(audioPath);
    if (!transcription || transcription.trim().length === 0) {
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

async function saveNote(transcription, audioPath) {
  showOverlay("creating", "Saving note...");
  try {
    await createNote(transcription);
    pendingSave = null;
    showOverlay("done", "Got it ✓");
    hideOverlayAfter(1200);
    // Clean up temp file
    try { fs.unlinkSync(audioPath); } catch {}
  } catch (err) {
    console.error("Save failed, keeping recording for retry:", err);
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
  // Clean up temp file
  try { fs.unlinkSync(pendingSave.audioPath); } catch {}
  pendingSave = null;
  hideOverlay();
}

// --- Tray Icon ---
function createTray() {
  // macOS Template icon (auto-adapts to light/dark menu bar)
  const iconPath = path.join(__dirname, "tray-iconTemplate.png");
  const icon2xPath = path.join(__dirname, "tray-iconTemplate@2x.png");
  let icon;

  if (fs.existsSync(icon2xPath)) {
    icon = nativeImage.createFromPath(icon2xPath);
    icon.setTemplateImage(true);
    // Resize to 18x18 points (36px @2x) for proper menu bar sizing
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

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Exec Desktop",
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Record (Cmd+Option+Space)",
      click: () => handleHotkeyDown(),
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(contextMenu);
}


// --- App Lifecycle ---
app.whenReady().then(() => {
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

  // Register Escape as cancel shortcut
  globalShortcut.register("Escape", cancelRecording);

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
