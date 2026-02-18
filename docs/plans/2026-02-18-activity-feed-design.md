# Activity Feed Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the project-grouped Actions tab with a flat chronological activity feed of action summaries, filterable by project via horizontal chip bar.

**Architecture:** Rewrite `ActivityFeed.tsx` to render a FlatList of action-level summary cards sorted by recency, with a horizontal ScrollView of project filter chips at the top. Simplify `index.tsx` to remove the `selectedProject` / `ProjectTimeline` gating since filtering now happens inside the feed.

**Tech Stack:** React Native, Expo, InstantDB (read-only — no schema changes), NativeWind-free (uses StyleSheet + design tokens from `constants/Colors.ts`)

---

### Task 1: Rewrite ActivityFeed — project filter chips

**Files:**
- Modify: `components/ActivityFeed.tsx` (full rewrite, keep helpers)

**Step 1: Strip old components, keep helpers**

Remove `ViewModeToggle`, `ProjectCard`, `UngroupedActionCard`, `RunningActionRow`, and the `ViewMode` type. Keep these helpers at the top of the file:
- `formatRelativeTime` (lines 36-48)
- `getStatusColor` (lines 50-70)
- `getStatusLabel` (lines 72-89)
- `PulsingDot` component (lines 92-119)
- `parseProgress` (lines 121-130)

**Step 2: Build project chips data**

Add a `useMemo` that computes the list of projects from the `actions` prop:

```tsx
interface ProjectChip {
  projectPath: string;
  label: string;
  lastActivity: number;
  hasRunning: boolean;
}

const projectChips = useMemo(() => {
  const map = new Map<string, { lastActivity: number; hasRunning: boolean }>();
  for (const a of actions) {
    if (!a.projectPath) continue;
    const ts = a.lastEventAt ?? a.completedAt ?? a.startedAt ?? a.extractedAt;
    const existing = map.get(a.projectPath);
    if (!existing || ts > existing.lastActivity) {
      map.set(a.projectPath, {
        lastActivity: ts,
        hasRunning: (existing?.hasRunning || false) || a.status === "in_progress",
      });
    } else if (a.status === "in_progress") {
      existing.hasRunning = true;
    }
  }
  return Array.from(map.entries())
    .map(([projectPath, data]) => ({
      projectPath,
      label: getProjectLabel(projectPath),
      lastActivity: data.lastActivity,
      hasRunning: data.hasRunning,
    }))
    .sort((a, b) => b.lastActivity - a.lastActivity);
}, [actions]);
```

**Step 3: Render the chip bar**

Add a `ProjectFilterBar` component rendered as the `ListHeaderComponent` of the FlatList:

```tsx
function ProjectFilterBar({
  chips,
  selected,
  onSelect,
}: {
  chips: ProjectChip[];
  selected: string | null;
  onSelect: (projectPath: string | null) => void;
}) {
  const { colors } = useThemeColors();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipBar}
    >
      {/* "All" chip */}
      <Pressable
        style={[
          styles.chip,
          {
            backgroundColor: !selected ? colors.primary + "20" : colors.backgroundElevated,
          },
        ]}
        onPress={() => onSelect(null)}
      >
        <Text
          style={[
            styles.chipText,
            { color: !selected ? colors.primary : colors.textTertiary },
          ]}
        >
          All
        </Text>
      </Pressable>

      {chips.map((chip) => {
        const isSelected = selected === chip.projectPath;
        return (
          <Pressable
            key={chip.projectPath}
            style={[
              styles.chip,
              {
                backgroundColor: isSelected
                  ? colors.primary + "20"
                  : colors.backgroundElevated,
              },
            ]}
            onPress={() => onSelect(isSelected ? null : chip.projectPath)}
          >
            <View style={styles.chipContent}>
              {chip.hasRunning && <PulsingDot color={colors.primary} />}
              <Text
                style={[
                  styles.chipText,
                  { color: isSelected ? colors.primary : colors.textTertiary },
                ]}
                numberOfLines={1}
              >
                {chip.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
```

Styles to add:

```tsx
chipBar: {
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.sm,
  gap: spacing.sm,
},
chip: {
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.xs + 2,
  borderRadius: radii.full,
},
chipContent: {
  flexDirection: "row",
  alignItems: "center",
  gap: 4,
},
chipText: {
  fontSize: typography.xs,
  fontWeight: "600",
},
```

**Step 4: Commit**

