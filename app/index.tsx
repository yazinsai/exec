import { useState, useCallback, useRef, useEffect } from "react";
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
} from "react-native";
import Constants from "expo-constants";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Markdown from "react-native-markdown-display";
import * as Haptics from "expo-haptics";
import * as Updates from "expo-updates";
import { Ionicons } from "@expo/vector-icons";
import { id } from "@instantdb/react-native";
import { db } from "@/lib/db";
import { transcribeAudio } from "@/lib/transcription";
import { summarizeInput } from "@/lib/summarize";
import {
  requestAudioPermissions,
  configureAudioMode,
  saveRecordingLocally,
  RECORDING_OPTIONS,
} from "@/lib/audio";
import { Audio } from "expo-av";
import { NoteListItem } from "@/components/NoteListItem";
import { RecordFAB } from "@/components/RecordFAB";
import { RecordingSheet } from "@/components/RecordingSheet";
import { useThemeColors } from "@/hooks/useThemeColors";
import {
  spacing,
  typography,
  radii,
  fontFamily,
  shadows,
} from "@/constants/Colors";
import {
  getTaskSortWeight,
  NOTE_STATUSES,
} from "@/lib/workflow";
import type { InstaQLEntity } from "@instantdb/react-native";
import type { AppSchema } from "@/instant.schema";
import type { ThemeColors } from "@/constants/Colors";

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
  Read: { icon: "document-text-outline", label: "Reading" },
  Write: { icon: "create-outline", label: "Writing" },
  Edit: { icon: "pencil-outline", label: "Editing" },
  Glob: { icon: "search-outline", label: "Finding files" },
  Grep: { icon: "code-slash-outline", label: "Searching" },
  Bash: { icon: "terminal-outline", label: "Running" },
  Agent: { icon: "git-branch-outline", label: "Subagent" },
  WebSearch: { icon: "globe-outline", label: "Searching web" },
  WebFetch: { icon: "cloud-download-outline", label: "Fetching" },
  Skill: { icon: "flash-outline", label: "Using skill" },
};

type ActivityItem = {
  type: "tool" | "text" | "thinking";
  name?: string;
  detail?: string;
  content?: string;
  ts: number;
};

