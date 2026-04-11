import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Keyboard,
  Alert,
  StyleSheet,
} from "react-native";
import Constants from "expo-constants";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Markdown from "react-native-markdown-display";
import MarkdownIt from "markdown-it";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import * as Updates from "expo-updates";
import { Iconify } from "react-native-iconify";
import { id } from "@instantdb/react-native";
import { db } from "@/lib/db";
import { transcribeAudio, buildDictionaryPrompt } from "@/lib/transcription";
import type { DictionaryTerm } from "@/lib/transcription";
import { summarizeInput } from "@/lib/summarize";
import {
  requestAudioPermissions,
  configureAudioMode,
  saveRecordingLocally,
  RECORDING_OPTIONS,
  RECORDINGS_DIR,
} from "@/lib/audio";
import {
  enqueueRecording,
  getQueue,
  removeFromQueue,
} from "@/lib/offlineQueue";
import { Audio } from "expo-av";
import { NoteListItem } from "@/components/NoteListItem";
import { TaskListItem } from "@/components/TaskListItem";
import { RecordFAB } from "@/components/RecordFAB";
import { RecordingSheet } from "@/components/RecordingSheet";
import { DictionarySheet } from "@/components/DictionarySheet";
import { useThemeColors } from "@/hooks/useThemeColors";
import {
  spacing,
  typography,
  radii,
  fontFamily,
  shadows,
} from "@/constants/Colors";
import { shortenRunTitle } from "@/lib/displayCopy";
import {
  NOTE_STATUSES,
  noteIsSettledForHistory,
  SUMMARY_PLACEHOLDER,
  TASK_STATUSES,
} from "@/lib/workflow";
import type { InstaQLEntity } from "@instantdb/react-native";
import type { AppSchema } from "@/instant.schema";
import type { ThemeColors } from "@/constants/Colors";

const markdownItInstance = MarkdownIt({ typographer: true, linkify: true });

type Task = InstaQLEntity<AppSchema, "tasks", {
  messages: {};
  project: {};
  dependencies: { dependsOn: {} };
}>;
type Note = InstaQLEntity<AppSchema, "notes", {
  tasks: {
    messages: {};
    project: {};
    dependencies: { dependsOn: {} };
  };
}>;

function noteHasTaskWithStatus(note: Note, status: string): boolean {
  return ((note.tasks ?? []) as Task[]).some((t) => t.status === status);
}

type Message = InstaQLEntity<AppSchema, "messages">;

function getStatusColor(status: string, colors: ThemeColors): string {
  const map: Record<string, string> = {
    pending: colors.statusPending,
    blocked: colors.warning,
    running: colors.statusRunning,
    done: colors.statusDone,
    failed: colors.statusFailed,
    cancelled: colors.statusCancelled,
    transcribing: colors.warning,
    transcription_failed: colors.statusFailed,
  };
  return map[status] ?? colors.statusPending;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  blocked: "Blocked",
  running: "Running",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
  transcribing: "Transcribing",
  transcription_failed: "Transcription Failed",
};

// Tool icon mapping
const TOOL_ICONS: Record<string, { icon: string; label: string }> = {
  Read: { icon: "solar:document-text-linear", label: "Reading" },
  Write: { icon: "solar:pen-new-square-linear", label: "Writing" },
  Edit: { icon: "solar:pen-linear", label: "Editing" },
  Glob: { icon: "solar:magnifer-linear", label: "Finding files" },
  Grep: { icon: "solar:code-linear", label: "Searching" },
  Bash: { icon: "solar:monitor-linear", label: "Running" },
  Agent: { icon: "solar:share-circle-linear", label: "Subagent" },
  WebSearch: { icon: "solar:global-linear", label: "Searching web" },
  WebFetch: { icon: "solar:cloud-download-linear", label: "Fetching" },
  Skill: { icon: "solar:bolt-linear", label: "Using skill" },
};

type ActivityItem = {
  type: "tool" | "text" | "thinking";
  name?: string;
  detail?: string;
  content?: string;
  ts: number;
};

function ActivityRow({
  item,
  isLatest,
  opacity,
  colors,
}: {
  item: ActivityItem;
  isLatest: boolean;
  opacity: number;
  colors: ThemeColors;
}) {
  if (item.type === "tool") {
    const toolInfo = TOOL_ICONS[item.name || ""] || {
      icon: "solar:menu-dots-linear",
      label: item.name || "Tool",
    };
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
          opacity,
          paddingVertical: 3,
        }}
      >
        <Iconify
          icon={toolInfo.icon as any}
          size={14}
          color={isLatest ? colors.statusRunning : colors.textTertiary}
        />
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            color: isLatest ? colors.textPrimary : colors.textSecondary,
            fontSize: typography.sm,
            fontFamily: isLatest ? fontFamily.medium : fontFamily.regular,
            lineHeight: 18,
          }}
        >
          <Text style={{ color: isLatest ? colors.statusRunning : colors.textTertiary }}>
            {toolInfo.label}
          </Text>
          {item.detail ? (
            <Text style={{ color: isLatest ? colors.textSecondary : colors.textTertiary }}>
              {"  "}
              {item.detail}
            </Text>
          ) : null}
        </Text>
      </View>
    );
  }

  if (item.type === "thinking") {
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
          opacity,
          paddingVertical: 3,
        }}
      >
        <Iconify
          icon="solar:lightbulb-linear"
          size={14}
          color={isLatest ? colors.thinking : colors.textTertiary}
        />
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            color: isLatest ? colors.textSecondary : colors.textTertiary,
            fontSize: typography.sm,
            fontFamily: fontFamily.regular,
            fontStyle: "italic",
            lineHeight: 18,
          }}
        >
          {item.content}
        </Text>
      </View>
    );
  }

  // text type
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        opacity,
        paddingVertical: 3,
      }}
    >
      <Iconify
        icon="solar:chat-round-linear"
        size={14}
        color={isLatest ? colors.textSecondary : colors.textTertiary}
      />
      <Text
        numberOfLines={2}
        style={{
          flex: 1,
          color: isLatest ? colors.textSecondary : colors.textTertiary,
          fontSize: typography.sm,
          fontFamily: fontFamily.regular,
          lineHeight: 18,
        }}
      >
        {item.content}
      </Text>
    </View>
  );
}

const COLLAPSED_COUNT = 8;

function LiveActivityFeed({
  liveOutput,
  colors,
}: {
  liveOutput: string;
  colors: ThemeColors;
}) {
  const [expanded, setExpanded] = useState(false);

  let items: ActivityItem[] = [];
  try {
    items = JSON.parse(liveOutput);
  } catch {
    // Fallback for plain text liveOutput (backward compat)
    return (
      <View
        style={{
          backgroundColor: colors.backgroundElevated,
          borderRadius: radii.md,
          padding: spacing.md,
          marginBottom: spacing.lg,
          borderLeftWidth: 3,
          borderLeftColor: colors.statusRunning,
        }}
      >
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: typography.sm,
            fontFamily: fontFamily.mono,
            lineHeight: 20,
          }}
        >
          {liveOutput}
        </Text>
      </View>
    );
  }

  if (!Array.isArray(items) || items.length === 0) return null;

  const canExpand = items.length > COLLAPSED_COUNT;
  const visible = expanded ? items : items.slice(-COLLAPSED_COUNT);
  const hiddenCount = items.length - COLLAPSED_COUNT;

  return (
    <View
      style={{
        marginBottom: spacing.lg,
        gap: 6,
      }}
    >
      {/* Activity header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.xs,
          marginBottom: 4,
        }}
      >
        <ActivityIndicator size="small" color={colors.statusRunning} />
        <Text
          style={{
            color: colors.statusRunning,
            fontSize: typography.xs,
            fontFamily: fontFamily.semibold,
            textTransform: "uppercase",
            letterSpacing: typography.tracking.wider,
          }}
        >
          Working
        </Text>
        {canExpand && (
          <Text
            style={{
              color: colors.textTertiary,
              fontSize: typography.xs,
              fontFamily: fontFamily.regular,
              marginLeft: "auto",
            }}
          >
            {items.length} steps
          </Text>
        )}
      </View>

      {/* Tap to expand collapsed area */}
      {canExpand && !expanded && (
        <Pressable
          onPress={() => setExpanded(true)}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: spacing.xs,
            paddingVertical: spacing.sm,
            marginBottom: 2,
            borderRadius: radii.sm,
            backgroundColor: pressed
              ? colors.backgroundPressed
              : colors.backgroundSubtle,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Iconify icon="solar:alt-arrow-up-linear" size={14} color={colors.textTertiary} />
          <Text
            style={{
              color: colors.textTertiary,
              fontSize: typography.xs,
              fontFamily: fontFamily.medium,
            }}
          >
            Show {hiddenCount} earlier {hiddenCount === 1 ? "step" : "steps"}
          </Text>
        </Pressable>
      )}

      {/* Collapse button when expanded */}
      {canExpand && expanded && (
        <Pressable
          onPress={() => setExpanded(false)}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: spacing.xs,
            paddingVertical: spacing.sm,
            marginBottom: 2,
            borderRadius: radii.sm,
            backgroundColor: pressed
              ? colors.backgroundPressed
              : colors.backgroundSubtle,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Iconify icon="solar:alt-arrow-down-linear" size={14} color={colors.textTertiary} />
          <Text
            style={{
              color: colors.textTertiary,
              fontSize: typography.xs,
              fontFamily: fontFamily.medium,
            }}
          >
            Show less
          </Text>
        </Pressable>
      )}

      {visible.map((item, i) => {
        const isLatest = i === visible.length - 1;
        const opacity = expanded
          ? (isLatest ? 1 : 0.7)
          : (isLatest ? 1 : 0.5 + (i / visible.length) * 0.5);

        return (
          <ActivityRow
            key={`${item.ts}-${i}`}
            item={item}
            isLatest={isLatest}
            opacity={opacity}
            colors={colors}
          />
        );
      })}
    </View>
  );
}

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function getNoteTitle(note: Pick<Note, "summary" | "transcript" | "status">): string {
  let base: string;
  if (note.summary) base = note.summary;
  else if (note.transcript.trim()) base = note.transcript.trim();
  else if (note.status === NOTE_STATUSES.transcribing) base = "Transcribing…";
  else if (note.status === NOTE_STATUSES.pending || note.status === NOTE_STATUSES.triaging) {
    base = "Processing note";
  } else base = "Voice note";
  return shortenRunTitle(base);
}

