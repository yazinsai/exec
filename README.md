# mic-app

mic-app is a voice-to-action app that captures audio, transcribes it, and extracts actionable items using Claude. Record a voice note on your phone, and actions (bugs, todos, features, questions) are automatically extracted and displayed.

## How it works

```
Phone (mic-app)                        Mac (voice-listener)
      │                                       │
      ├─ Record audio                         │
      ├─ Upload to cloud                      │
      ├─ Transcribe via Groq                  │
      ├─ Write to InstantDB ─────────────────>│ (polls for new recordings)
      │                                       │
      │                                       ├─ Spawn Claude CLI
      │                                       ├─ Extract actions
      │                                       ├─ Write actions to InstantDB
      │<────────── Real-time sync ────────────│
      └─ Display actions in UI                │
```

## Features

- **Voice recording** with pause/resume
- **Auto-transcription** via Groq Whisper
- **Action extraction** via Claude (bugs, features, todos, notes, questions, commands)
- **Real-time sync** between phone and Mac via InstantDB
- **Bottom navbar** with Actions and Recordings tabs

## Development

```bash
# Start the dev server
npm run start

# Push schema changes
npx instant-cli push schema --app $INSTANT_APP_ID --token $INSTANT_ADMIN_TOKEN --yes

# Push permission changes
npx instant-cli push perms --app $INSTANT_APP_ID --token $INSTANT_ADMIN_TOKEN --yes
```

## First-time setup

1. Install deps:
```bash
npm install
```

2. Initialize InstantDB for this project:
```bash
npx instant-cli init
```

3. Create a `.env` file from the example and fill in the values:
```bash
cp .env.example .env
```

Required env vars:
- `EXPO_PUBLIC_INSTANT_APP_ID` (InstantDB app id)
- `EXPO_PUBLIC_GROQ_API_KEY` (Groq API key for transcription)
- `INSTANT_APP_ADMIN_TOKEN` (InstantDB admin token, for CLI commands)

## Voice Listener (Mac)

The `voice-listener/` directory contains a Node.js service that runs on your Mac to extract actions from transcriptions.

### Setup

```bash
cd voice-listener
bun install
```

Create `voice-listener/.env`:
```
INSTANT_APP_ID=your-app-id
INSTANT_ADMIN_TOKEN=your-admin-token
```

### Running

```bash
# Test with one recording (dry run - no DB changes)
bun run src/index.ts --dry-run --once --limit 1

# Process one recording for real
bun run src/index.ts --once --limit 1

# Run continuously (production)
bun run src/index.ts
```

Options:
- `--dry-run` - Extract actions but don't save to database
- `--once` - Process once and exit (don't poll continuously)
- `--limit N` - Only process N recordings

## Build an Android APK (EAS)

This project uses Expo Application Services (EAS) to build APKs in the cloud.

1. Install and log in to EAS:
```bash
npm i -g eas-cli
eas login
```

2. Build an APK (internal distribution):
```bash
eas build -p android --profile preview
```

3. When the build finishes, download the APK from the build page link.

## Install on iOS (EAS)

Build an internal .ipa:
```bash
eas build -p ios --profile preview
```

For TestFlight distribution:
```bash
eas build -p ios --profile production
eas submit -p ios --latest
```

Notes:
- You'll need an Apple Developer account for iOS builds.
- `app.json` includes the iOS bundle ID: `com.yazinsai.micapp`.

## App configuration

Icons, splash, and adaptive icons live in `assets/images/` and are referenced from `app.json`.

Got any feedback or questions? Join our [Discord](https://discord.gg/hgVf9R6SBm)
