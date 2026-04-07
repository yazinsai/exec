# Replace Whisper with Parakeet TDT + Silero VAD

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace whisper-cpp transcription in the desktop Electron app with sherpa-onnx (Parakeet TDT 0.6B v2 + Silero VAD) for higher quality offline transcription without hallucination.

**Architecture:** Install `sherpa-onnx-node` npm package, download ONNX models to `~/.local/share/exec/models/`, initialize recognizer + VAD once at app startup, and replace the `transcribeAudio` function to use VAD-segmented recognition instead of shelling out to whisper-cli.

**Tech Stack:** sherpa-onnx-node, Parakeet TDT 0.6B v2 (int8, ~460MB), Silero VAD (~2MB), Electron

---

### File Map

- **Modify:** `desktop/main.js` — Replace whisper constants/imports with sherpa-onnx initialization and VAD-based transcription
- **Modify:** `desktop/package.json` — Add `sherpa-onnx-node` dependency
- **Create:** `desktop/setup-models.sh` — One-time model download script

---

### Task 1: Download Models

**Files:**
- Create: `desktop/setup-models.sh`

- [ ] **Step 1: Create model download script**

```bash
#!/bin/bash
set -e

MODEL_DIR="$HOME/.local/share/exec/models"
mkdir -p "$MODEL_DIR"

# Parakeet TDT 0.6B v2 (int8)
if [ ! -d "$MODEL_DIR/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8" ]; then
  echo "Downloading Parakeet TDT 0.6B v2 (int8)..."
  cd "$MODEL_DIR"
  curl -SL -O https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2
  tar xjf sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2
  rm sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2
  echo "Parakeet model downloaded."
else
  echo "Parakeet model already exists."
fi

# Silero VAD
if [ ! -f "$MODEL_DIR/silero_vad.onnx" ]; then
  echo "Downloading Silero VAD..."
  curl -SL -o "$MODEL_DIR/silero_vad.onnx" https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx
  echo "Silero VAD downloaded."
else
  echo "Silero VAD already exists."
fi

echo "All models ready in $MODEL_DIR"
```

- [ ] **Step 2: Make executable and run**

```bash
chmod +x desktop/setup-models.sh
./desktop/setup-models.sh
```

Expected: Models downloaded to `~/.local/share/exec/models/`. Parakeet dir contains `encoder.int8.onnx`, `decoder.int8.onnx`, `joiner.int8.onnx`, `tokens.txt`.

- [ ] **Step 3: Commit**

```bash
git add desktop/setup-models.sh
git commit -m "Add model download script for Parakeet TDT + Silero VAD (exec)"
```

---

### Task 2: Install sherpa-onnx-node

**Files:**
- Modify: `desktop/package.json`

- [ ] **Step 1: Install the package**

```bash
cd desktop && npm install sherpa-onnx-node
```

This installs the JS bindings + platform-specific native binary (`sherpa-onnx-darwin-arm64`).

- [ ] **Step 2: Verify installation**

```bash
cd desktop && node -e "
process.env.DYLD_LIBRARY_PATH = [
  require('path').join(__dirname, 'node_modules', 'sherpa-onnx-darwin-arm64'),
  process.env.DYLD_LIBRARY_PATH || ''
].filter(Boolean).join(':');
const sherpa = require('sherpa-onnx-node');
console.log('sherpa-onnx-node loaded:', typeof sherpa.OfflineRecognizer);
"
```

Expected: `sherpa-onnx-node loaded: function`

**Note:** If `DYLD_LIBRARY_PATH` doesn't work when set at runtime (macOS SIP restriction), we'll need to set it in the launch script or `package.json` start command instead:

```json
"start": "DYLD_LIBRARY_PATH=./node_modules/sherpa-onnx-darwin-arm64 electron ."
```

- [ ] **Step 3: Commit**

```bash
cd /Users/rock/ai/projects/exec
git add desktop/package.json desktop/package-lock.json
git commit -m "Add sherpa-onnx-node dependency for offline transcription (exec)"
```

---

### Task 3: Replace Whisper with Sherpa-ONNX in main.js

**Files:**
- Modify: `desktop/main.js` (lines 1-31 for imports/constants, lines 160-171 for transcribeAudio)

- [ ] **Step 1: Replace imports and constants**