function getReleaseInfo() {
  const version = Constants.expoConfig?.version ?? "dev";
  const channel =
    Updates.channel || (__DEV__ ? "dev" : Platform.OS === "web" ? "web" : "embedded");
  const updateId = Updates.updateId
    ? Updates.updateId.split("-")[0]
    : Updates.isEmbeddedLaunch
      ? "embedded"
      : "none";

  let nativeBuild: string | number | null = null;
  if (Platform.OS === "ios") {
    nativeBuild = Constants.platform?.ios?.buildNumber ?? null;
  } else if (Platform.OS === "android") {
    nativeBuild = Constants.platform?.android?.versionCode ?? null;
  }

  const build = nativeBuild ? `${version} (${nativeBuild})` : version;

  return {
    channel: channel.toUpperCase(),
    build,
    updateId,
  };
}

export default function HomeScreen() {
  const { colors, isDark } = useThemeColors();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [expandedNoteIds, setExpandedNoteIds] = useState<string[]>([]);
  const [followUpText, setFollowUpText] = useState("");
  const [sendingFollowUp, setSendingFollowUp] = useState(false);
  const [isRecordingFollowUp, setIsRecordingFollowUp] = useState(false);
  const [isTranscribingFollowUp, setIsTranscribingFollowUp] = useState(false);
  const followUpRecordingRef = useRef<Audio.Recording | null>(null);

  const insets = useSafeAreaInsets();

  // Dictionary sheet state
  const [showDictionary, setShowDictionary] = useState(false);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [metering, setMetering] = useState(-160);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const meteringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const modalListRef = useRef<FlatList>(null);
  const modalListLayoutHeight = useRef(0);
  const modalListContentHeight = useRef(0);
  const modalListScrollY = useRef(0);
  const [showJumpToEnd, setShowJumpToEnd] = useState(false);
  const [showJumpToTop, setShowJumpToTop] = useState(false);
  const [filterUnread, setFilterUnread] = useState(false);
  const [filterProject, setFilterProject] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);

  // TTS state — speed persisted across sessions
  const [ttsActiveId, setTtsActiveId] = useState<string | null>(null);
  const [ttsSpeed, setTtsSpeed] = useState<1 | 1.5 | 2>(1);
  const TTS_SPEEDS = [1, 1.5, 2] as const;

  // Load persisted TTS speed on mount
  useEffect(() => {
    (async () => {
      try {
        const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
        const saved = await AsyncStorage.getItem("ttsSpeed");
        if (saved) {
          const parsed = parseFloat(saved);
          if (parsed === 1 || parsed === 1.5 || parsed === 2) {
            setTtsSpeed(parsed as 1 | 1.5 | 2);
          }
        }
      } catch {}
    })();
  }, []);
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(2);
  /** Voice notes that contain ≥1 task with this status / trait */
  const [noteTaskStatusFilter, setNoteTaskStatusFilter] = useState<
    "running" | "failed" | "blocked" | "pinned" | null
  >(null);
  const releaseInfo = getReleaseInfo();

  const isActive = isRecording || isPaused || isSaving;

  // Check permission on mount
  useEffect(() => {
    requestAudioPermissions().then(setHasPermission);
  }, []);

  // Cleanup intervals
  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
      if (meteringIntervalRef.current) clearInterval(meteringIntervalRef.current);
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, []);

  // Query dictionary terms for transcription prompt
  const { data: dictData } = db.useQuery({ dictionaryTerms: {} });
  const dictionaryTerms = ((dictData as any)?.dictionaryTerms ?? []) as DictionaryTerm[];
  const dictionaryPrompt = useMemo(
    () => buildDictionaryPrompt(dictionaryTerms),
    [dictionaryTerms]
  );

  // Transcribe a note's audio file and update it in InstantDB
  const transcribeNote = useCallback(async (noteId: string, filePath: string) => {
    try {
      const transcription = await transcribeAudio(filePath, dictionaryPrompt || undefined);
      if (!transcription || transcription.trim().length === 0) {
        await db.transact(
          db.tx.notes[noteId].update({
            status: NOTE_STATUSES.transcriptionFailed,
            errorMessage: "No speech detected",
          })
        );
        return;
      }

      const trimmedInput = transcription.trim();
      const now = Date.now();

      await db.transact(
        db.tx.notes[noteId].update({
          transcript: trimmedInput,
          status: NOTE_STATUSES.pending,
          errorMessage: "",
          transcribedAt: now,
        })
      );

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Generate summary in background (non-blocking)
      summarizeInput(trimmedInput).then((summary) => {
        if (summary) {
          db.transact(db.tx.notes[noteId].update({ summary }));
        }
      });
    } catch (error) {
      console.error("Transcription failed for note:", noteId, error);
      await db.transact(
        db.tx.notes[noteId].update({
          status: NOTE_STATUSES.transcriptionFailed,
          errorMessage: error instanceof Error ? error.message : "Transcription failed",
        })
      );
    }
  }, [dictionaryPrompt]);

  // Retry transcription for a failed note
  const retryTranscription = useCallback(async (noteId: string, filePath: string) => {
    await db.transact(
      db.tx.notes[noteId].update({
        status: NOTE_STATUSES.transcribing,
        errorMessage: "",
      })
    );
    transcribeNote(noteId, filePath);
  }, [transcribeNote]);

  const retryExtraction = useCallback(async (noteId: string) => {
    await db.transact(
      db.tx.notes[noteId].update({
        status: NOTE_STATUSES.pending,
        errorMessage: "",
      })
    );
  }, []);

  // Query notes with nested child tasks
  const { data: notesData, isLoading } = db.useQuery({
    notes: {
      $: { order: { createdAt: "desc" }, limit: 50 },
      tasks: {
        messages: {},
        project: {},
        dependencies: { dependsOn: {} },
      },
    },
  } as any);

  // Query all projects with their tasks for popularity sorting
  const { data: allProjectsData } = db.useQuery({
    projects: { $: { order: { slug: "asc" } }, tasks: {} },
  } as any);

  // On startup, retry any notes stuck in "transcribing" state (app was killed mid-transcription)
  const retriedNotesRef = useRef(new Set<string>());
  const notes = (((notesData as { notes?: Note[] } | undefined)?.notes) ?? []) as Note[];
  useEffect(() => {
    const currentNotes = (((notesData as { notes?: Note[] } | undefined)?.notes) ?? []) as Note[];
    if (currentNotes.length === 0) return;
    for (const note of currentNotes) {
      if (
        note.status === "transcribing" &&
        (note as any).audioFilePath &&
        !retriedNotesRef.current.has(note.id)
      ) {
        retriedNotesRef.current.add(note.id);
        console.log("Retrying stuck transcription:", note.id);
        transcribeNote(note.id, (note as any).audioFilePath);
      }
    }
  }, [notesData, transcribeNote]);

  // On startup, flush any recordings stuck in the offline queue
  const flushedQueueRef = useRef(false);
  useEffect(() => {
    if (flushedQueueRef.current) return;
    flushedQueueRef.current = true;

    (async () => {
      const queue = await getQueue();
      if (queue.length === 0) return;
      console.log(`Flushing ${queue.length} offline recording(s)...`);

      for (const entry of queue) {
        try {
          // Check if the note already exists in DB (maybe optimistic write worked)
          const existing = notes.find((n) => n.id === entry.noteId);
          if (existing) {
            await removeFromQueue(entry.noteId);
            continue;
          }

          await db.transact(
            db.tx.notes[entry.noteId].update({
              transcript: "",
              status: NOTE_STATUSES.transcribing,
              summary: SUMMARY_PLACEHOLDER,
              source: "phone",
              audioFilePath: entry.filePath,
              createdAt: entry.createdAt,
            })
          );
          await removeFromQueue(entry.noteId);
          console.log(`Flushed queued recording: ${entry.noteId}`);

          // Attempt transcription now that we're (hopefully) online
          transcribeNote(entry.noteId, entry.filePath);
        } catch (err) {
          console.warn("Failed to flush queued recording:", entry.noteId, err);
          // Leave in queue for next startup
        }
      }
    })();
  }, [notes, transcribeNote]);

  const allTasks = notes.flatMap((note) => (note.tasks ?? []) as Task[]);

  // All project slugs sorted by task count (most popular first)
  const projectSlugs = useMemo(() => {
    const projects = ((allProjectsData as any)?.projects ?? []) as {
      slug: string;
      tasks?: any[];
    }[];
    return projects
      .filter((p) => p.slug)
      .sort((a, b) => (b.tasks?.length ?? 0) - (a.tasks?.length ?? 0))
      .map((p) => p.slug);
  }, [allProjectsData]);


  // Apply filters to notes
  const searchTrimmed = searchQuery.trim().toLowerCase();
  const filteredNotes = useMemo(() => {
    return notes.filter((note) => {
      const tasks = (note.tasks ?? []) as Task[];
      if (filterUnread) {
        const hasUnread = tasks.some((t) => (t as any).read === false);
        if (!hasUnread) return false;
      }
      if (filterProject) {
        const hasProject = tasks.some(
          (t) =>
            (t as any).project?.slug === filterProject ||
            (t as any).projectSlug === filterProject
        );
        if (!hasProject) return false;
      }
      if (searchTrimmed) {
        const noteTitle = (note.summary || "").toLowerCase();
        const titleMatch = noteTitle.includes(searchTrimmed);
        const taskMatch = tasks.some((t) => {
          const taskText = (
            (t.summary || "") +
            " " +
            (t.input || "")
          ).toLowerCase();
          return taskText.includes(searchTrimmed);
        });
        if (!titleMatch && !taskMatch) return false;
      }
      if (noteTaskStatusFilter === "running") {
        if (!noteHasTaskWithStatus(note, TASK_STATUSES.running)) return false;
      }
      if (noteTaskStatusFilter === "failed") {
        if (!noteHasTaskWithStatus(note, TASK_STATUSES.failed)) return false;
      }
      if (noteTaskStatusFilter === "blocked") {
        if (!noteHasTaskWithStatus(note, TASK_STATUSES.blocked)) return false;
      }
      if (noteTaskStatusFilter === "pinned") {
        const hasPinned = tasks.some((t) => (t as any).pinned === true);
        if (!hasPinned) return false;
      }
      return true;
    });
  }, [notes, filterUnread, filterProject, searchTrimmed, noteTaskStatusFilter]);

  const isFiltering = filterUnread && !searchTrimmed && !filterProject;
  const isSearching = !!searchTrimmed || !!filterProject;

  const runningNoteCount = useMemo(
    () =>
      notes.filter((n) => noteHasTaskWithStatus(n, TASK_STATUSES.running))
        .length,
    [notes]
  );
  const attentionFailedNoteCount = useMemo(
    () =>
      notes.filter((n) => noteHasTaskWithStatus(n, TASK_STATUSES.failed))
        .length,
    [notes]
  );
  const attentionBlockedNoteCount = useMemo(
    () =>
      notes.filter((n) => noteHasTaskWithStatus(n, TASK_STATUSES.blocked))
        .length,
    [notes]
  );
  const pinnedNoteCount = useMemo(
    () =>
      notes.filter((n) =>
        ((n.tasks ?? []) as Task[]).some((t) => (t as any).pinned === true)
      ).length,
    [notes]
  );
  const unreadNoteCount = useMemo(
    () =>
      allTasks.filter((t) => (t as any).read === false).length,
    [allTasks]
  );

  /** WhatsApp-style pills. Selected uses visible ring — RN can drop fill when borderWidth is 0. */
  const waFilter = useMemo(() => {
    if (isDark) {
      return {
        offBg: "#2c2c2e",
        offBorder: "#5c5c5e",
        offCount: colors.textSecondary,
        onGoldBg: colors.primary,
        onGoldFg: colors.black,
        ringGold: "#ffffff",
        onRunningBg: colors.statusRunning,
        onRunningFg: "#ffffff",
        ringRunning: "#93c5fd",
        onFailedBg: colors.statusFailed,
        onFailedFg: "#ffffff",
        ringFailed: "#fecaca",
        onBlockedBg: colors.warning,
        onBlockedFg: colors.black,
        ringBlocked: "#ffffff",
        onPinnedBg: colors.primary,
        onPinnedFg: colors.black,
        ringPinned: "#ffffff",
      };
    }
    return {
      offBg: "#ffffff",
      offBorder: "rgba(0,0,0,0.12)",
      offCount: colors.textSecondary,
      onGoldBg: colors.primaryLight,
      onGoldFg: colors.black,
      ringGold: colors.primaryDark,
      onRunningBg: colors.statusRunning,
      onRunningFg: "#ffffff",
      ringRunning: "#1e40af",
      onFailedBg: colors.statusFailed,
      onFailedFg: "#ffffff",
      ringFailed: "#fecaca",
      onBlockedBg: colors.warning,
      onBlockedFg: colors.black,
      ringBlocked: "#92400e",
      onPinnedBg: colors.primaryLight,
      onPinnedFg: colors.black,
      ringPinned: colors.primaryDark,
    };
  }, [isDark, colors]);

  const { activeNotes, historyNotes } = useMemo(() => {
    return {
      activeNotes: filteredNotes.filter((n) => !noteIsSettledForHistory(n)),
      historyNotes: filteredNotes.filter((n) => noteIsSettledForHistory(n)),
    };
  }, [filteredNotes]);

  const visibleHistory = useMemo(
    () => historyNotes.slice(0, visibleHistoryCount),
    [historyNotes, visibleHistoryCount]
  );
  const historyRemaining = Math.max(0, historyNotes.length - visibleHistory.length);

  useEffect(() => {
    if (
      noteTaskStatusFilter === "failed" &&
      attentionFailedNoteCount === 0
    ) {
      setNoteTaskStatusFilter(null);
    }
    if (
      noteTaskStatusFilter === "blocked" &&
      attentionBlockedNoteCount === 0
    ) {
      setNoteTaskStatusFilter(null);
    }
    if (
      noteTaskStatusFilter === "pinned" &&
      pinnedNoteCount === 0
    ) {
      setNoteTaskStatusFilter(null);
    }
  }, [noteTaskStatusFilter, attentionFailedNoteCount, attentionBlockedNoteCount, pinnedNoteCount]);

  // Flat task list for filtered view
  const filteredTasks = useMemo(() => {
    if (!isFiltering) return [];
    return allTasks
      .filter((t) => {
        if (filterUnread && (t as any).read !== false) return false;
        if (filterProject) {
          const slug = (t as any).project?.slug || (t as any).projectSlug;
          if (slug !== filterProject) return false;
        }
        return true;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [allTasks, isFiltering, filterUnread, filterProject]);

  const selectedTask = selectedTaskId
    ? allTasks.find((task) => task.id === selectedTaskId) ?? null
    : null;

  // Recording handlers
  const startRecording = useCallback(async () => {
    if (hasPermission === false || recordingRef.current || isProcessing) return;
    setRecordingError(null);
    try {
      await configureAudioMode();
      const METERING_OPTIONS: Audio.RecordingOptions = {
        ...RECORDING_OPTIONS,
        isMeteringEnabled: true,
      };
      const { recording } = await Audio.Recording.createAsync(METERING_OPTIONS);
      recordingRef.current = recording;
      setIsRecording(true);
      setDuration(0);
      setMetering(-160);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      durationIntervalRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);

      meteringIntervalRef.current = setInterval(async () => {
        if (recordingRef.current) {
          try {
            const status = await recordingRef.current.getStatusAsync();
            if (status.isRecording && status.metering !== undefined) {
              setMetering(status.metering);
            }
          } catch {}
        }
      }, 100);
    } catch (error) {
      console.error("Failed to start recording:", error);
    }
  }, [hasPermission, isProcessing]);

  const cancelRecording = useCallback(async () => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    if (meteringIntervalRef.current) {
      clearInterval(meteringIntervalRef.current);
      meteringIntervalRef.current = null;
    }
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch {}
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    }
    recordingRef.current = null;
    setIsRecording(false);
    setIsPaused(false);
    setDuration(0);
    setMetering(-160);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, []);

  const pauseRecording = useCallback(async () => {
    if (!recordingRef.current) return;
    try {
      await recordingRef.current.pauseAsync();
      setIsPaused(true);
      setMetering(-160);
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      if (meteringIntervalRef.current) {
        clearInterval(meteringIntervalRef.current);
        meteringIntervalRef.current = null;
      }
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.error("Failed to pause recording:", error);
    }
  }, []);

  const resumeRecording = useCallback(async () => {
    if (!recordingRef.current) return;
    try {
      await recordingRef.current.startAsync();
      setIsPaused(false);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      durationIntervalRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);

      meteringIntervalRef.current = setInterval(async () => {
        if (recordingRef.current) {
          try {
            const status = await recordingRef.current.getStatusAsync();
            if (status.isRecording && status.metering !== undefined) {
              setMetering(status.metering);
            }
          } catch {}
        }
      }, 100);
    } catch (error) {
      console.error("Failed to resume recording:", error);
    }
  }, []);

  const stopRecording = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) return;
    recordingRef.current = null;

    setIsSaving(true);
    setIsRecording(false);
    setIsPaused(false);
    setIsProcessing(true);

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    if (meteringIntervalRef.current) {
      clearInterval(meteringIntervalRef.current);
      meteringIntervalRef.current = null;
    }

    try {
      const status = await recording.getStatusAsync();
      if (status.canRecord) {
        await recording.stopAndUnloadAsync();
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      const noteId = id();
      const { filePath } = await saveRecordingLocally(recording, noteId);
      const now = Date.now();

      // Persist to local queue first (survives app restart even if DB write fails)
      await enqueueRecording({ noteId, filePath, createdAt: now });

      // Create note in InstantDB (optimistic — works offline)
      try {
        await db.transact(
          db.tx.notes[noteId].update({
            transcript: "",
            status: NOTE_STATUSES.transcribing,
            summary: SUMMARY_PLACEHOLDER,
            source: "phone",
            audioFilePath: filePath,
            createdAt: now,
          })
        );
        // DB write succeeded (or queued optimistically), remove from local queue
        await removeFromQueue(noteId);
      } catch (dbError) {
        console.warn("DB write failed (offline?), recording queued locally:", dbError);
        // Note stays in queue — will be flushed on next startup
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Transcribe in background (non-blocking — will fail offline and set status)
      transcribeNote(noteId, filePath);
    } catch (error) {
      console.error("Failed to save recording:", error);
      setRecordingError("Failed to save recording");
      setTimeout(() => setRecordingError(null), 1500);
    }

    setIsSaving(false);
    setIsProcessing(false);
    setDuration(0);
    setMetering(-160);
  }, [transcribeNote]);

  // Follow-up message handler
  const sendFollowUp = useCallback(async () => {
    if (!selectedTask || !followUpText.trim()) return;
    setSendingFollowUp(true);
    try {
      const messageId = id();
      await db.transact([
        db.tx.messages[messageId]
          .update({
            role: "user",
            content: followUpText.trim(),
            createdAt: Date.now(),
          })
          .link({ task: selectedTask.id }),
      ]);
      setFollowUpText("");
      Keyboard.dismiss();
    } catch (error) {
      console.error("Failed to send follow-up:", error);
    }
    setSendingFollowUp(false);
  }, [selectedTask, followUpText]);

  // TTS helpers
  const stripMarkdown = useCallback((text: string): string => {
    return text
      .replace(/```[\s\S]*?```/g, " code block ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/#{1,6}\s+/g, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
      .replace(/^[-*+]\s+/gm, "")
      .replace(/^\d+\.\s+/gm, "")
      .replace(/^>\s+/gm, "")
      .replace(/---+/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }, []);

  const toggleTts = useCallback((contentId: string, text: string) => {
    if (ttsActiveId === contentId) {
      Speech.stop();
      setTtsActiveId(null);
      return;
    }
    Speech.stop();
    const cleaned = stripMarkdown(text);
    setTtsActiveId(contentId);
    Speech.speak(cleaned, {
      rate: ttsSpeed,
      onDone: () => setTtsActiveId(null),
      onStopped: () => setTtsActiveId(null),
      onError: () => setTtsActiveId(null),
    });
  }, [ttsActiveId, ttsSpeed, stripMarkdown]);

  const cycleTtsSpeed = useCallback(() => {
    const currentIdx = TTS_SPEEDS.indexOf(ttsSpeed);
    const nextSpeed = TTS_SPEEDS[(currentIdx + 1) % TTS_SPEEDS.length];
    setTtsSpeed(nextSpeed);
    // Persist speed preference
    (async () => {
      try {
        const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
        await AsyncStorage.setItem("ttsSpeed", String(nextSpeed));
      } catch {}
    })();
    // Stop current playback — it'll restart at new speed if user taps play
    if (ttsActiveId) {
      Speech.stop();
      setTtsActiveId(null);
    }
  }, [ttsSpeed, ttsActiveId, TTS_SPEEDS]);

  // Stop TTS when closing the modal
  useEffect(() => {
    if (!selectedTask) {
      Speech.stop();
      setTtsActiveId(null);
    }
  }, [selectedTask]);

  // Voice follow-up recording
  const startFollowUpRecording = useCallback(async () => {
    if (hasPermission === false) return;
    try {
      Keyboard.dismiss();
      await configureAudioMode();
      const { recording } = await Audio.Recording.createAsync(RECORDING_OPTIONS);
      followUpRecordingRef.current = recording;
      setIsRecordingFollowUp(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.error("Failed to start follow-up recording:", error);
    }
  }, [hasPermission]);

  const cancelFollowUpRecording = useCallback(async () => {
    const recording = followUpRecordingRef.current;
    followUpRecordingRef.current = null;
    setIsRecordingFollowUp(false);
    if (recording) {
      try {
        const status = await recording.getStatusAsync();
        if (status.canRecord) await recording.stopAndUnloadAsync();
      } catch {}
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
  }, []);

  const submitFollowUpRecording = useCallback(async () => {
    if (!selectedTask) return;
    const recording = followUpRecordingRef.current;
    if (!recording) return;
    followUpRecordingRef.current = null;
    setIsRecordingFollowUp(false);
    setIsTranscribingFollowUp(true);

    try {
      const status = await recording.getStatusAsync();
      if (status.canRecord) await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      const tempId = id();
      const { filePath } = await saveRecordingLocally(recording, tempId);
      const transcription = await transcribeAudio(filePath, dictionaryPrompt || undefined);
      const trimmed = transcription.trim();
      if (trimmed) {
        const messageId = id();
        const now = Date.now();
        await db.transact([
          db.tx.messages[messageId]
            .update({ role: "user", content: trimmed, createdAt: now })
            .link({ task: selectedTask.id }),
          ...(selectedTask.status === "done" ||
          selectedTask.status === "failed" ||
          selectedTask.status === "cancelled"
            ? [db.tx.tasks[selectedTask.id].update({ status: "pending" })]
            : []),
        ]);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error("Failed to transcribe follow-up:", error);
    }
    setIsTranscribingFollowUp(false);
  }, [selectedTask, dictionaryPrompt]);

  // Cancel task handler
  const retryTask = useCallback(async (taskId: string) => {
    try {
      await db.transact(
        db.tx.tasks[taskId].update({
          status: TASK_STATUSES.pending,
          blockedReason: "",
          errorMessage: "",
          cancelRequested: false,
        })
      );
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.error("retryTask", e);
    }
  }, []);

  const togglePin = useCallback((taskId: string, currentPinned: boolean) => {
    db.transact(db.tx.tasks[taskId].update({ pinned: !currentPinned }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const cancelTask = useCallback(async (taskId: string, currentStatus?: string) => {
    try {
      await db.transact(
        currentStatus === "running"
          ? db.tx.tasks[taskId].update({ cancelRequested: true })
          : db.tx.tasks[taskId].update({
              status: "cancelled",
              cancelRequested: true,
              blockedReason: "",
              errorMessage: "Cancelled by user",
              completedAt: Date.now(),
            })
      );
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch (error) {
      console.error("Failed to cancel task:", error);
    }
  }, []);

  // Markdown styles
  const mdStyles = {
    body: {
      color: colors.textPrimary,
      fontSize: typography.base,
      fontFamily: fontFamily.regular,
      lineHeight: 22,
    },
    heading1: {
      color: colors.textPrimary,
      fontSize: typography.xl,
      fontFamily: fontFamily.bold,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    heading2: {
      color: colors.textPrimary,
      fontSize: typography.lg,
      fontFamily: fontFamily.semibold,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    heading3: {
      color: colors.textPrimary,
      fontSize: typography.md,
      fontFamily: fontFamily.semibold,
      marginTop: spacing.md,
      marginBottom: spacing.xs,
    },
    code_inline: {
      backgroundColor: colors.backgroundElevated,
      color: colors.primaryLight,
      fontFamily: fontFamily.mono,
      fontSize: typography.sm,
      paddingHorizontal: 4,
      borderRadius: radii.xs,
    },
    code_block: {
      backgroundColor: colors.backgroundElevated,
      padding: spacing.md,
      borderRadius: radii.md,
      fontFamily: fontFamily.mono,
      fontSize: typography.sm,
      color: colors.textSecondary,
    },
    fence: {
      backgroundColor: colors.backgroundElevated,
      padding: spacing.md,
      borderRadius: radii.md,
      fontFamily: fontFamily.mono,
      fontSize: typography.sm,
      color: colors.textSecondary,
    },
    pre: {
      backgroundColor: colors.backgroundElevated,
      borderRadius: radii.md,
      padding: spacing.sm,
    },
    link: {
      color: colors.primary,
      textDecorationLine: "underline" as const,
    },
    blockquote: {
      backgroundColor: colors.backgroundPressed,
      borderLeftColor: colors.primary,
      borderLeftWidth: 3,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.xs,
      borderWidth: 0,
    },
    text: {
      color: colors.textPrimary,
    },
    textgroup: {
      color: colors.textPrimary,
    },
    bullet_list_icon: {
      color: colors.textTertiary,
    },
    ordered_list_icon: {
      color: colors.textTertiary,
    },
    list_item: {
      marginBottom: spacing.xs,
    },
    hr: {
      backgroundColor: colors.border,
    },
  };

  const renderNoteCard = (item: Note) => {
    const noteTasks = ([...(item.tasks ?? [])] as Task[]).sort((a, b) => {
      return a.createdAt - b.createdAt;
    });
    const audioPath = (item as any).audioFilePath as string | undefined;

    return (
      <NoteListItem
        key={item.id}
        title={getNoteTitle(item)}
        transcript={item.transcript}
        status={item.status}
        createdAt={item.createdAt}
        tasks={noteTasks.map((task) => ({
          id: task.id,
          title: task.summary || task.input,
          status: task.status,
          createdAt: task.createdAt,
          projectLabel: (task as any).project?.slug || (task as any).projectSlug || null,
          read: (task as any).read ?? true,
          pinned: (task as any).pinned ?? false,
          blockedReason: (task as any).blockedReason ?? null,
          errorMessage: (task as any).errorMessage ?? null,
          extractionIndex: (task as any).extractionIndex ?? null,
          resultSnippet: (task as any).result
            ? String((task as any).result).slice(0, 400)
            : null,
        }))}
        expanded={isSearching || expandedNoteIds.includes(item.id)}
        onToggle={() => {
          setExpandedNoteIds((current) =>
            current.includes(item.id)
              ? current.filter((id) => id !== item.id)
              : [...current, item.id]
          );
        }}
        onOpenTask={(taskId) => {
          setSelectedTaskId(taskId);
          setFollowUpText("");
          setShowJumpToEnd(false);
          setShowJumpToTop(false);
          db.transact(db.tx.tasks[taskId].update({ read: true }));
        }}
        onRetryTask={retryTask}
        highlightQuery={searchTrimmed || null}
        highlightProject={filterProject}
        errorMessage={(item as any).errorMessage ?? null}
        onRetryTranscription={
          item.status === NOTE_STATUSES.transcriptionFailed && audioPath
            ? () => retryTranscription(item.id, audioPath)
            : undefined
        }
        onRetryExtraction={
          item.status === NOTE_STATUSES.triageFailed
            ? () => retryExtraction(item.id)
            : undefined
        }
      />
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.background }}
        edges={["top"]}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            paddingHorizontal: spacing.sm,
            paddingTop: spacing.md,
            paddingBottom: spacing.lg,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <Text
              style={{
                fontSize: typography.xxl,
                fontFamily: fontFamily.bold,
                color: colors.textPrimary,
                letterSpacing: typography.tracking.tight,
              }}
            >
              Exec
            </Text>
            <Pressable
              onPress={() => setShowDictionary(true)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
            >
              <Iconify icon="solar:book-linear" size={18} color={colors.textTertiary} />
            </Pressable>
          </View>

          <View
            style={{
              alignItems: "flex-end",
              marginLeft: spacing.lg,
              flexShrink: 0,
            }}
          >
            <Text
              style={{
                color: colors.textTertiary,
                fontSize: typography.xs,
                fontFamily: fontFamily.semibold,
                textTransform: "uppercase",
                letterSpacing: typography.tracking.wider,
              }}
            >
              {releaseInfo.channel}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                color: colors.textSecondary,
                fontSize: typography.xs,
                fontFamily: fontFamily.regular,
                marginTop: 2,
              }}
            >
              {releaseInfo.build} / ID {releaseInfo.updateId}
            </Text>
          </View>
        </View>

        {/* Two-row chrome: state filters, then workspace (projects) */}
        {!isLoading && notes.length > 0 && (
          <View
            style={{
              paddingHorizontal: spacing.md,
              paddingBottom: spacing.sm,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: colors.border,
              gap: spacing.sm,
            }}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              removeClippedSubviews={false}
              contentContainerStyle={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingRight: spacing.md,
                paddingVertical: 2,
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: filterUnread }}
                accessibilityHint="Show voice notes that include an unread task"
                disabled={unreadNoteCount === 0}
                android_ripple={
                  Platform.OS === "android"
                    ? { color: "rgba(255,255,255,0.12)" }
                    : undefined
                }
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                onPress={() => {
                  setFilterUnread((v) => !v);
                  void Haptics.selectionAsync();
                }}
                style={({ pressed }) => ({
                  minHeight: 40,
                  justifyContent: "center",
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  borderRadius: 20,
                  backgroundColor: filterUnread
                    ? waFilter.onGoldBg
                    : waFilter.offBg,
                  borderWidth: filterUnread ? 2 : 1.5,
                  borderColor: filterUnread
                    ? waFilter.ringGold
                    : waFilter.offBorder,
                  opacity:
                    unreadNoteCount === 0
                      ? 0.4
                      : pressed && Platform.OS !== "android"
                        ? 0.88
                        : 1,
                  transform:
                    unreadNoteCount > 0 && pressed
                      ? [{ scale: 0.98 }]
                      : [],
                })}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text
                    style={{
                      fontSize: typography.sm,
                      fontFamily: fontFamily.semibold,
                      color: filterUnread
                        ? waFilter.onGoldFg
                        : colors.textPrimary,
                    }}
                  >
                    Unread
                  </Text>
                  <Text
                    style={{
                      fontSize: typography.sm,
                      fontFamily: fontFamily.semibold,
                      fontVariant: ["tabular-nums"],
                      color: filterUnread
                        ? waFilter.onGoldFg
                        : waFilter.offCount,
                    }}
                  >
                    {` ${unreadNoteCount}`}
                  </Text>
                </View>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityState={{
                  selected: noteTaskStatusFilter === "running",
                }}
                accessibilityHint="Show voice notes that include a running task"
                disabled={runningNoteCount === 0}
                android_ripple={
                  Platform.OS === "android"
                    ? { color: "rgba(255,255,255,0.15)" }
                    : undefined
                }
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                onPress={() => {
                  setNoteTaskStatusFilter((prev) =>
                    prev === "running" ? null : "running"
                  );
                  void Haptics.selectionAsync();
                }}
                style={({ pressed }) => ({
                  minHeight: 40,
                  justifyContent: "center",
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  borderRadius: 20,
                  backgroundColor:
                    noteTaskStatusFilter === "running"
                      ? waFilter.onRunningBg
                      : waFilter.offBg,
                  borderWidth: noteTaskStatusFilter === "running" ? 2 : 1.5,
                  borderColor:
                    noteTaskStatusFilter === "running"
                      ? waFilter.ringRunning
                      : waFilter.offBorder,
                  opacity:
                    runningNoteCount === 0
                      ? 0.4
                      : pressed && Platform.OS !== "android"
                        ? 0.9
                        : 1,
                  transform:
                    runningNoteCount > 0 && pressed
                      ? [{ scale: 0.98 }]
                      : [],
                })}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text
                    style={{
                      fontSize: typography.sm,
                      fontFamily: fontFamily.semibold,
                      color:
                        noteTaskStatusFilter === "running"
                          ? waFilter.onRunningFg
                          : colors.statusRunning,
                    }}
                  >
                    Running
                  </Text>
                  <Text
                    style={{
                      fontSize: typography.sm,
                      fontFamily: fontFamily.semibold,
                      fontVariant: ["tabular-nums"],
                      color:
                        noteTaskStatusFilter === "running"
                          ? waFilter.onRunningFg
                          : waFilter.offCount,
                    }}
                  >
                    {` ${runningNoteCount}`}
                  </Text>
                </View>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityState={{
                  selected: noteTaskStatusFilter === "failed",
                }}
                accessibilityHint="Show voice notes that include a failed task"
                disabled={attentionFailedNoteCount === 0}
                android_ripple={
                  Platform.OS === "android"
                    ? { color: "rgba(255,255,255,0.15)" }
                    : undefined
                }
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                onPress={() => {
                  setNoteTaskStatusFilter((prev) =>
                    prev === "failed" ? null : "failed"
                  );
                  void Haptics.selectionAsync();
                }}
                style={({ pressed }) => ({
                  minHeight: 40,
                  justifyContent: "center",
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  borderRadius: 20,
                  backgroundColor:
                    noteTaskStatusFilter === "failed"
                      ? waFilter.onFailedBg
                      : waFilter.offBg,
                  borderWidth: noteTaskStatusFilter === "failed" ? 2 : 1.5,
                  borderColor:
                    noteTaskStatusFilter === "failed"
                      ? waFilter.ringFailed
                      : waFilter.offBorder,
                  opacity:
                    attentionFailedNoteCount === 0
                      ? 0.4
                      : pressed && Platform.OS !== "android"
                        ? 0.9
                        : 1,
                  transform:
                    attentionFailedNoteCount > 0 && pressed
                      ? [{ scale: 0.98 }]
                      : [],
                })}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text
                    style={{
                      fontSize: typography.sm,
                      fontFamily: fontFamily.semibold,
                      color:
                        noteTaskStatusFilter === "failed"
                          ? waFilter.onFailedFg
                          : colors.statusFailed,
                    }}
                  >
                    Failed
                  </Text>
                  <Text
                    style={{
                      fontSize: typography.sm,
                      fontFamily: fontFamily.semibold,
                      fontVariant: ["tabular-nums"],
                      color:
                        noteTaskStatusFilter === "failed"
                          ? waFilter.onFailedFg
                          : waFilter.offCount,
                    }}
                  >
                    {` ${attentionFailedNoteCount}`}
                  </Text>
                </View>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityState={{
                  selected: noteTaskStatusFilter === "blocked",
                }}
                accessibilityHint="Show voice notes that include a blocked task"
                disabled={attentionBlockedNoteCount === 0}
                android_ripple={
                  Platform.OS === "android"
                    ? { color: "rgba(0,0,0,0.08)" }
                    : undefined
                }
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                onPress={() => {
                  setNoteTaskStatusFilter((prev) =>
                    prev === "blocked" ? null : "blocked"
                  );
                  void Haptics.selectionAsync();
                }}
                style={({ pressed }) => ({
                  minHeight: 40,
                  justifyContent: "center",
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  borderRadius: 20,
                  backgroundColor:
                    noteTaskStatusFilter === "blocked"
                      ? waFilter.onBlockedBg
                      : waFilter.offBg,
                  borderWidth: noteTaskStatusFilter === "blocked" ? 2 : 1.5,
                  borderColor:
                    noteTaskStatusFilter === "blocked"
                      ? waFilter.ringBlocked
                      : waFilter.offBorder,
                  opacity:
                    attentionBlockedNoteCount === 0
                      ? 0.4
                      : pressed && Platform.OS !== "android"
                        ? 0.9
                        : 1,
                  transform:
                    attentionBlockedNoteCount > 0 && pressed
                      ? [{ scale: 0.98 }]
                      : [],
                })}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text
                    style={{
                      fontSize: typography.sm,
                      fontFamily: fontFamily.semibold,
                      color:
                        noteTaskStatusFilter === "blocked"
                          ? waFilter.onBlockedFg
                          : colors.warning,
                    }}
                  >
                    Blocked
                  </Text>
                  <Text
                    style={{
                      fontSize: typography.sm,
                      fontFamily: fontFamily.semibold,
                      fontVariant: ["tabular-nums"],
                      color:
                        noteTaskStatusFilter === "blocked"
                          ? waFilter.onBlockedFg
                          : waFilter.offCount,
                    }}
                  >
                    {` ${attentionBlockedNoteCount}`}
                  </Text>
                </View>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityState={{
                  selected: noteTaskStatusFilter === "pinned",
                }}
                accessibilityHint="Show voice notes that include a pinned task"
                disabled={pinnedNoteCount === 0}
                android_ripple={
                  Platform.OS === "android"
                    ? { color: "rgba(255,255,255,0.15)" }
                    : undefined
                }
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                onPress={() => {
                  setNoteTaskStatusFilter((prev) =>
                    prev === "pinned" ? null : "pinned"
                  );
                  void Haptics.selectionAsync();
                }}
                style={({ pressed }) => ({
                  minHeight: 40,
                  justifyContent: "center",
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  borderRadius: 20,
                  backgroundColor:
                    noteTaskStatusFilter === "pinned"
                      ? waFilter.onPinnedBg
                      : waFilter.offBg,
                  borderWidth: noteTaskStatusFilter === "pinned" ? 2 : 1.5,
                  borderColor:
                    noteTaskStatusFilter === "pinned"
                      ? waFilter.ringPinned
                      : waFilter.offBorder,
                  opacity:
                    pinnedNoteCount === 0
                      ? 0.4
                      : pressed && Platform.OS !== "android"
                        ? 0.9
                        : 1,
                  transform:
                    pinnedNoteCount > 0 && pressed
                      ? [{ scale: 0.98 }]
                      : [],
                })}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text
                    style={{
                      fontSize: typography.sm,
                      fontFamily: fontFamily.semibold,
                      color:
                        noteTaskStatusFilter === "pinned"
                          ? waFilter.onPinnedFg
                          : colors.primary,
                    }}
                  >
                    Pinned
                  </Text>
                  <Text
                    style={{
                      fontSize: typography.sm,
                      fontFamily: fontFamily.semibold,
                      fontVariant: ["tabular-nums"],
                      color:
                        noteTaskStatusFilter === "pinned"
                          ? waFilter.onPinnedFg
                          : waFilter.offCount,
                    }}
                  >
                    {` ${pinnedNoteCount}`}
                  </Text>
                </View>
              </Pressable>
            </ScrollView>

            {/* Search box + project dropdown */}
            <View style={{ gap: spacing.xs }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.sm,
                }}
              >
                <View
                  style={{
                    flex: 1,
                    minWidth: 0,
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: isDark ? "#2c2c2e" : "#f2f2f7",
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    height: 40,
                    borderWidth: (searchTrimmed || filterProject) ? 1.5 : 0,
                    borderColor: colors.primary,
                  }}
                >
                  <Iconify
                    icon="solar:magnifer-linear"
                    size={17}
                    color={colors.textTertiary}
                    style={{ marginRight: 8 }}
                  />
                  <TextInput
                    value={searchQuery}
                    onChangeText={(text) => {
                      setSearchQuery(text);
                      if (text.trim()) {
                        setShowProjectDropdown(false);
                      }
                    }}
                    placeholder="Search voice notes..."
                    placeholderTextColor={colors.textTertiary}
                    returnKeyType="search"
                    autoCorrect={false}
                    autoCapitalize="none"
                    style={{
                      flex: 1,
                      color: colors.textPrimary,
                      fontSize: typography.sm,
                      fontFamily: fontFamily.regular,
                      paddingVertical: 0,
                    }}
                  />
                  {(searchQuery || filterProject) ? (
                    <Pressable
                      onPress={() => {
                        setSearchQuery("");
                        setFilterProject(null);
                        setShowProjectDropdown(false);
                      }}
                      hitSlop={8}
                    >
                      <Iconify
                        icon="solar:close-circle-bold"
                        size={18}
                        color={colors.textTertiary}
                      />
                    </Pressable>
                  ) : null}
                </View>

                {projectSlugs.length > 0 ? (
                  <Pressable
                    onPress={() => {
                      setShowProjectDropdown((v) => !v);
                      void Haptics.selectionAsync();
                    }}
                    style={{
                      height: 40,
                      paddingHorizontal: 12,
                      borderRadius: 12,
                      backgroundColor: filterProject
                        ? waFilter.onGoldBg
                        : isDark
                          ? "#2c2c2e"
                          : "#f2f2f7",
                      borderWidth: filterProject ? 2 : showProjectDropdown ? 1.5 : 0,
                      borderColor: filterProject
                        ? waFilter.ringGold
                        : colors.primary,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Iconify
                      icon="solar:folder-linear"
                      size={16}
                      color={
                        filterProject
                          ? waFilter.onGoldFg
                          : colors.textSecondary
                      }
                    />
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: typography.sm,
                        fontFamily: fontFamily.semibold,
                        color: filterProject
                          ? waFilter.onGoldFg
                          : colors.textPrimary,
                        maxWidth: 100,
                      }}
                    >
                      {filterProject || "Project"}
                    </Text>
                    <Iconify
                      icon={showProjectDropdown ? "solar:alt-arrow-up-linear" : "solar:alt-arrow-down-linear"}
                      size={14}
                      color={
                        filterProject
                          ? waFilter.onGoldFg
                          : colors.textTertiary
                      }
                    />
                  </Pressable>
                ) : null}

                {filterUnread || noteTaskStatusFilter ? (
                  <Pressable
                    onPress={() => {
                      setFilterUnread(false);
                      setNoteTaskStatusFilter(null);
                    }}
                    hitSlop={10}
                    style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                  >
                    <Text
                      style={{
                        fontSize: typography.sm,
                        fontFamily: fontFamily.semibold,
                        color: colors.primary,
                      }}
                    >
                      Clear
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              {/* Project dropdown list */}
              {showProjectDropdown && projectSlugs.length > 0 ? (
                <ScrollView
                  style={{
                    maxHeight: 280,
                    backgroundColor: isDark ? "#2c2c2e" : "#ffffff",
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: isDark ? "#5c5c5e" : "rgba(0,0,0,0.1)",
                  }}
                  nestedScrollEnabled
                >
                  {projectSlugs.map((slug, index) => {
                    const selected = filterProject === slug;
                    return (
                      <Pressable
                        key={slug}
                        onPress={() => {
                          setFilterProject((v) => (v === slug ? null : slug));
                          setSearchQuery("");
                          setShowProjectDropdown(false);
                          void Haptics.selectionAsync();
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            paddingHorizontal: 14,
                            paddingVertical: 12,
                            backgroundColor: selected
                              ? "rgba(250, 204, 21, 0.15)"
                              : "transparent",
                            borderTopWidth: index > 0 ? StyleSheet.hairlineWidth : 0,
                            borderTopColor: isDark
                              ? "rgba(255,255,255,0.08)"
                              : "rgba(0,0,0,0.06)",
                          }}
                        >
                          <Iconify
                            icon={selected ? "solar:folder-bold" : "solar:folder-linear"}
                            size={16}
                            color={
                              selected ? colors.primary : colors.textSecondary
                            }
                            style={{ marginRight: 10 }}
                          />
                          <Text
                            style={{
                              flex: 1,
                              fontSize: typography.sm,
                              fontFamily: selected
                                ? fontFamily.semibold
                                : fontFamily.regular,
                              color: selected
                                ? colors.textPrimary
                                : colors.textSecondary,
                            }}
                          >
                            {slug}
                          </Text>
                          {selected ? (
                            <Iconify
                              icon="solar:check-read-linear"
                              size={18}
                              color={colors.primary}
                            />
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : null}
            </View>
          </View>
        )}

        {isLoading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : notes.length === 0 ? (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: spacing.lg,
            }}
          >
            <Text
              style={{
                color: colors.textTertiary,
                fontSize: typography.base,
                fontFamily: fontFamily.regular,
                textAlign: "center",
                lineHeight: 22,
              }}
            >
              No voice notes yet. Tap the mic to get started.
            </Text>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingTop: spacing.sm,
              paddingHorizontal: spacing.sm,
              paddingBottom: insets.bottom + 96,
              gap: spacing.md,
            }}
          >
            {isFiltering ? (
              <>
                {filteredTasks.length === 0 && (
                  <View
                    style={{
                      alignItems: "center",
                      justifyContent: "center",
                      paddingVertical: spacing.xxl,
                    }}
                  >
                    <Text
                      style={{
                        color: colors.textTertiary,
                        fontSize: typography.sm,
                        fontFamily: fontFamily.regular,
                      }}
                    >
                      No matching tasks
                    </Text>
                  </View>
                )}
                <View
                  style={{
                    backgroundColor: colors.backgroundElevated,
                    borderRadius: radii.md,
                    borderWidth: 1,
                    borderColor: colors.border,
                    overflow: "hidden",
                    paddingHorizontal: spacing.sm,
                  }}
                >
                  {filteredTasks.map((task, index) => (
                    <View
                      key={task.id}
                      style={{
                        marginTop: index === 0 ? 0 : spacing.md,
                      }}
                    >
                      <TaskListItem
                        title={task.summary || task.input}
                        status={task.status}
                        projectLabel={(task as any).project?.slug || (task as any).projectSlug || null}
                        createdAt={task.createdAt}
                        read={(task as any).read ?? true}
                        onPress={() => {
                          setSelectedTaskId(task.id);
                          setFollowUpText("");
                          setShowJumpToEnd(false);
                          setShowJumpToTop(false);
                          db.transact(db.tx.tasks[task.id].update({ read: true }));
                        }}
                      />
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <>
                {notes.length > 0 &&
                filteredNotes.length === 0 &&
                !isFiltering ? (
                  <View
                    style={{
                      alignItems: "center",
                      paddingVertical: spacing.xl,
                      paddingHorizontal: spacing.lg,
                    }}
                  >
                    <Text
                      style={{
                        color: colors.textTertiary,
                        fontSize: typography.sm,
                        fontFamily: fontFamily.regular,
                        textAlign: "center",
                      }}
                    >
                      {isSearching
                        ? `No results for "${searchTrimmed || filterProject}"`
                        : "No voice notes match these filters."}
                    </Text>
                  </View>
                ) : null}

                {filteredNotes.map(renderNoteCard)}
              </>
            )}
          </ScrollView>
        )}

        {/* FAB */}
        <RecordFAB
          isRecording={isRecording}
          isProcessing={isProcessing}
          bottomInset={insets.bottom}
          onPress={() => {
            if (isRecording) {
              stopRecording();
            } else {
              startRecording();
            }
          }}
        />

        {/* Recording bottom sheet */}
        <DictionarySheet
          visible={showDictionary}
          onClose={() => setShowDictionary(false)}
          terms={dictionaryTerms as (DictionaryTerm & { id: string })[]}
        />

        <RecordingSheet
          isVisible={isActive}
          duration={duration}
          metering={metering}
          isRecording={isRecording}
          isPaused={isPaused}
          isSaving={isSaving}
          error={recordingError}
          onDone={stopRecording}
          onPause={pauseRecording}
          onResume={resumeRecording}
          onDelete={cancelRecording}
        />

        {/* Task detail bottom sheet (Modal) */}
        <Modal
          visible={!!selectedTask}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => {
            cancelFollowUpRecording();
            setSelectedTaskId(null);
          }}
        >
          <KeyboardAvoidingView
            style={{ flex: 1, backgroundColor: colors.background }}
            behavior="padding"
          >
            {selectedTask && (
              <>
                {/* Modal header */}
                <SafeAreaView edges={["top"]}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingHorizontal: spacing.xl,
                      paddingVertical: spacing.md,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <View
                      accessibilityLabel={`Status: ${STATUS_LABELS[selectedTask.status] ?? "Pending"}`}
                      style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
                    >
                      <View
                        accessibilityElementsHidden
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 5,
                          backgroundColor: getStatusColor(selectedTask.status, colors),
                        }}
                      />
                      <Text
                        style={{
                          fontSize: typography.xs,
                          fontFamily: fontFamily.semibold,
                          color: getStatusColor(selectedTask.status, colors),
                          textTransform: "uppercase",
                          letterSpacing: typography.tracking.wider,
                        }}
                      >
                        {STATUS_LABELS[selectedTask.status] ?? selectedTask.status}
                      </Text>
                    </View>

                    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                      <Pressable
                        onPress={() => togglePin(selectedTask.id, (selectedTask as any).pinned === true)}
                        accessibilityRole="button"
                        accessibilityLabel={(selectedTask as any).pinned ? "Unpin action" : "Pin action"}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
                      >
                        <Iconify
                          icon={(selectedTask as any).pinned ? "solar:bookmark-bold" : "solar:bookmark-linear"}
                          size={20}
                          color={(selectedTask as any).pinned ? colors.primary : colors.textSecondary}
                        />
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          cancelFollowUpRecording();
                          setSelectedTaskId(null);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Close task details"
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
                      >
                        <Iconify icon="solar:close-square-linear" size={24} color={colors.textSecondary} />
                      </Pressable>
                    </View>
                  </View>
                </SafeAreaView>

                {/* Scrollable content */}
                <FlatList
                  ref={modalListRef}
                  data={[...(selectedTask.messages ?? [])].sort((a, b) => a.createdAt - b.createdAt)}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={{
                    padding: spacing.xl,
                    paddingBottom: 80,
                  }}
                  showsVerticalScrollIndicator={false}
                  onScroll={(e) => {
                    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                    modalListScrollY.current = contentOffset.y;
                    modalListContentHeight.current = contentSize.height;
                    modalListLayoutHeight.current = layoutMeasurement.height;
                    const distanceFromEnd = contentSize.height - layoutMeasurement.height - contentOffset.y;
                    setShowJumpToEnd(distanceFromEnd > 300);
                    setShowJumpToTop(contentOffset.y > 300);
                  }}
                  scrollEventThrottle={100}
                  onContentSizeChange={(_, contentHeight) => {
                    modalListContentHeight.current = contentHeight;
                    const distanceFromEnd = contentHeight - modalListLayoutHeight.current - modalListScrollY.current;
                    setShowJumpToEnd(distanceFromEnd > 300);
                  }}
                  onLayout={(e) => {
                    modalListLayoutHeight.current = e.nativeEvent.layout.height;
                    const distanceFromEnd = modalListContentHeight.current - e.nativeEvent.layout.height - modalListScrollY.current;
                    setShowJumpToEnd(distanceFromEnd > 300);
                  }}
                  ListHeaderComponent={
                    <>
                      {/* Task input */}
                      <Text
                        style={{
                          color: colors.textPrimary,
                          fontSize: typography.lg,
                          fontFamily: fontFamily.medium,
                          lineHeight: 26,
                          marginBottom: spacing.xs,
                        }}
                      >
                        {selectedTask.summary || selectedTask.input}
                      </Text>
                      <Text
                        style={{
                          color: colors.textTertiary,
                          fontSize: typography.xs,
                          fontFamily: fontFamily.regular,
                          marginBottom: spacing.lg,
                        }}
                      >
                        {relativeTime(selectedTask.createdAt)}
                      </Text>

                      {/* Error message */}
                      {selectedTask.errorMessage && (
                        <View
                          style={{
                            backgroundColor: colors.errorBgAlpha,
                            borderRadius: radii.md,
                            padding: spacing.md,
                            marginBottom: spacing.lg,
                          }}
                        >
                          <Text
                            style={{
                              color: colors.error,
                              fontSize: typography.sm,
                              fontFamily: fontFamily.regular,
                            }}
                          >
                            {selectedTask.errorMessage}
                          </Text>
                        </View>
                      )}

                      {/* Live activity feed (while running) */}
                      {selectedTask.status === "running" && selectedTask.liveOutput && (
                        <LiveActivityFeed
                          liveOutput={selectedTask.liveOutput}
                          colors={colors}
                        />
                      )}

                      {/* Cancel button */}
                      {["running", "pending", "blocked"].includes(selectedTask.status) &&
                        !selectedTask.cancelRequested && (
                        <Pressable
                          onPress={() => {
                            Alert.alert(
                              "Cancel Task",
                              selectedTask.status === "running"
                                ? "Are you sure you want to cancel this task?"
                                : "Are you sure you want to cancel this task before it runs?",
                              [
                                { text: "No", style: "cancel" },
                                {
                                  text: "Yes, Cancel",
                                  style: "destructive",
                                  onPress: () => cancelTask(selectedTask.id, selectedTask.status),
                                },
                              ]
                            );
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="Cancel task"
                          style={{
                            alignSelf: "flex-start",
                            flexDirection: "row",
                            alignItems: "center",
                            gap: spacing.xs,
                            paddingHorizontal: spacing.lg,
                            paddingVertical: spacing.md,
                            minHeight: 44,
                            backgroundColor: colors.errorBgAlpha,
                            borderRadius: radii.md,
                            marginBottom: spacing.xl,
                          }}
                        >
                          <Iconify icon="solar:close-circle-linear" size={16} color={colors.error} />
                          <Text
                            style={{
                              color: colors.error,
                              fontSize: typography.sm,
                              fontFamily: fontFamily.medium,
                            }}
                          >
                            Cancel
                          </Text>
                        </Pressable>
                      )}

                      {selectedTask.cancelRequested && selectedTask.status === "running" && (
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: spacing.sm,
                            marginBottom: spacing.xl,
                          }}
                        >
                          <ActivityIndicator size="small" color={colors.warning} />
                          <Text
                            style={{
                              color: colors.warning,
                              fontSize: typography.sm,
                              fontFamily: fontFamily.regular,
                            }}
                          >
                            Cancelling...
                          </Text>
                        </View>
                      )}

                      {/* Divider before thread */}
                      {((selectedTask.messages?.length ?? 0) > 0 || selectedTask.result) && (
                        <View
                          style={{
                            borderTopWidth: 1,
                            borderTopColor: colors.border,
                            paddingTop: spacing.lg,
                            marginBottom: spacing.md,
                          }}
                        />
                      )}
                    </>
                  }
                  ListFooterComponent={
                    selectedTask.result &&
                    selectedTask.status !== "running" &&
                    !(selectedTask.messages?.some((m: Message) => m.role === "user")) ? (
                      <View style={{ marginTop: spacing.md }}>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: spacing.sm,
                            marginBottom: spacing.sm,
                          }}
                        >
                          <Iconify icon="solar:check-circle-bold" size={14} color={colors.statusDone} />
                          <Text
                            style={{
                              color: colors.textTertiary,
                              fontSize: typography.xs,
                              fontFamily: fontFamily.semibold,
                              textTransform: "uppercase",
                              letterSpacing: typography.tracking.label,
                              flex: 1,
                            }}
                          >
                            Result
                          </Text>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                            <Pressable
                              onPress={(e) => { e.stopPropagation(); cycleTtsSpeed(); }}
                              style={{
                                paddingHorizontal: 10,
                                paddingVertical: 4,
                                borderRadius: radii.sm,
                                backgroundColor: colors.primaryAlpha20,
                                minWidth: 40,
                                alignItems: "center",
                              }}
                            >
                              <Text style={{ color: colors.primary, fontSize: typography.sm, fontFamily: fontFamily.bold }}>
                                {ttsSpeed}×
                              </Text>
                            </Pressable>
                            <Pressable
                              onPress={(e) => { e.stopPropagation(); toggleTts("result", selectedTask.result!); }}
                              style={{ padding: spacing.xs, minWidth: 36, minHeight: 36, alignItems: "center", justifyContent: "center" }}
                            >
                              <Iconify
                                icon={ttsActiveId === "result" ? "solar:stop-bold" : "solar:play-bold"}
                                size={20}
                                color={ttsActiveId === "result" ? colors.statusFailed : colors.textTertiary}
                              />
                            </Pressable>
                          </View>
                        </View>
                        <Markdown style={mdStyles} markdownit={markdownItInstance}>
                          {selectedTask.result}
                        </Markdown>
                      </View>
                    ) : null
                  }
                  renderItem={({ item: msg }: { item: Message }) => {
                    const isUser = msg.role === "user";
                    const msgTtsId = `msg-${msg.id}`;
                    return (
                      <View
                        style={{
                          alignSelf: isUser ? "flex-end" : "flex-start",
                          maxWidth: "85%",
                          marginBottom: spacing.md,
                        }}
                      >
                        <View
                          style={{
                            backgroundColor: isUser
                              ? colors.primaryAlpha20
                              : colors.backgroundElevated,
                            borderRadius: radii.lg,
                            paddingHorizontal: spacing.lg,
                            paddingVertical: spacing.md,
                            borderWidth: 1,
                            borderColor: isUser
                              ? colors.primaryAlpha30
                              : colors.borderLight,
                          }}
                        >
                          {isUser ? (
                            <Text
                              style={{
                                color: colors.textPrimary,
                                fontSize: typography.base,
                                fontFamily: fontFamily.regular,
                                lineHeight: 20,
                              }}
                            >
                              {msg.content}
                            </Text>
                          ) : (
                            <Markdown
                              style={{
                                ...mdStyles,
                                body: {
                                  ...mdStyles.body,
                                  lineHeight: 20,
                                },
                                strong: { fontFamily: fontFamily.bold },
                              }}
                              markdownit={markdownItInstance}
                            >
                              {msg.content}
                            </Markdown>
                          )}
                        </View>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            marginTop: spacing.xs,
                            alignSelf: isUser ? "flex-end" : "flex-start",
                            paddingHorizontal: spacing.xs,
                            gap: spacing.sm,
                          }}
                        >
                          <Text
                            style={{
                              color: colors.textMuted,
                              fontSize: typography.xs,
                              fontFamily: fontFamily.regular,
                            }}
                          >
                            {relativeTime(msg.createdAt)}
                          </Text>
                          {!isUser && (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                              <Pressable
                                onPress={(e) => { e.stopPropagation(); cycleTtsSpeed(); }}
                                style={{
                                  paddingHorizontal: 10,
                                  paddingVertical: 4,
                                  borderRadius: radii.sm,
                                  backgroundColor: colors.primaryAlpha20,
                                  minWidth: 40,
                                  alignItems: "center",
                                }}
                              >
                                <Text style={{ color: colors.primary, fontSize: typography.sm, fontFamily: fontFamily.bold }}>
                                  {ttsSpeed}×
                                </Text>
                              </Pressable>
                              <Pressable
                                onPress={(e) => { e.stopPropagation(); toggleTts(msgTtsId, msg.content); }}
                                style={{ minWidth: 36, minHeight: 28, alignItems: "center", justifyContent: "center" }}
                              >
                                <Iconify
                                  icon={ttsActiveId === msgTtsId ? "solar:stop-bold" : "solar:play-bold"}
                                  size={18}
                                  color={ttsActiveId === msgTtsId ? colors.statusFailed : colors.textMuted}
                                />
                              </Pressable>
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  }}
                />

                {/* Jump to top button */}
                {showJumpToTop && (
                  <Pressable
                    onPress={() => modalListRef.current?.scrollToOffset({ offset: 0, animated: true })}
                    style={{
                      position: "absolute",
                      right: spacing.xl,
                      bottom: showJumpToEnd ? 134 : 80,
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: colors.backgroundElevated,
                      borderWidth: 1,
                      borderColor: colors.border,
                      alignItems: "center",
                      justifyContent: "center",
                      ...shadows.sm,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Jump to top"
                  >
                    <Iconify icon="solar:alt-arrow-up-linear" size={20} color={colors.textSecondary} />
                  </Pressable>
                )}

                {/* Jump to end button */}
                {showJumpToEnd && (
                  <Pressable
                    onPress={() => modalListRef.current?.scrollToEnd({ animated: true })}
                    style={{
                      position: "absolute",
                      right: spacing.xl,
                      bottom: 80,
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: colors.backgroundElevated,
                      borderWidth: 1,
                      borderColor: colors.border,
                      alignItems: "center",
                      justifyContent: "center",
                      ...shadows.sm,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Jump to end"
                  >
                    <Iconify icon="solar:alt-arrow-down-linear" size={20} color={colors.textSecondary} />
                  </Pressable>
                )}

                {/* Follow-up input */}
                <SafeAreaView edges={["bottom"]}>
                  {isRecordingFollowUp ? (
                    /* Recording mode: full-width cancel / indicator / send */
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: spacing.lg,
                        paddingVertical: spacing.md,
                        borderTopWidth: 1,
                        borderTopColor: colors.error,
                        backgroundColor: colors.background,
                      }}
                    >
                      <Pressable
                        onPress={cancelFollowUpRecording}
                        hitSlop={12}
                        style={({ pressed }) => [
                          { minHeight: 44, justifyContent: "center" as const },
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        <Text
                          style={{
                            color: colors.textSecondary,
                            fontSize: typography.base,
                            fontFamily: fontFamily.medium,
                          }}
                        >
                          Cancel
                        </Text>
                      </Pressable>

                      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm }}>
                        <View
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: colors.error,
                          }}
                        />
                        <Text
                          style={{
                            color: colors.error,
                            fontSize: typography.sm,
                            fontFamily: fontFamily.medium,
                          }}
                        >
                          Recording...
                        </Text>
                      </View>

                      <Pressable
                        onPress={submitFollowUpRecording}
                        hitSlop={12}
                        style={({ pressed }) => [
                          {
                            backgroundColor: colors.primary,
                            borderRadius: radii.lg,
                            paddingHorizontal: spacing.lg,
                            paddingVertical: spacing.md,
                            minHeight: 44,
                            justifyContent: "center" as const,
                          },
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        <Text
                          style={{
                            color: colors.white,
                            fontSize: typography.base,
                            fontFamily: fontFamily.semibold,
                          }}
                        >
                          Send
                        </Text>
                      </Pressable>
                    </View>
                  ) : isTranscribingFollowUp ? (
                    /* Transcribing state */
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: spacing.sm,
                        paddingHorizontal: spacing.lg,
                        paddingVertical: spacing.md,
                        borderTopWidth: 1,
                        borderTopColor: colors.border,
                        backgroundColor: colors.background,
                      }}
                    >
                      <ActivityIndicator size="small" color={colors.primary} />
                      <Text
                        style={{
                          color: colors.textSecondary,
                          fontSize: typography.sm,
                          fontFamily: fontFamily.medium,
                        }}
                      >
                        Sending...
                      </Text>
                    </View>
                  ) : (
                    /* Default: text input with mic and send */
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: spacing.sm,
                        paddingHorizontal: spacing.lg,
                        paddingVertical: spacing.sm,
                        borderTopWidth: 1,
                        borderTopColor: colors.border,
                        backgroundColor: colors.background,
                      }}
                    >
                      <Pressable
                        onPress={startFollowUpRecording}
                        accessibilityRole="button"
                        accessibilityLabel="Record voice follow-up"
                        style={({ pressed }) => [
                          {
                            width: 44,
                            height: 44,
                            borderRadius: 22,
                            backgroundColor: colors.backgroundElevated,
                            alignItems: "center",
                            justifyContent: "center",
                          },
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        <Iconify icon="solar:microphone-bold" size={18} color={colors.textMuted} />
                      </Pressable>

                      <TextInput
                        value={followUpText}
                        onChangeText={setFollowUpText}
                        placeholder="Follow up..."
                        placeholderTextColor={colors.textMuted}
                        accessibilityLabel="Follow-up message"
                        accessibilityHint="Type a follow-up message to this task"
                        style={{
                          flex: 1,
                          backgroundColor: colors.backgroundElevated,
                          borderRadius: radii.lg,
                          borderWidth: 1,
                          borderColor: colors.borderLight,
                          paddingHorizontal: spacing.md,
                          paddingVertical: Platform.OS === "ios" ? 10 : 8,
                          color: colors.textPrimary,
                          fontSize: typography.base,
                          fontFamily: fontFamily.regular,
                          maxHeight: 100,
                        }}
                        multiline
                        returnKeyType="default"
                      />
                      <Pressable
                        onPress={sendFollowUp}
                        disabled={!followUpText.trim() || sendingFollowUp}
                        accessibilityRole="button"
                        accessibilityLabel="Send follow-up"
                        accessibilityState={{ disabled: !followUpText.trim() || sendingFollowUp }}
                        style={({ pressed }) => [
                          {
                            width: 44,
                            height: 44,
                            borderRadius: 22,
                            backgroundColor: followUpText.trim()
                              ? colors.primary
                              : colors.backgroundElevated,
                            alignItems: "center",
                            justifyContent: "center",
                          },
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        {sendingFollowUp ? (
                          <ActivityIndicator size="small" color={colors.white} />
                        ) : (
                          <Iconify
                            icon="solar:arrow-up-linear"
                            size={18}
                            color={followUpText.trim() ? colors.white : colors.textMuted}
                          />
                        )}
                      </Pressable>
                    </View>
                  )}
                </SafeAreaView>
              </>
            )}
          </KeyboardAvoidingView>
        </Modal>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}
