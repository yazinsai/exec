# Exec Home Screen Redesign

**Date:** 2026-04-02
**Goal:** Transform the home screen from a history-focused list into a live command center that prioritizes active tasks, with a dominant floating record button and a lightweight recording bottom sheet.

## Screen Layout

The screen is divided into three layers:

1. **Fixed top area** — Header ("Exec") + Active Tasks section
2. **Scrollable area** — History FlatList
3. **Floating layer** — FAB (always visible) + Recording bottom sheet (when recording)

Active Tasks is a plain `View` above the FlatList, not inside it. It stays pinned at the top and never scrolls. When no tasks are active, the section collapses entirely and history gets full vertical space.

```
┌─────────────────────────┐
│  Exec                   │
├─────────────────────────┤
│  ┌───────────────────┐  │  ← Active Tasks (fixed)
│  │ Running task card  │  │     Max 3, vertical stack, 8px gap
│  └───────────────────┘  │
├─────────────────────────┤
│  RECENT                 │  ← History (scrollable)
│  Compact list item      │
│  Compact list item      │
│  ...                    │
│                         │
│         ◉               │  ← FAB (floating, bottom-center)
└─────────────────────────┘
```

### Task splitting logic

```ts
const activeTasks = tasks
  .filter(t => t.status === "running" || t.status === "pending")
  .sort((a, b) => {
    // running before pending
    if (a.status === "running" && b.status !== "running") return -1;
    if (b.status === "running" && a.status !== "running") return 1;
    return b.createdAt - a.createdAt;
  })
  .slice(0, 3);

// Exclude ALL active tasks from history, not just the displayed 3
const allActiveIds = new Set(
  tasks.filter(t => t.status === "running" || t.status === "pending").map(t => t.id)
);
const historyTasks = tasks
  .filter(t => !allActiveIds.has(t.id))
  .sort((a, b) => b.createdAt - a.createdAt);
```

## Active Task Cards

Elevated cards with color-coded left border.

```
┌──┬────────────────────────────┐
│▌ │  Deploy API to staging      │  title (summary || input), 2 lines max
│▌ │  Executing · 2m 34s         │  status label + elapsed time
│▌ │                    View  ✕  │  view detail / cancel
└──┴────────────────────────────┘
```