Remove these lines (26-30):
```js
const WHISPER_MODEL = path.join(
  os.homedir(),
  ".local/share/whisper-cpp/models/ggml-large-v3-turbo.bin"
);
const WHISPER_CLI = "/opt/homebrew/bin/whisper-cli";
```

Replace with sherpa-onnx setup:
```js
const sherpa_onnx = require("sherpa-onnx-node");

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
```

- [ ] **Step 2: Replace transcribeAudio function**

Remove old function (lines 160-171):
```js
async function transcribeAudio(audioPath) {
  const { stdout } = await execFileAsync(WHISPER_CLI, [
    "--model", WHISPER_MODEL,
    "--language", "en",
    "--no-timestamps",
    "--no-prints",
    audioPath,
  ], { timeout: 60000 });

  return stdout.trim();
}
```

Replace with VAD-segmented Parakeet recognition:
```js
function transcribeAudio(audioPath) {
  initRecognizer();
  const wave = sherpa_onnx.readWave(audioPath);
  const vad = createVad();

  const segments = [];
  const windowSize = 512;

  for (let i = 0; i < wave.samples.length; i += windowSize) {
    const chunk = wave.samples.subarray(i, i + windowSize);
    vad.acceptWaveform(chunk);
    while (!vad.isEmpty()) {
      segments.push(vad.front());
      vad.pop();
    }
  }

  vad.flush();
  while (!vad.isEmpty()) {
    segments.push(vad.front());
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
```

Note: The function is now synchronous (sherpa-onnx operations are sync). The caller in `handleHotkeyUp` already uses `await` which is fine — awaiting a non-promise just returns the value.

- [ ] **Step 3: Add model check on startup**

In the `app.whenReady()` block (after line 330), add a model existence check before the hotkey registration:

```js
// Check models exist
const modelsExist =
  fs.existsSync(path.join(PARAKEET_DIR, "encoder.int8.onnx")) &&
  fs.existsSync(path.join(MODEL_DIR, "silero_vad.onnx"));

if (!modelsExist) {
  console.error("Models not found. Run: ./desktop/setup-models.sh");
  console.error("Expected at:", MODEL_DIR);
}
```

- [ ] **Step 4: Update package.json start script for DYLD_LIBRARY_PATH**

If needed (test first without), update the start script:

```json
"start": "DYLD_LIBRARY_PATH=./node_modules/sherpa-onnx-darwin-arm64:$DYLD_LIBRARY_PATH electron ."
```

- [ ] **Step 5: Commit**

```bash
cd /Users/rock/ai/projects/exec
git add desktop/main.js desktop/package.json
git commit -m "Replace whisper-cpp with Parakeet TDT + Silero VAD via sherpa-onnx (exec)"
```

---

### Task 4: Manual Test

- [ ] **Step 1: Start the desktop app**

```bash
cd desktop && npm start
```

Verify console shows: "Parakeet recognizer initialized" (on first transcription) and "Exec Desktop ready — Cmd+Option+Space to record".

- [ ] **Step 2: Record a voice note**

Press Cmd+Option+Space, speak for 10-20 seconds with natural pauses, press again to stop.

Verify:
- Overlay shows "Transcribing..." then "Got it ✓"
- Check InstantDB — note has actual transcript content, not hallucinated filler
- Status should progress to "pending" → triaged by agent

- [ ] **Step 3: Test a longer recording (~2 min)**

Record for ~2 minutes with pauses and varied content. Verify no hallucination, VAD handles silence correctly.

- [ ] **Step 4: Test edge cases**

- Very short recording (<2 sec): Should still transcribe or show "No speech detected"
- Recording with silence at start/end: VAD should trim it
- Cancel mid-recording: Should work as before

---

### Task 5: Cleanup

- [ ] **Step 1: Remove unused imports**

If `execFileAsync` and `promisify` are no longer used elsewhere in main.js, remove:

```js
const { promisify } = require("util");
const execFileAsync = promisify(execFile);
```

Check if `execFile` is still needed for ffmpeg recording — yes it is, keep that import.

- [ ] **Step 2: Commit cleanup**

```bash
cd /Users/rock/ai/projects/exec
git add desktop/main.js
git commit -m "Remove unused whisper imports (exec)"
```