```bash
git add components/ActivityFeed.tsx
git commit -m "feat: add project filter chips to activity feed"
```

---

### Task 2: Build the feed item component

**Files:**
- Modify: `components/ActivityFeed.tsx`

**Step 1: Build the `FeedItem` card component**

```tsx
function FeedCard({
  action,
  onPress,
}: {
  action: Action;
  onPress?: () => void;
}) {
  const { colors } = useThemeColors();
  const statusColor = getStatusColor(action.status, colors);
  const statusLabel = getStatusLabel(action.status);
  const isRunning = action.status === "in_progress";
  const progress = parseProgress(action.progress);

  // Determine subtitle: current activity for running, or latest result snippet
  let subtitle = "";
  if (isRunning && progress?.currentActivity) {
    subtitle = progress.currentActivity;
  } else if (action.status === "failed" && action.errorMessage) {
    subtitle = action.errorMessage;
  } else if (action.status === "completed" && action.result) {
    // First non-empty line of result, stripped of markdown
    subtitle = action.result
      .split("\n")
      .find((l) => l.trim().length > 0)
      ?.replace(/[#*`_~\[\]]/g, "")
      .trim() ?? "";
  } else if (action.description) {
    subtitle = action.description;
  }

  const timestamp = action.lastEventAt ?? action.completedAt ?? action.startedAt ?? action.extractedAt;
  const projectLabel = action.projectPath ? getProjectLabel(action.projectPath) : null;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.feedCard,
        { backgroundColor: colors.backgroundElevated },
        pressed && styles.pressed,
      ]}
      onPress={onPress}
    >
      {/* Row 1: status + project + time */}
      <View style={styles.feedRow1}>
        <View style={styles.feedStatusRow}>
          {isRunning ? (
            <PulsingDot color={statusColor} />
          ) : (
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          )}
          <Text style={[styles.feedStatusLabel, { color: statusColor }]}>
            {statusLabel}
          </Text>
        </View>
        <View style={styles.feedMeta}>
          {projectLabel && (
            <Text style={[styles.feedProject, { color: colors.textMuted }]} numberOfLines={1}>
              {projectLabel}
            </Text>
          )}
          <Text style={[styles.feedTime, { color: colors.textMuted }]}>
            {formatRelativeTime(timestamp)}
          </Text>
        </View>
      </View>

      {/* Row 2: title */}
      <Text
        style={[styles.feedTitle, { color: colors.textPrimary }]}
        numberOfLines={1}
      >
        {action.title}
      </Text>

      {/* Row 3: subtitle */}
      {subtitle ? (
        <Text
          style={[styles.feedSubtitle, { color: colors.textTertiary }]}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}
```

Styles to add:

```tsx
feedCard: {
  marginHorizontal: spacing.lg,
  marginBottom: spacing.sm,
  padding: spacing.md,
  borderRadius: radii.lg,
},
feedRow1: {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 4,
},
feedStatusRow: {
  flexDirection: "row",
  alignItems: "center",
  gap: 6,
},
statusDot: {
  width: 8,
  height: 8,
  borderRadius: 4,
},
feedStatusLabel: {
  fontSize: typography.xs,
  fontWeight: "600",
},
feedMeta: {
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
},
feedProject: {
  fontSize: typography.xs,
  maxWidth: 100,
},
feedTime: {
  fontSize: typography.xs,
},
feedTitle: {
  fontSize: typography.sm,
  fontFamily: fontFamily.semibold,
  fontWeight: "600",
  marginBottom: 2,
},
feedSubtitle: {
  fontSize: typography.xs,
  lineHeight: typography.xs * 1.4,
},
```

**Step 2: Commit**

```bash
git add components/ActivityFeed.tsx
git commit -m "feat: add FeedCard component for action summaries"
```

---

### Task 3: Wire up the main ActivityFeed component

**Files:**
- Modify: `components/ActivityFeed.tsx`

**Step 1: Rewrite the main `ActivityFeed` export**

```tsx
export function ActivityFeed({
  actions,
  onActionPress,
}: ActivityFeedProps) {
  const { colors } = useThemeColors();
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  // Project chips data
  const projectChips = useMemo(() => { /* ... from Task 1 Step 2 ... */ }, [actions]);

  // Filtered and sorted actions
  const feedActions = useMemo(() => {
    let filtered = actions.filter((a) => a.status !== "cancelled");

    if (selectedProject) {
      filtered = filtered.filter((a) => a.projectPath === selectedProject);
    }

    return filtered.sort((a, b) => {
      const aTime = a.lastEventAt ?? a.completedAt ?? a.startedAt ?? a.extractedAt;
      const bTime = b.lastEventAt ?? b.completedAt ?? b.startedAt ?? b.extractedAt;
      return bTime - aTime;
    });
  }, [actions, selectedProject]);

  if (actions.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="flash-outline" size={40} color={colors.primary} />
        <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
          NO ACTIONS YET
        </Text>
        <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
          Record a voice note and actions{"\n"}will be extracted automatically
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={feedActions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <FeedCard action={item} onPress={() => onActionPress?.(item)} />
        )}
        ListHeaderComponent={
          <ProjectFilterBar
            chips={projectChips}
            selected={selectedProject}
            onSelect={setSelectedProject}
          />
        }
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
```

Update `ActivityFeedProps` — remove `onProjectPress` since filtering is now internal:

```tsx
interface ActivityFeedProps {
  actions: Action[];
  onActionPress?: (action: Action) => void;
}
```

**Step 2: Commit**

```bash
git add components/ActivityFeed.tsx
git commit -m "feat: wire up activity feed with filter chips and sorted feed list"
```

---

### Task 4: Simplify index.tsx — remove ProjectTimeline gating

**Files:**
- Modify: `app/index.tsx:441-442` (remove `selectedProject` state)
- Modify: `app/index.tsx:604-605` (simplify header title logic)
- Modify: `app/index.tsx:718-731` (simplify actions tab render)
- Modify: `app/index.tsx:743-748` (remove selectedProject reset on tab switch)

**Step 1: Remove `selectedProject` state and ProjectTimeline import**

In `app/index.tsx`:

- Remove line 442: `const [selectedProject, setSelectedProject] = useState<string | null>(null);`
- Remove import of `ProjectTimeline` (line 28)
- Remove import of `ActivityFeed`'s `onProjectPress` usage

**Step 2: Simplify the actions tab render block (lines 718-731)**

Replace:
```tsx
{activeTab === "actions" ? (
  selectedProject ? (
    <ProjectTimeline
      projectPath={selectedProject}
      onBack={() => setSelectedProject(null)}
      onActionPress={handleActionPress}
    />
  ) : (
    <ActivityFeed
      actions={allActions}
      onActionPress={handleActionPress}
      onProjectPress={(projectPath) => setSelectedProject(projectPath)}
    />
  )
) : (
```

With:
```tsx
{activeTab === "actions" ? (
  <ActivityFeed
    actions={allActions}
    onActionPress={handleActionPress}
  />
) : (
```

**Step 3: Simplify header logic (lines 604-605)**

Replace:
```tsx
const headerTitle = activeTab === "actions" ? "Actions" : "Recordings";
const showHeader = !(activeTab === "actions" && selectedProject);
```

With:
```tsx
const headerTitle = activeTab === "actions" ? "Actions" : "Recordings";
const showHeader = true;
```

(Or just remove `showHeader` and always show the header.)

**Step 4: Remove `setSelectedProject(null)` from tab switch (line 747)**

In the `BottomNavBar` `onTabPress` callback, remove the `setSelectedProject(null)` line.

**Step 5: Remove selectedProject from recording overlay context (line 768)**

Replace `projectContext={selectedProject}` with `projectContext={null}` or remove the prop if unused.

**Step 6: Commit**

```bash
git add app/index.tsx components/ActivityFeed.tsx
git commit -m "feat: simplify actions tab to render activity feed directly"
```

---

### Task 5: Clean up unused imports and components

**Files:**
- Modify: `app/index.tsx` — remove unused `ProjectTimeline` import
- Verify: `components/ProjectTimeline.tsx` — keep file (may be used later), just ensure it's not imported where not needed
- Verify: `components/ActionsScreen.tsx` — no longer imported by ActivityFeed; check if it's imported anywhere else

**Step 1: Audit imports**

Check that `ActionsScreen` is no longer imported in `ActivityFeed.tsx` (it was imported on line 11 of the old version — should be gone after the rewrite).

Check that `ProjectTimeline` is no longer imported in `index.tsx`.

**Step 2: Commit final cleanup**

```bash
git add app/index.tsx components/ActivityFeed.tsx
git commit -m "chore: remove unused imports after activity feed rewrite"
```