function LiveActivityFeed({
  liveOutput,
  colors,
}: {
  liveOutput: string;
  colors: ThemeColors;
}) {
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

  // Show last 8 items, most recent at bottom
  const visible = items.slice(-8);

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
      </View>

      {visible.map((item, i) => {
        const isLatest = i === visible.length - 1;
        const opacity = isLatest ? 1 : 0.5 + (i / visible.length) * 0.5;

        if (item.type === "tool") {
          const toolInfo = TOOL_ICONS[item.name || ""] || {
            icon: "ellipsis-horizontal-outline",
            label: item.name || "Tool",
          };
          return (
            <View
              key={`${item.ts}-${i}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
                opacity,
                paddingVertical: 3,
              }}
            >
              <Ionicons
                name={toolInfo.icon as any}
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
              key={`${item.ts}-${i}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
                opacity,
                paddingVertical: 3,
              }}
            >
              <Ionicons
                name="bulb-outline"
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
            key={`${item.ts}-${i}`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.sm,
              opacity,
              paddingVertical: 3,
            }}
          >
            <Ionicons
              name="chatbubble-outline"
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
  if (note.summary) return note.summary;
  if (note.transcript.trim()) return note.transcript.trim();
  if (note.status === NOTE_STATUSES.transcribing) return "Transcribing...";
  if (note.status === NOTE_STATUSES.pending || note.status === NOTE_STATUSES.triaging) {
    return "Processing note";
  }
  return "Voice note";
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
  const { colors } = useThemeColors();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [expandedNoteIds, setExpandedNoteIds] = useState<string[]>([]);
  const [followUpText, setFollowUpText] = useState("");
  const [sendingFollowUp, setSendingFollowUp] = useState(false);
  const [isRecordingFollowUp, setIsRecordingFollowUp] = useState(false);
  const [isTranscribingFollowUp, setIsTranscribingFollowUp] = useState(false);
  const followUpRecordingRef = useRef<Audio.Recording | null>(null);

  const insets = useSafeAreaInsets();

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
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
  const releaseInfo = getReleaseInfo();

  const isActive = isRecording || isSaving;

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

  // Transcribe a note's audio file and update it in InstantDB
  const transcribeNote = useCallback(async (noteId: string, filePath: string) => {
    try {
      const transcription = await transcribeAudio(filePath);
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
  }, []);

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
  const allTasks = notes.flatMap((note) => (note.tasks ?? []) as Task[]);
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
    setDuration(0);
    setMetering(-160);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, []);

  const stopRecording = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) return;
    recordingRef.current = null;

    setIsSaving(true);
    setIsRecording(false);
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

      // Create note immediately in InstantDB (before transcription)
      const now = Date.now();
      await db.transact(
        db.tx.notes[noteId].update({
          transcript: "",
          status: NOTE_STATUSES.transcribing,
          summary: "Transcribing...",
          source: "phone",
          audioFilePath: filePath,
          createdAt: now,
        })
      );

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Transcribe in background (non-blocking)
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
      const transcription = await transcribeAudio(filePath);
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
  }, [selectedTask]);

  // Cancel task handler
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
    },
    link: {
      color: colors.primary,
    },
    blockquote: {
      backgroundColor: colors.backgroundElevated,
      borderLeftColor: colors.primary,
      borderLeftWidth: 3,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.xs,
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
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.md,
            paddingBottom: spacing.lg,
          }}
        >
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
              paddingHorizontal: spacing.xxl,
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
              paddingHorizontal: spacing.lg,
              paddingBottom: insets.bottom + 64 + 32,
              gap: spacing.md,
            }}
          >
            {notes.length > 0 && (
              <Text
                style={{
                  color: colors.textTertiary,
                  fontSize: typography.xs,
                  fontFamily: fontFamily.semibold,
                  textTransform: "uppercase",
                  letterSpacing: typography.tracking.wider,
                }}
              >
                Voice Notes
              </Text>
            )}
            {notes.map((item) => {
              const noteTasks = ([...(item.tasks ?? [])] as Task[]).sort((a, b) => {
                const weightDiff = getTaskSortWeight(a.status) - getTaskSortWeight(b.status);
                if (weightDiff !== 0) return weightDiff;
                const extractionDiff = ((a as any).extractionIndex ?? 999) - ((b as any).extractionIndex ?? 999);
                if (extractionDiff !== 0) return extractionDiff;
                return a.createdAt - b.createdAt;
              });

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
                  }))}
                  expanded={expandedNoteIds.includes(item.id)}
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
                  }}
                  onRetryTranscription={
                    item.status === NOTE_STATUSES.transcriptionFailed && item.audioFilePath
                      ? () => retryTranscription(item.id, item.audioFilePath)
                      : undefined
                  }
                  onRetryExtraction={
                    item.status === NOTE_STATUSES.triageFailed
                      ? () => retryExtraction(item.id)
                      : undefined
                  }
                />
              );
            })}
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
        <RecordingSheet
          isVisible={isActive}
          duration={duration}
          metering={metering}
          isRecording={isRecording}
          isSaving={isSaving}
          error={recordingError}
          onDone={stopRecording}
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
                        {selectedTask.status}
                      </Text>
                    </View>

                    <Pressable
                      onPress={() => {
                        cancelFollowUpRecording();
                        setSelectedTaskId(null);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Close task details"
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="close" size={24} color={colors.textSecondary} />
                    </Pressable>
                  </View>
                </SafeAreaView>

                {/* Scrollable content */}
                <FlatList
                  ref={modalListRef}
                  data={[...(selectedTask.messages ?? [])].sort((a, b) => a.createdAt - b.createdAt)}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={{
                    padding: spacing.xl,
                    paddingBottom: 100,
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
                            paddingHorizontal: spacing.md,
                            paddingVertical: spacing.sm,
                            backgroundColor: colors.errorBgAlpha,
                            borderRadius: radii.md,
                            marginBottom: spacing.xl,
                          }}
                        >
                          <Ionicons name="close-circle-outline" size={16} color={colors.error} />
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
                          <Ionicons name="checkmark-circle" size={14} color={colors.statusDone} />
                          <Text
                            style={{
                              color: colors.textTertiary,
                              fontSize: typography.xs,
                              fontFamily: fontFamily.semibold,
                              textTransform: "uppercase",
                              letterSpacing: typography.tracking.label,
                            }}
                          >
                            Result
                          </Text>
                        </View>
                        <Markdown style={mdStyles}>
                          {selectedTask.result}
                        </Markdown>
                      </View>
                    ) : null
                  }
                  renderItem={({ item: msg }: { item: Message }) => {
                    const isUser = msg.role === "user";
                    return (
                      <View
                        style={{
                          alignSelf: isUser ? "flex-end" : "flex-start",
                          maxWidth: "85%",
                          marginBottom: spacing.sm,
                        }}
                      >
                        <View
                          style={{
                            backgroundColor: isUser
                              ? colors.primaryAlpha20
                              : colors.backgroundElevated,
                            borderRadius: radii.lg,
                            paddingHorizontal: spacing.md,
                            paddingVertical: spacing.sm,
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
                                body: {
                                  color: colors.textPrimary,
                                  fontSize: typography.base,
                                  fontFamily: fontFamily.regular,
                                  lineHeight: 20,
                                },
                                strong: { fontFamily: fontFamily.bold },
                                code_inline: {
                                  backgroundColor: colors.backgroundElevated,
                                  color: colors.primary,
                                  fontFamily: "SpaceMono",
                                  fontSize: typography.sm,
                                  paddingHorizontal: 4,
                                  borderRadius: 4,
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
                                },
                                table: { borderColor: colors.borderLight },
                                th: { borderColor: colors.borderLight, padding: 6 },
                                td: { borderColor: colors.borderLight, padding: 6 },
                              }}
                            >
                              {msg.content}
                            </Markdown>
                          )}
                        </View>
                        <Text
                          style={{
                            color: colors.textMuted,
                            fontSize: 10,
                            fontFamily: fontFamily.regular,
                            marginTop: 2,
                            alignSelf: isUser ? "flex-end" : "flex-start",
                            paddingHorizontal: spacing.xs,
                          }}
                        >
                          {relativeTime(msg.createdAt)}
                        </Text>
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
                      bottom: showJumpToEnd ? 130 : 80,
                      width: 40,
                      height: 40,
                      borderRadius: 20,
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
                    <Ionicons name="chevron-up" size={20} color={colors.textSecondary} />
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
                      width: 40,
                      height: 40,
                      borderRadius: 20,
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
                    <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
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
                        style={({ pressed }) => [pressed && { opacity: 0.7 }]}
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
                            paddingVertical: spacing.sm,
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
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={({ pressed }) => [
                          {
                            width: 40,
                            height: 40,
                            borderRadius: 20,
                            backgroundColor: colors.backgroundElevated,
                            alignItems: "center",
                            justifyContent: "center",
                          },
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        <Ionicons name="mic" size={18} color={colors.textMuted} />
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
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={({ pressed }) => [
                          {
                            width: 40,
                            height: 40,
                            borderRadius: 20,
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
                          <Ionicons
                            name="arrow-up"
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
