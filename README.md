# Exec

Voice-to-action system. Record a voice command on your phone or Mac, and a persistent Claude agent executes it with full Mac access.

## Architecture

```
Phone (Expo) → InstantDB ← Agent (Bun + Claude Agent SDK) ← Desktop (Electron hotkey)
```

Three components:
- **Mobile app** — Expo/React Native. Record voice, view task status + results
- **Agent process** — Bun. Polls InstantDB for tasks, executes via Claude Agent SDK
- **Desktop hotkey** — Electron. `Cmd+Shift+Space` push-to-talk overlay

## Prerequisites

- Node.js 18+
- [Bun](https://bun.sh) (agent process)
- [pnpm](https://pnpm.io) (mobile app)
- [EAS CLI](https://docs.expo.dev/eas/) (`npm install -g eas-cli`)
- [ffmpeg](https://ffmpeg.org) (desktop audio recording) — `brew install ffmpeg`
- Xcode (iOS builds) / Android Studio (Android builds)

## Environment Variables

Copy `.env.example` to `.env` and fill in:

```
EXPO_PUBLIC_INSTANT_APP_ID=       # InstantDB app ID
EXPO_PUBLIC_GROQ_API_KEY=         # Groq API key (Whisper transcription)
INSTANT_APP_ADMIN_TOKEN=          # InstantDB admin token (for agent)
```

The desktop app reads from `desktop/.env`:
```
INSTANT_APP_ID=
INSTANT_ADMIN_TOKEN=
GROQ_API_KEY=
```

## Development

### Mobile App

```bash
pnpm install
pnpm start          # Expo dev server
pnpm ios            # Run on iOS simulator
pnpm android        # Run on Android emulator
```

### Agent Process

```bash
cd agent
bun install
bun run dev         # Start with --watch (auto-restart on changes)
```

The agent polls InstantDB for pending tasks and executes them via the Claude Agent SDK with `bypassPermissions`. It processes tasks FIFO, one at a time.

### Desktop Hotkey App

```bash
cd desktop
npm install
npm start           # Launch Electron app
```

Press `Cmd+Shift+Space` to record. Press again to stop, transcribe, and send to the agent. Runs as a menubar tray app.

## Building & Deploying

### EAS Build (Mobile)

Three build profiles in `eas.json`:

```bash
# Development build (includes dev tools, internal distribution)
eas build --profile development --platform ios

# Preview build (internal distribution, "preview" update channel)
eas build --profile preview --platform ios

# Production build (auto-increment version, "production" update channel)
eas build --profile production --platform ios
```

Replace `ios` with `android` for Android builds.

### OTA Updates (Mobile)

Push over-the-air updates without rebuilding:

```bash
pnpm update:preview      # Push to preview channel
pnpm update:production   # Push to production channel
```

### InstantDB Schema

After modifying `instant.schema.ts` or `instant.perms.ts`:

```bash
npx instant-cli push schema --app $EXPO_PUBLIC_INSTANT_APP_ID --token $INSTANT_APP_ADMIN_TOKEN --yes
npx instant-cli push perms --app $EXPO_PUBLIC_INSTANT_APP_ID --token $INSTANT_APP_ADMIN_TOKEN --yes
```

### Auto-Start on Login (macOS)

launchd plists are provided for both the agent and desktop app:

```bash
# Agent process
ln -s ~/ai/projects/exec/agent/com.exec.agent.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.exec.agent.plist

# Desktop hotkey app
ln -s ~/ai/projects/exec/desktop/com.exec.desktop.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.exec.desktop.plist
```

To stop:
```bash
launchctl unload ~/Library/LaunchAgents/com.exec.agent.plist
launchctl unload ~/Library/LaunchAgents/com.exec.desktop.plist
```

Logs: `/tmp/exec-agent.stdout.log`, `/tmp/exec-desktop.stdout.log`

## Data Model

Two InstantDB entities:

**tasks** — voice commands and their results
| Field | Type | Notes |
|-------|------|-------|
| input | string | Transcribed voice text |
| status | string | pending / running / done / failed / cancelled |
| result | string? | Agent's output (markdown) |
| source | string | phone / mac |
| sessionId | string? | Claude session ID (for follow-ups) |
| liveOutput | string? | Streaming output while running |
| cancelRequested | boolean? | Cancel flag |
| createdAt | number | Timestamp (indexed, FIFO order) |

**messages** — conversation thread per task
| Field | Type | Notes |
|-------|------|-------|
| role | string | user / assistant |
| content | string | Message text |
| createdAt | number | Timestamp |

Link: each message belongs to one task (cascade delete).

## Project Structure

```
exec/
├── agent/                  # Claude Agent SDK process
│   ├── index.ts            # Main loop (FIFO queue, polling, execution)
│   ├── system-prompt.md    # Agent system prompt
│   └── package.json
├── desktop/                # Electron hotkey app
│   ├── main.js             # Main process (global shortcut, recording, transcription)
│   ├── overlay.html        # Floating recording overlay
│   ├── preload.js          # Context bridge
│   └── package.json
├── app/
│   ├── index.tsx           # Home screen (recorder + task list + detail modal)
│   └── _layout.tsx         # Root layout
├── components/
│   ├── RecordingOverlay.tsx # Full-screen recording UI
│   └── Waveform.tsx        # Audio waveform visualization
├── lib/
│   ├── db.ts               # InstantDB client init
│   ├── audio.ts            # Audio file operations
│   └── transcription.ts    # Groq Whisper API
├── hooks/
│   ├── useThemeColors.tsx   # Dark/light theme
│   └── usePushNotifications.tsx
├── constants/Colors.ts     # Design tokens
├── instant.schema.ts       # InstantDB schema (2 entities)
├── instant.perms.ts        # InstantDB permissions
├── eas.json                # EAS build profiles
├── app.config.ts           # Expo config
└── .env                    # Credentials
```
