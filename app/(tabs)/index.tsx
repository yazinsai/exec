import { useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  SectionList,
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
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Markdown from "react-native-markdown-display";
import MarkdownIt from "markdown-it";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import { Ionicons } from "@expo/vector-icons";
import { id } from "@instantdb/react-native";
import { db } from "@/lib/db";
import { TaskListItem } from "@/components/TaskListItem";
import { RecordFAB } from "@/components/RecordFAB";
import { RecordingSheet } from "@/components/RecordingSheet";
import { useThemeColors } from "@/hooks/useThemeColors";
import {
  spacing,
  typography,
  radii,
  fontFamily,
} from "@/constants/Colors";
import {
  TASK_STATUSES,
  formatTaskStatusLabel,
} from "@/lib/workflow";
import { transcribeAudio, buildDictionaryPrompt } from "@/lib/transcription";
import type { DictionaryTerm } from "@/lib/transcription";
import {
  requestAudioPermissions,
  configureAudioMode,
  saveRecordingLocally,
  RECORDING_OPTIONS,
} from "@/lib/audio";
import {
  enqueueRecording,
} from "@/lib/offlineQueue";
import { summarizeInput } from "@/lib/summarize";
import { Audio } from "expo-av";
import type { InstaQLEntity } from "@instantdb/react-native";
import type { AppSchema } from "@/instant.schema";
import type { ThemeColors } from "@/constants/Colors";

type Task = InstaQLEntity<AppSchema, "tasks", {
  messages: {};
  project: {};
  dependencies: { dependsOn: {} };
}>;
type Message = InstaQLEntity<AppSchema, "messages">;

const markdownItInstance = MarkdownIt({ typographer: true, linkify: true });

function getStatusColor(status: string, colors: ThemeColors): string {
  const map: Record<string, string> = {
    pending: colors.statusPending,
    blocked: colors.warning,
    running: colors.statusRunning,
    done: colors.statusDone,
    failed: colors.statusFailed,
    cancelled: colors.statusCancelled,
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
};

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

type StatusFilter = "all" | "running" | "pending" | "done" | "failed" | "blocked" | "cancelled";

export default function ActionsScreen() {
  const { colors, isDark } = useThemeColors();
  const insets = useSafeAreaInsets();

  // Query all tasks directly
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

  const notes = (((notesData as any)?.notes) ?? []) as any[];
  const allTasks = useMemo(() => {
    return notes
      .flatMap((note: any) => (note.tasks ?? []) as Task[])
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [notes]);

  // Filters
  type ViewMode = "unread" | "all" | "pinned";
  const [viewMode, setViewMode] = useState<ViewMode>("unread");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Task detail modal
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [followUpText, setFollowUpText] = useState("");
  const [sendingFollowUp, setSendingFollowUp] = useState(false);
  const [isRecordingFollowUp, setIsRecordingFollowUp] = useState(false);
  const [isTranscribingFollowUp, setIsTranscribingFollowUp] = useState(false);
  const followUpRecordingRef = useRef<Audio.Recording | null>(null);
  const modalListRef = useRef<FlatList>(null);

  // TTS state
  const [ttsActiveId, setTtsActiveId] = useState<string | null>(null);
  const [ttsSpeed, setTtsSpeed] = useState<1 | 1.5 | 2>(1);
  const TTS_SPEEDS = [1, 1.5, 2] as const;

  // Recording state (for FAB)
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

  const isActive = isRecording || isPaused || isSaving;

  // Check permission on mount
  useState(() => {
    requestAudioPermissions().then(setHasPermission);
  });

  // Dictionary for transcription
  const { data: dictData } = db.useQuery({ dictionaryTerms: {} });
  const dictionaryTerms = ((dictData as any)?.dictionaryTerms ?? []) as DictionaryTerm[];
  const dictionaryPrompt = useMemo(
    () => buildDictionaryPrompt(dictionaryTerms),
    [dictionaryTerms]
  );

  // Derived data
  const projectSlugs = useMemo(() => {
    const slugs = new Set<string>();
    for (const task of allTasks) {
      const slug = (task as any).project?.slug || (task as any).projectSlug;
      if (slug) slugs.add(slug);
    }
    return Array.from(slugs).sort();
  }, [allTasks]);

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: allTasks.length,
      running: 0, pending: 0, done: 0, failed: 0, blocked: 0, cancelled: 0,
    };
    for (const t of allTasks) {
      if (t.status in counts) counts[t.status as StatusFilter]++;
    }
    return counts;
  }, [allTasks]);

  const unreadCount = useMemo(
    () => allTasks.filter((t) => (t as any).read === false).length,
    [allTasks]
  );
  const pinnedCount = useMemo(
    () => allTasks.filter((t) => (t as any).pinned === true).length,
    [allTasks]
  );

  const filteredTasks = useMemo(() => {
    return allTasks.filter((t) => {
      if (viewMode === "unread" && (t as any).read !== false) return false;
      if (viewMode === "pinned" && (t as any).pinned !== true) return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (projectFilter) {
        const slug = (t as any).project?.slug || (t as any).projectSlug;
        if (slug !== projectFilter) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const title = (t.summary || t.input || "").toLowerCase();
        if (!title.includes(q)) return false;
      }
      return true;
    });
  }, [allTasks, viewMode, statusFilter, projectFilter, searchQuery]);

  const groupedSections = useMemo(() => {
    const groups = new Map<string, Task[]>();
    for (const t of filteredTasks) {
      const slug = (t as any).project?.slug || (t as any).projectSlug || "";
      if (!groups.has(slug)) groups.set(slug, []);
      groups.get(slug)!.push(t);
    }
    // Named projects first (sorted), then ungrouped at the end
    const sections: { title: string; data: Task[] }[] = [];
    const sorted = [...groups.keys()].filter(Boolean).sort();
    for (const slug of sorted) {
      sections.push({ title: slug, data: groups.get(slug)! });
    }
    if (groups.has("")) {
      sections.push({ title: "Other", data: groups.get("")! });
    }
    return sections;
  }, [filteredTasks]);

  const selectedTask = selectedTaskId
    ? allTasks.find((task) => task.id === selectedTaskId) ?? null
    : null;

  // Recording handlers (simplified — same as notes tab)
  const transcribeNote = useCallback(async (noteId: string, filePath: string) => {
    try {
      const transcription = await transcribeAudio(filePath, dictionaryPrompt || undefined);
      if (!transcription || transcription.trim().length === 0) {
        await db.transact(
          db.tx.notes[noteId].update({
            status: "transcription_failed",
            errorMessage: "No speech detected",
          })
        );
        return;
      }
      const trimmedInput = transcription.trim();
      await db.transact(
        db.tx.notes[noteId].update({
          transcript: trimmedInput,
          status: "pending",
          errorMessage: "",
          transcribedAt: Date.now(),
        })
      );
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      summarizeInput(trimmedInput).then((summary) => {
        if (summary) db.transact(db.tx.notes[noteId].update({ summary }));
      });
    } catch (error) {
      await db.transact(
        db.tx.notes[noteId].update({
          status: "transcription_failed",
          errorMessage: error instanceof Error ? error.message : "Transcription failed",
        })
      );
    }
  }, [dictionaryPrompt]);

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
      durationIntervalRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
      meteringIntervalRef.current = setInterval(async () => {
        try {
          const status = await recording.getStatusAsync();
          if (status.isRecording && status.metering !== undefined) {
            setMetering(status.metering);
          }
        } catch {}
      }, 100);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      console.error("Failed to start recording:", error);
      setRecordingError("Failed to start recording");
      setTimeout(() => setRecordingError(null), 1500);
    }
  }, [hasPermission, isProcessing]);

  const stopRecording = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) return;
    recordingRef.current = null;
    setIsRecording(false);
    setIsPaused(false);
    setIsSaving(true);
    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    if (meteringIntervalRef.current) clearInterval(meteringIntervalRef.current);
    durationIntervalRef.current = null;
    meteringIntervalRef.current = null;
    setIsProcessing(true);
    try {
      const status = await recording.getStatusAsync();
      if (status.canRecord) await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const noteId = id();
      const { filePath } = await saveRecordingLocally(recording, noteId);
      await enqueueRecording({ noteId, filePath, createdAt: Date.now() });
      try {
        await db.transact(
          db.tx.notes[noteId].update({
            transcript: "",
            status: "transcribing",
            summary: "Transcribing...",
            source: "phone",
            audioFilePath: filePath,
            createdAt: Date.now(),
          })
        );
      } catch {}
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

  const cancelRecording = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) return;
    recordingRef.current = null;
    setIsRecording(false);
    setIsPaused(false);
    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    if (meteringIntervalRef.current) clearInterval(meteringIntervalRef.current);
    durationIntervalRef.current = null;
    meteringIntervalRef.current = null;
    try {
      const status = await recording.getStatusAsync();
      if (status.canRecord) await recording.stopAndUnloadAsync();
    } catch {}
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
    setDuration(0);
    setMetering(-160);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, []);

  const pauseRecording = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) return;
    try { await recording.pauseAsync(); } catch {}
    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    durationIntervalRef.current = null;
    setIsPaused(true);
  }, []);

  const resumeRecording = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) return;
    try { await recording.startAsync(); } catch {}
    durationIntervalRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    setIsPaused(false);
  }, []);

  // Task actions
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
    } catch {}
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
    } catch {}
  }, []);

  // Follow-up send
  const sendFollowUp = useCallback(async () => {
    if (!selectedTask || !followUpText.trim()) return;
    setSendingFollowUp(true);
    try {
      const messageId = id();
      await db.transact([
        db.tx.messages[messageId]
          .update({ role: "user", content: followUpText.trim(), createdAt: Date.now() })
          .link({ task: selectedTask.id }),
        ...(selectedTask.status === "done" || selectedTask.status === "failed" || selectedTask.status === "cancelled"
          ? [db.tx.tasks[selectedTask.id].update({ status: "pending" })]
          : []),
      ]);
      setFollowUpText("");
      Keyboard.dismiss();
    } catch {}
    setSendingFollowUp(false);
  }, [selectedTask, followUpText]);

  // Follow-up voice recording
  const startFollowUpRecording = useCallback(async () => {
    if (hasPermission === false) return;
    try {
      Keyboard.dismiss();
      await configureAudioMode();
      const { recording } = await Audio.Recording.createAsync(RECORDING_OPTIONS);
      followUpRecordingRef.current = recording;
      setIsRecordingFollowUp(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  }, [hasPermission]);

  const cancelFollowUpRecording = useCallback(async () => {
    const recording = followUpRecordingRef.current;
    if (!recording) return;
    followUpRecordingRef.current = null;
    setIsRecordingFollowUp(false);
    try {
      const status = await recording.getStatusAsync();
      if (status.canRecord) await recording.stopAndUnloadAsync();
    } catch {}
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
        await db.transact([
          db.tx.messages[messageId]
            .update({ role: "user", content: trimmed, createdAt: Date.now() })
            .link({ task: selectedTask.id }),
          ...(selectedTask.status === "done" || selectedTask.status === "failed" || selectedTask.status === "cancelled"
            ? [db.tx.tasks[selectedTask.id].update({ status: "pending" })]
            : []),
        ]);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {}
    setIsTranscribingFollowUp(false);
  }, [selectedTask, dictionaryPrompt]);

  // TTS
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
    setTtsActiveId(contentId);
    Speech.speak(stripMarkdown(text), {
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
    if (ttsActiveId) { Speech.stop(); setTtsActiveId(null); }
  }, [ttsSpeed, ttsActiveId, TTS_SPEEDS]);

  // Markdown styles
  const mdStyles = {
    body: {
      color: colors.textPrimary,
      fontSize: typography.base,
      fontFamily: fontFamily.regular,
      lineHeight: 22,
    },
    heading1: { color: colors.textPrimary, fontSize: typography.xl, fontFamily: fontFamily.bold, marginTop: spacing.lg, marginBottom: spacing.sm },
    heading2: { color: colors.textPrimary, fontSize: typography.lg, fontFamily: fontFamily.semibold, marginTop: spacing.lg, marginBottom: spacing.sm },
    heading3: { color: colors.textPrimary, fontSize: typography.md, fontFamily: fontFamily.semibold, marginTop: spacing.md, marginBottom: spacing.xs },
    code_inline: { backgroundColor: colors.backgroundElevated, color: colors.primaryLight, fontFamily: fontFamily.mono, fontSize: typography.sm, paddingHorizontal: 4, borderRadius: radii.xs },
    code_block: { backgroundColor: colors.backgroundElevated, padding: spacing.md, borderRadius: radii.md, fontFamily: fontFamily.mono, fontSize: typography.sm, color: colors.textSecondary },
    fence: { backgroundColor: colors.backgroundElevated, padding: spacing.md, borderRadius: radii.md, fontFamily: fontFamily.mono, fontSize: typography.sm, color: colors.textSecondary },
    pre: { backgroundColor: colors.backgroundElevated, borderRadius: radii.md, padding: spacing.sm },
    link: { color: colors.primary, textDecorationLine: "underline" as const },
    blockquote: { backgroundColor: colors.backgroundPressed, borderLeftColor: colors.primary, borderLeftWidth: 3, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.xs, borderWidth: 0 },
    text: { color: colors.textPrimary },
    textgroup: { color: colors.textPrimary },
    bullet_list_icon: { color: colors.textTertiary },
    ordered_list_icon: { color: colors.textTertiary, fontFamily: fontFamily.regular },
    list_item: { marginBottom: spacing.xs },
    hr: { backgroundColor: colors.border },
  };

  // Filter pill style helper
  const pillStyle = (active: boolean) => ({
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: active ? colors.primary : (isDark ? "#2c2c2e" : "#ffffff"),
    borderWidth: 1,
    borderColor: active ? colors.primary : (isDark ? "#5c5c5e" : "rgba(0,0,0,0.12)"),
    minHeight: 44,
    justifyContent: "center" as const,
  });

  const pillTextStyle = (active: boolean) => ({
    fontSize: typography.sm,
    fontFamily: fontFamily.semibold,
    color: active ? (isDark ? "#000" : "#000") : colors.textSecondary,
  });

  const openTask = useCallback((taskId: string) => {
    setSelectedTaskId(taskId);
    setFollowUpText("");
    db.transact(db.tx.tasks[taskId].update({ read: true }));
  }, []);

  const togglePin = useCallback((taskId: string, currentPinned: boolean) => {
    db.transact(db.tx.tasks[taskId].update({ pinned: !currentPinned }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.sm, paddingTop: spacing.md, paddingBottom: spacing.sm }}>
          <Text style={{ fontSize: typography.xxl, fontFamily: fontFamily.bold, color: colors.textPrimary, letterSpacing: -0.5 }}>
            Actions
          </Text>

          {/* View mode toggle */}
          <View style={{
            flexDirection: "row",
            backgroundColor: isDark ? "#2c2c2e" : "#f0f0f0",
            borderRadius: radii.full,
            padding: 3,
          }}>
            {(["unread", "pinned", "all"] as ViewMode[]).map((mode) => {
              const active = viewMode === mode;
              const label = mode === "unread"
                ? `Unread${unreadCount > 0 ? ` ${unreadCount}` : ""}`
                : mode === "pinned"
                  ? `Pinned${pinnedCount > 0 ? ` ${pinnedCount}` : ""}`
                  : "All";
              return (
                <Pressable
                  key={mode}
                  onPress={() => {
                    setViewMode(mode);
                    if (mode === "pinned") {
                      setStatusFilter("all");
                      setProjectFilter(null);
                      setSearchQuery("");
                    }
                  }}
                  style={{
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.xs,
                    borderRadius: radii.full,
                    backgroundColor: active ? colors.primary : "transparent",
                    minHeight: 32,
                    justifyContent: "center",
                  }}
                >
                  <Text style={{
                    fontSize: typography.xs,
                    fontFamily: fontFamily.semibold,
                    color: active ? "#000" : colors.textMuted,
                  }}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Search bar */}
        <View style={{ paddingHorizontal: spacing.sm, paddingBottom: spacing.sm }}>
          <View style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: colors.backgroundElevated,
            borderRadius: radii.md,
            borderWidth: 1,
            borderColor: colors.borderLight,
            paddingHorizontal: spacing.md,
            minHeight: 40,
          }}>
            <Ionicons name="search-outline" size={16} color={colors.textMuted} />
            <TextInput
              placeholder="Search actions..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={{
                flex: 1,
                marginLeft: spacing.sm,
                color: colors.textPrimary,
                fontSize: typography.base,
                fontFamily: fontFamily.regular,
                paddingVertical: Platform.OS === "ios" ? 8 : 6,
              }}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </Pressable>
            )}
          </View>
        </View>

        {/* Status filter bar */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: spacing.sm,
            paddingBottom: spacing.sm,
            gap: spacing.xs,
          }}
        >
          {(["all", "running", "pending", "done", "failed", "blocked"] as StatusFilter[]).map((s) => {
            const active = statusFilter === s;
            const count = statusCounts[s];
            if (s !== "all" && count === 0) return null;
            return (
              <Pressable
                key={s}
                onPress={() => setStatusFilter(s)}
                style={pillStyle(active)}
              >
                <Text style={pillTextStyle(active)}>
                  {s === "all" ? "All" : formatTaskStatusLabel(s)}{" "}
                  <Text style={{ fontFamily: fontFamily.regular, opacity: 0.7 }}>{count}</Text>
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Project filter bar */}
        {projectSlugs.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: spacing.sm,
              paddingBottom: spacing.sm,
              gap: spacing.xs,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            {projectSlugs.map((slug) => {
              const active = projectFilter === slug;
              return (
                <Pressable
                  key={slug}
                  onPress={() => setProjectFilter(active ? null : slug)}
                  style={pillStyle(active)}
                >
                  <Text style={pillTextStyle(active)}>{slug}</Text>
                </Pressable>
              );
            })}
            {projectFilter && (
              <Pressable
                onPress={() => setProjectFilter(null)}
                style={{ ...pillStyle(false), borderColor: colors.statusFailed }}
              >
                <Text style={{ ...pillTextStyle(false), color: colors.statusFailed }}>Clear</Text>
              </Pressable>
            )}
          </ScrollView>
        )}

        {/* Task list */}
        {isLoading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : filteredTasks.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg }}>
            <Text style={{ color: colors.textTertiary, fontSize: typography.base, fontFamily: fontFamily.regular, textAlign: "center" }}>
              {allTasks.length === 0 ? "No actions yet. Record a voice note to get started." : "No matching actions"}
            </Text>
          </View>
        ) : (
          <SectionList
            sections={groupedSections}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{
              paddingHorizontal: spacing.sm,
              paddingTop: spacing.xs,
              paddingBottom: insets.bottom + 96,
            }}
            stickySectionHeadersEnabled={false}
            ItemSeparatorComponent={() => <View style={{ height: spacing.xs }} />}
            renderSectionHeader={({ section }) => (
              <View style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.xs,
                marginTop: spacing.md,
              }}>
                <Ionicons
                  name={section.title === "Other" ? "layers-outline" : "folder-outline"}
                  size={14}
                  color={colors.textTertiary}
                />
                <Text style={{
                  color: colors.textTertiary,
                  fontSize: typography.xs,
                  fontFamily: fontFamily.semibold,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}>
                  {section.title}
                </Text>
                <Text style={{
                  color: colors.textMuted,
                  fontSize: typography.xs,
                  fontFamily: fontFamily.regular,
                }}>
                  {section.data.length}
                </Text>
              </View>
            )}
            renderItem={({ item: task }) => (
              <TaskListItem
                title={task.summary || task.input}
                status={task.status}
                projectLabel={null}
                createdAt={task.createdAt}
                read={(task as any).read ?? true}
                pinned={(task as any).pinned === true}
                onPress={() => openTask(task.id)}
                onTogglePin={() => togglePin(task.id, (task as any).pinned === true)}
              />
            )}
          />
        )}

        {/* FAB */}
        <RecordFAB
          isRecording={isRecording}
          isProcessing={isProcessing}
          bottomInset={insets.bottom}
          onPress={() => {
            if (isRecording) stopRecording();
            else startRecording();
          }}
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

        {/* Task detail modal */}
        <Modal
          visible={!!selectedTask}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => {
            cancelFollowUpRecording();
            Speech.stop();
            setTtsActiveId(null);
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
                  <View style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: spacing.xl,
                    paddingVertical: spacing.md,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                      <View style={{
                        width: 8, height: 8, borderRadius: 4,
                        backgroundColor: getStatusColor(selectedTask.status, colors),
                      }} />
                      <Text style={{
                        color: colors.textSecondary,
                        fontSize: typography.sm,
                        fontFamily: fontFamily.semibold,
                      }}>
                        {STATUS_LABELS[selectedTask.status] ?? "Pending"}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                      <Pressable
                        onPress={() => togglePin(selectedTask.id, (selectedTask as any).pinned === true)}
                        hitSlop={12}
                        style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
                      >
                        <Ionicons
                          name={(selectedTask as any).pinned ? "bookmark" : "bookmark-outline"}
                          size={20}
                          color={(selectedTask as any).pinned ? colors.primary : colors.textSecondary}
                        />
                      </Pressable>
                      {selectedTask.status === "done" || selectedTask.status === "failed" || selectedTask.status === "cancelled" ? (
                        <Pressable
                          onPress={() => retryTask(selectedTask.id)}
                          hitSlop={12}
                          style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
                        >
                          <Ionicons name="refresh" size={20} color={colors.textSecondary} />
                        </Pressable>
                      ) : null}
                      {selectedTask.status !== "done" && selectedTask.status !== "cancelled" ? (
                        <Pressable
                          onPress={() => {
                            Alert.alert("Cancel Task", "Are you sure?", [
                              { text: "No", style: "cancel" },
                              { text: "Cancel Task", style: "destructive", onPress: () => cancelTask(selectedTask.id, selectedTask.status) },
                            ]);
                          }}
                          hitSlop={12}
                          style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
                        >
                          <Ionicons name="close-circle-outline" size={20} color={colors.statusFailed} />
                        </Pressable>
                      ) : null}
                      <Pressable
                        onPress={() => { cancelFollowUpRecording(); Speech.stop(); setTtsActiveId(null); setSelectedTaskId(null); }}
                        hitSlop={12}
                        style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
                      >
                        <Ionicons name="chevron-down" size={24} color={colors.textSecondary} />
                      </Pressable>
                    </View>
                  </View>
                </SafeAreaView>

                {/* Messages + result */}
                <FlatList
                  ref={modalListRef}
                  style={{ flex: 1 }}
                  contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxl }}
                  ListHeaderComponent={
                    <>
                      <Text style={{
                        fontSize: typography.lg,
                        fontFamily: fontFamily.bold,
                        color: colors.textPrimary,
                        marginBottom: spacing.sm,
                        lineHeight: 24,
                      }}>
                        {selectedTask.summary || selectedTask.input}
                      </Text>
                      <Text style={{
                        color: colors.textMuted,
                        fontSize: typography.xs,
                        fontFamily: fontFamily.regular,
                        marginBottom: spacing.lg,
                      }}>
                        {relativeTime(selectedTask.createdAt)}
                      </Text>

                      {/* Live output */}
                      {selectedTask.status === "running" && (selectedTask as any).liveOutput ? (
                        <View style={{
                          backgroundColor: colors.backgroundElevated,
                          borderRadius: radii.md,
                          padding: spacing.md,
                          marginBottom: spacing.lg,
                          borderWidth: 1,
                          borderColor: colors.borderLight,
                        }}>
                          <Text style={{ color: colors.textSecondary, fontSize: typography.sm, fontFamily: fontFamily.mono, lineHeight: 18 }} numberOfLines={12}>
                            {(selectedTask as any).liveOutput}
                          </Text>
                        </View>
                      ) : null}

                      {((selectedTask.messages?.length ?? 0) > 0 || selectedTask.result) && (
                        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.lg, marginBottom: spacing.md }} />
                      )}
                    </>
                  }
                  ListFooterComponent={
                    selectedTask.result && selectedTask.status !== "running" && !(selectedTask.messages?.some((m: Message) => m.role === "user")) ? (
                      <View style={{ marginTop: spacing.md }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm }}>
                          <Ionicons name="checkmark-circle" size={14} color={colors.statusDone} />
                          <Text style={{ color: colors.textTertiary, fontSize: typography.xs, fontFamily: fontFamily.semibold, textTransform: "uppercase", flex: 1 }}>Result</Text>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
                            {ttsActiveId === "result" && (
                              <Pressable onPress={cycleTtsSpeed} hitSlop={8} style={{ paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radii.sm, backgroundColor: colors.primaryAlpha20 }}>
                                <Text style={{ color: colors.primary, fontSize: typography.xs, fontFamily: fontFamily.semibold }}>{ttsSpeed}×</Text>
                              </Pressable>
                            )}
                            <Pressable onPress={() => toggleTts("result", selectedTask.result!)} hitSlop={12} style={{ padding: spacing.xs, minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}>
                              <Ionicons name={ttsActiveId === "result" ? "stop-circle" : "play-circle"} size={20} color={ttsActiveId === "result" ? colors.statusFailed : colors.textTertiary} />
                            </Pressable>
                          </View>
                        </View>
                        <Markdown style={mdStyles} markdownit={markdownItInstance}>{selectedTask.result}</Markdown>
                      </View>
                    ) : null
                  }
                  data={[...(selectedTask.messages ?? [])].sort((a: any, b: any) => a.createdAt - b.createdAt) as Message[]}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item: msg }: { item: Message }) => {
                    const isUser = msg.role === "user";
                    const msgTtsId = `msg-${msg.id}`;
                    return (
                      <View style={{ alignSelf: isUser ? "flex-end" : "flex-start", maxWidth: "85%", marginBottom: spacing.md }}>
                        <View style={{
                          backgroundColor: isUser ? colors.primaryAlpha20 : colors.backgroundElevated,
                          borderRadius: radii.lg,
                          paddingHorizontal: spacing.lg,
                          paddingVertical: spacing.md,
                          borderWidth: 1,
                          borderColor: isUser ? colors.primaryAlpha30 : colors.borderLight,
                        }}>
                          {isUser ? (
                            <Text style={{ color: colors.textPrimary, fontSize: typography.base, fontFamily: fontFamily.regular, lineHeight: 20 }}>{msg.content}</Text>
                          ) : (
                            <Markdown style={{ ...mdStyles, body: { ...mdStyles.body, lineHeight: 20 }, strong: { fontFamily: fontFamily.bold } }} markdownit={markdownItInstance}>{msg.content}</Markdown>
                          )}
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.xs, alignSelf: isUser ? "flex-end" : "flex-start", paddingHorizontal: spacing.xs, gap: spacing.sm }}>
                          <Text style={{ color: colors.textMuted, fontSize: typography.xs, fontFamily: fontFamily.regular }}>{relativeTime(msg.createdAt)}</Text>
                          {!isUser && (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
                              {ttsActiveId === msgTtsId && (
                                <Pressable onPress={cycleTtsSpeed} hitSlop={8} style={{ paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radii.sm, backgroundColor: colors.primaryAlpha20 }}>
                                  <Text style={{ color: colors.primary, fontSize: typography.xs, fontFamily: fontFamily.semibold }}>{ttsSpeed}×</Text>
                                </Pressable>
                              )}
                              <Pressable onPress={() => toggleTts(msgTtsId, msg.content)} hitSlop={12} style={{ minWidth: 44, minHeight: 28, alignItems: "center", justifyContent: "center" }}>
                                <Ionicons name={ttsActiveId === msgTtsId ? "stop-circle-outline" : "play-circle-outline"} size={18} color={ttsActiveId === msgTtsId ? colors.statusFailed : colors.textMuted} />
                              </Pressable>
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  }}
                />

                {/* Prev/Next project navigation */}
                {(() => {
                  const slug = (selectedTask as any).project?.slug || (selectedTask as any).projectSlug;
                  if (!slug) return null;
                  const siblings = allTasks
                    .filter((t) => ((t as any).project?.slug || (t as any).projectSlug) === slug)
                    .sort((a, b) => a.createdAt - b.createdAt);
                  const idx = siblings.findIndex((t) => t.id === selectedTask.id);
                  if (idx === -1) return null;
                  const prev = siblings.slice(Math.max(0, idx - 2), idx);
                  const next = siblings.slice(idx + 1, idx + 3);
                  if (prev.length === 0 && next.length === 0) return null;
                  return (
                    <View style={{
                      borderTopWidth: 1,
                      borderTopColor: colors.border,
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.sm,
                    }}>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs, alignItems: "center" }}>
                        {prev.map((t) => (
                          <Pressable
                            key={t.id}
                            onPress={() => openTask(t.id)}
                            style={({ pressed }) => ({
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 4,
                              backgroundColor: isDark ? "#2c2c2e" : "#f0f0f0",
                              paddingHorizontal: spacing.sm,
                              paddingVertical: spacing.xs,
                              borderRadius: radii.full,
                              maxWidth: 180,
                              opacity: pressed ? 0.6 : 1,
                            })}
                          >
                            <Ionicons name="chevron-back" size={12} color={colors.textMuted} />
                            <Text numberOfLines={1} style={{ fontSize: typography.xs, fontFamily: fontFamily.regular, color: colors.textSecondary, flexShrink: 1 }}>
                              {t.summary || t.input}
                            </Text>
                          </Pressable>
                        ))}
                        {next.map((t) => (
                          <Pressable
                            key={t.id}
                            onPress={() => openTask(t.id)}
                            style={({ pressed }) => ({
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 4,
                              backgroundColor: isDark ? "#2c2c2e" : "#f0f0f0",
                              paddingHorizontal: spacing.sm,
                              paddingVertical: spacing.xs,
                              borderRadius: radii.full,
                              maxWidth: 180,
                              opacity: pressed ? 0.6 : 1,
                            })}
                          >
                            <Text numberOfLines={1} style={{ fontSize: typography.xs, fontFamily: fontFamily.regular, color: colors.textSecondary, flexShrink: 1 }}>
                              {t.summary || t.input}
                            </Text>
                            <Ionicons name="chevron-forward" size={12} color={colors.textMuted} />
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  );
                })()}

                {/* Follow-up input */}
                <SafeAreaView edges={["bottom"]} style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
                  {isRecordingFollowUp ? (
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingVertical: spacing.md }}>
                      <Pressable onPress={cancelFollowUpRecording} style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="close" size={24} color={colors.statusFailed} />
                      </Pressable>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.statusFailed }} />
                        <Text style={{ color: colors.textSecondary, fontFamily: fontFamily.semibold, fontSize: typography.sm }}>Recording</Text>
                      </View>
                      <Pressable onPress={submitFollowUpRecording} style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="send" size={20} color={colors.primary} />
                      </Pressable>
                    </View>
                  ) : isTranscribingFollowUp ? (
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: spacing.md, gap: spacing.sm }}>
                      <ActivityIndicator size="small" color={colors.primary} />
                      <Text style={{ color: colors.textSecondary, fontFamily: fontFamily.regular, fontSize: typography.sm }}>Sending...</Text>
                    </View>
                  ) : (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
                      <Pressable onPress={startFollowUpRecording} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.backgroundElevated, alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="mic" size={20} color={colors.textSecondary} />
                      </Pressable>
                      <TextInput
                        value={followUpText}
                        onChangeText={setFollowUpText}
                        placeholder="Follow up..."
                        placeholderTextColor={colors.textMuted}
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
                        style={({ pressed }) => [{
                          width: 44, height: 44, borderRadius: 22,
                          backgroundColor: followUpText.trim() ? colors.primary : colors.backgroundElevated,
                          alignItems: "center", justifyContent: "center",
                        }, pressed && { opacity: 0.7 }]}
                      >
                        {sendingFollowUp ? (
                          <ActivityIndicator size="small" color={colors.white} />
                        ) : (
                          <Ionicons name="arrow-up" size={18} color={followUpText.trim() ? colors.white : colors.textMuted} />
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