### Styling
- Background: `colors.backgroundElevated` (#111)
- Left border: 3px width
  - Running: `colors.statusRunning` (blue)
  - Pending: `colors.statusPending` (gray)
- Title: `fontFamily.medium`, `typography.base`, `colors.textPrimary`, max 2 lines
- Status line: `typography.xs`, status color text
- Running cards: pulse animation on left border opacity (reanimated `withRepeat` + `withSequence`, 0.4 → 1.0, 800ms cycle)
- Elapsed time: computed from `startedAt ?? createdAt` (running) or `createdAt` (pending), updated every second via `setInterval`. Fallback handles legacy tasks without `startedAt`.
- Pending cards show "Queued" instead of elapsed time, no cancel button
- "View" button opens existing detail modal
- "✕" button sets `cancelRequested: true`. Once pressed, replace with "Cancelling..." label (disabled state) — agent processes the flag asynchronously

### Empty state
Section doesn't render at all. No placeholder text.

## History List Items

Compact, flat rows. No elevation, no cards.

```
  Deploy landing page                    2h ago  ✓
  Research competitor pricing            1d ago  ✓
  Fix auth token refresh bug             3d ago  ✗
```

### Styling
- Background: transparent (sits on `colors.background`)
- Title: `fontFamily.regular`, `typography.base`, `colors.textPrimary`, single line, truncated
- Right side: relative timestamp (`colors.textTertiary`, `typography.xs`) + status icon (13px)
  - Done: `checkmark-circle`, `colors.statusDone` (green)
  - Failed: `alert-circle`, `colors.statusFailed` (red)
  - Cancelled: `close-circle`, `colors.statusCancelled` (amber)
- No chevrons, no status dots, no preview text
- Row padding: `spacing.md` vertical, `spacing.lg` horizontal
- Pressable → opens detail modal
- No separators — padding provides spacing

## FAB (Floating Action Button)

### Position & size
- `position: "absolute"`, bottom offset = `safeAreaBottom + 16`, horizontally centered via `left/right: 0` + `alignItems: "center"` wrapper
- 64px circle
- FlatList bottom padding = `safeAreaBottom + 64 + 32` (FAB height + breathing room)

### Idle state
- Background: `colors.primary` (gold)
- Icon: Ionicons `mic`, 28px, `colors.white`
- Shadow: `shadows.gold`

### Recording state
- Background: `colors.error` (red)
- Icon: Ionicons `stop`, 24px, `colors.white`
- Pulse animation: scale 1.0 → 1.06, 1000ms cycle (reanimated)

### Press feedback
- Scale to 0.92 via `withSpring`

## Recording Bottom Sheet

Replaces the full-screen `RecordingOverlay`. Built with reanimated + gesture handler (no new deps).

### Trigger
FAB tap → start recording → on success, sheet slides up. If recording fails to start (permission denied, audio error), FAB stays idle — no sheet. Permission is checked on mount (existing behavior).

### Layout (280px height)
```
┌─────────────────────────────────┐
│           ─── (drag handle)     │  36x4 pill, colors.textMuted
│                                 │
│   ● Recording         00:12.0   │  pulsing red dot + label + duration
│                                 │
│   ||||| |||| ||||||||| ||||     │  Waveform component (reused)
│                                 │
│   Delete              Done      │  text buttons
└─────────────────────────────────┘
```

### Styling
- Background: `colors.backgroundElevated`
- Border radius: `radii.xl` (16) on top corners only
- Slides up with `withSpring({ damping: 20, stiffness: 200 })`
- Backdrop: `colors.overlay` (semi-transparent black), fade in

### Behavior
- No pause/resume — just record and done
- Swipe down to dismiss = cancel recording (same as Delete)
- "Done" = stop recording → sheet transitions to "Transcribing..." state (spinner replaces waveform, controls disabled) → task created → sheet dismisses
- If transcription fails or returns empty, show brief error text in sheet ("No speech detected" / "Transcription failed"), then dismiss after 1.5s
- New task appears in Active section with "pending" status once transcription completes
- Waveform: reuse existing `Waveform` component, ~100px height
- Duration: same format as current overlay (`MM:SS.0`)

### Recording guards
- `startRecording` must check `recordingRef.current` is null before creating a new recording (prevent overlapping sessions)
- Add `isProcessing` state flag — set true during transcription, prevents FAB re-tap
- `cancelRecording` must call `Audio.setAudioModeAsync({ allowsRecordingIOS: false })` to properly reset iOS audio session (matching `stopRecording` behavior)

### Controls
- "Delete" (left): `colors.error` text, cancels recording, dismisses sheet
- "Done" (right): `colors.primary` text, stops recording, shows transcribing state

## Component Architecture

### New files
| File | Purpose |
|------|---------|
| `components/ActiveTaskCard.tsx` | Card with pulse animation, elapsed timer, view/cancel |
| `components/TaskListItem.tsx` | Compact history row with timestamp + status icon |
| `components/RecordFAB.tsx` | Floating mic button, idle/recording states |
| `components/RecordingSheet.tsx` | Bottom sheet with waveform, duration, delete/done |

### Modified files
| File | Changes |
|------|---------|
| `app/index.tsx` | Rewrite layout: fixed active section + history FlatList + FAB. Remove inline record button. Keep recording logic, detail modal, follow-up handling. |

### Unchanged
- `constants/Colors.ts` — all design tokens already exist
- `components/Waveform.tsx` — reused in RecordingSheet
- `components/RecordingOverlay.tsx` — left in place, just unused
- `lib/*` — recording, transcription, audio, db utilities
- `instant.schema.ts` — no data model changes
- Detail modal — messages, follow-up input, live activity feed all unchanged

### Data flow
- Two queries to avoid missing old running tasks:
  - Main: `db.useQuery({ tasks: { $: { order: { createdAt: "desc" }, limit: 50 }, messages: {} } })` — recent tasks for history
  - Active: `db.useQuery({ tasks: { $: { where: { or: [{ status: "running" }, { status: "pending" }] } }, messages: {} } })` — all active tasks regardless of age, with messages for detail modal
- Merge and deduplicate by task ID (active query wins on conflict to ensure fresh data), then split into `activeTasks` and `historyTasks` arrays
- Recording callbacks (`startRecording`, `stopRecording`, `cancelRecording`) passed from HomeScreen to FAB + Sheet
- `selectedTask` state + detail modal remain in HomeScreen

### Dependencies
None added. Uses `react-native-reanimated` and `react-native-gesture-handler` (already installed).
