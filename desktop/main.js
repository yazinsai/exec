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

// Also try parent .env for GROQ key
if (!process.env.GROQ_API_KEY) {
  require("dotenv").config({
    path: path.join(__dirname, "..", ".env"),
    override: false,
  });
  if (process.env.EXPO_PUBLIC_GROQ_API_KEY && !process.env.GROQ_API_KEY) {
    process.env.GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY;
  }
}

const { init, id: instantId } = require("@instantdb/admin");

// --- InstantDB setup ---
const INSTANT_APP_ID =
  process.env.INSTANT_APP_ID || "7e356cba-464a-4cee-a177-0e731e0853b9";
const INSTANT_ADMIN_TOKEN =
  process.env.INSTANT_ADMIN_TOKEN || "1e86bcda-bcd6-4dde-ab34-cda3abd6af4e";
const GROQ_API_KEY =
  process.env.GROQ_API_KEY || process.env.EXPO_PUBLIC_GROQ_API_KEY;

if (!GROQ_API_KEY) {
  console.error("Missing GROQ_API_KEY in environment");
  process.exit(1);
}

const db = init({ appId: INSTANT_APP_ID, adminToken: INSTANT_ADMIN_TOKEN });

let overlay = null;
let tray = null;
let isRecording = false;
let recordingProcess = null;
let tempAudioPath = null;

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
    movable: false,
    hasShadow: false,
    focusable: false,
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
  if (!overlay) createOverlay();
  overlay.webContents.send("state-change", { state, text });
  if (!overlay.isVisible()) {
    overlay.showInactive();
  }
}

function hideOverlay() {
  if (overlay && overlay.isVisible()) {
    overlay.hide();
  }
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

// --- Groq Transcription ---
async function transcribeAudio(audioPath) {
  const FormData = require("form-data");
  const fetch = require("node-fetch");

  const form = new FormData();
  form.append("file", fs.createReadStream(audioPath), {
    filename: "recording.wav",
    contentType: "audio/wav",
  });
  form.append("model", "whisper-large-v3-turbo");
  form.append("language", "en");

  const response = await fetch(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        ...form.getHeaders(),
      },
      body: form,
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Groq API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  return data.text;
}

// --- InstantDB Task Creation ---
async function createTask(transcription) {
  const taskId = instantId();
  const messageId = instantId();
  const now = Date.now();

  await db.transact([
    db.tx.tasks[taskId].update({
      input: transcription,
      status: "pending",
      source: "mac",
      createdAt: now,
    }),
    db.tx.messages[messageId]
      .update({
        role: "user",
        content: transcription,
        createdAt: now,
      })
      .link({ task: taskId }),
  ]);

  return taskId;
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
      setTimeout(hideOverlay, 1500);
      return;
    }

    const transcription = await transcribeAudio(audioPath);
    if (!transcription || transcription.trim().length === 0) {
      showOverlay("error", "No speech detected");
      setTimeout(hideOverlay, 1500);
      return;
    }

    showOverlay("creating", "Creating task...");
    await createTask(transcription.trim());

    showOverlay("done", "Got it ✓");
    setTimeout(hideOverlay, 1200);

    // Clean up temp file
    try {
      fs.unlinkSync(audioPath);
    } catch {}
  } catch (err) {
    console.error("Error processing recording:", err);
    showOverlay("error", "Error: " + err.message.slice(0, 50));
    setTimeout(hideOverlay, 2500);
  }
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
  tray.setToolTip("Exec — Cmd+Shift+Space to record");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Exec Desktop",
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Record (Cmd+Shift+Space)",
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

  createOverlay();
  createTray();

  // Register global shortcut
  // We use a single shortcut and track key state via IPC
  const registered = globalShortcut.register("CommandOrControl+Shift+Space", () => {
    if (!isRecording) {
      handleHotkeyDown();
    } else {
      handleHotkeyUp();
    }
  });

  if (!registered) {
    console.error("Failed to register global shortcut Cmd+Shift+Space");
    console.error("Another app may be using this shortcut.");
  } else {
    console.log("Exec Desktop ready — Cmd+Shift+Space to record");
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
