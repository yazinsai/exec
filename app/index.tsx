import { useState, useMemo, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Alert,
} from "react-native";
import Markdown from "react-native-markdown-display";
import { SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Ionicons } from "@expo/vector-icons";
import { RecordingOverlay } from "@/components/RecordingOverlay";
import { QueueStatus } from "@/components/QueueStatus";
import { RecordingsList } from "@/components/RecordingsList";
import { ActionsScreen } from "@/components/ActionsScreen";
import { ActivityFeed } from "@/components/ActivityFeed";
import { ProjectTimeline } from "@/components/ProjectTimeline";
import { BottomNavBar } from "@/components/BottomNavBar";
import { AudioPlayer } from "@/components/AudioPlayer";
import { VersionBadge } from "@/components/VersionBadge";
import { WorkerStatusBadge } from "@/components/WorkerStatusBadge";
import { RatingSection } from "@/components/RatingSection";
import { SettingsModal } from "@/components/SettingsModal";
import { VocabularyScreen } from "@/components/VocabularyScreen";
import { useTTS } from "@/hooks/useTTS";
import { useQueue } from "@/hooks/useQueue";
import { useRecorder } from "@/hooks/useRecorder";
import { useVocabulary } from "@/hooks/useVocabulary";
import { useShareIntentState } from "@/hooks/useShareIntent";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import type { Recording } from "@/lib/queue";
import type { Action } from "@/components/ActionItem";

// Extended action type that includes the parent recording data
export interface ActionWithRecording extends Action {
  _recording?: {
    id: string;
    audioUrl?: string;
    duration: number;
    title?: string | null;
  };
}
import { spacing, typography, radii, fontFamily, actionTypeColorsDark, actionTypeColorsLight, type ActionType } from "@/constants/Colors";
import { useThemeColors, type ThemeColors } from "@/hooks/useThemeColors";
import { db } from "@/lib/db";
import { buildTimelineTurns, getProjectLabel, parseMessages, type Activity, type ThreadMessage } from "@/lib/actionTimeline";

type TabKey = "actions" | "recordings";
type ActionStatus = "pending" | "in_progress" | "awaiting_feedback" | "completed" | "failed" | "cancelled";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/~~(.+?)~~/g, "<del>$1</del>")
    .replace(/`([^`]+)`/g, (_, code) => `<code>${esc(code)}</code>`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/(?:^|\s)(https?:\/\/[^\s<]+)/g, (m, url) => m.replace(url, `<a href="${url}">${url}</a>`));
}

function markdownToHtml(md: string, title: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code blocks
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(esc(lines[i]));
        i++;
      }
      i++;
      out.push(`<div class="code-block">${lang ? `<div class="code-lang">${esc(lang)}</div>` : ""}<pre><code>${codeLines.join("\n")}</code></pre></div>`);
      continue;
    }

    // Tables
    if (line.includes("|") && i + 1 < lines.length && /^\|?[\s:]*-+[\s:]*\|/.test(lines[i + 1])) {
      const parseRow = (r: string) =>
        r.replace(/^\||\|$/g, "").split("|").map((c) => inline(c.trim()));
      const headers = parseRow(line);
      const sepCells = lines[i + 1].replace(/^\||\|$/g, "").split("|");
      const aligns = sepCells.map((c) => {
        const t = c.trim();
        if (t.startsWith(":") && t.endsWith(":")) return "center";
        if (t.endsWith(":")) return "right";
        return "left";
      });
      i += 2;
      const bodyRows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        bodyRows.push(parseRow(lines[i]));
        i++;
      }
      let table = '<div class="table-wrap"><table><thead><tr>';
      headers.forEach((h, j) => {
        table += `<th style="text-align:${aligns[j] || "left"}">${h}</th>`;
      });
      table += "</tr></thead><tbody>";
      bodyRows.forEach((row) => {
        table += "<tr>";
        row.forEach((cell, j) => {
          table += `<td style="text-align:${aligns[j] || "left"}">${cell}</td>`;
        });
        table += "</tr>";
      });
      table += "</tbody></table></div>";
      out.push(table);
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push("<hr>");
      i++;
      continue;
    }

    // Headers
    const hMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (hMatch) {
      const level = hMatch[1].length;
      out.push(`<h${level}>${inline(hMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // Blockquotes (multi-line)
    if (line.startsWith("> ") || line === ">") {
      const bqLines: string[] = [];
      while (i < lines.length && (lines[i].startsWith("> ") || lines[i] === ">")) {
        bqLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push(`<blockquote>${bqLines.map((l) => (l.trim() ? `<p>${inline(l)}</p>` : "")).join("")}</blockquote>`);
      continue;
    }

    // Ordered lists (with continuation lines)
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        let item = lines[i].replace(/^\d+\.\s/, "");
        i++;
        // Grab continuation lines (indented, not a new list item or blank)
        while (i < lines.length && lines[i].match(/^\s+\S/) && !/^\d+\.\s/.test(lines[i].trim())) {
          item += " " + lines[i].trim();
          i++;
        }
        items.push(inline(item));
      }
      out.push(`<ol>${items.map((item) => `<li>${item}</li>`).join("")}</ol>`);
      continue;
    }

    // Unordered lists (with continuation lines)
    if (/^[-*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        let item = lines[i].replace(/^[-*]\s/, "");
        i++;
        while (i < lines.length && lines[i].match(/^\s+\S/) && !/^[-*]\s/.test(lines[i].trim())) {
          item += " " + lines[i].trim();
          i++;
        }
        items.push(inline(item));
      }
      out.push(`<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`);
      continue;
    }

    // Empty lines
    if (line.trim() === "") { i++; continue; }

    // Paragraph (collapse consecutive non-blank lines)
    const pLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !lines[i].startsWith("#") && !lines[i].startsWith("```") && !lines[i].startsWith("> ") && !/^[-*]\s/.test(lines[i]) && !/^\d+\.\s/.test(lines[i]) && !/^(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i]) && !(lines[i].includes("|") && i + 1 < lines.length && /^\|?[\s:]*-+[\s:]*\|/.test(lines[i + 1]))) {
      pLines.push(lines[i]);
      i++;
    }
    out.push(`<p>${inline(pLines.join(" "))}</p>`);
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,"Helvetica Neue","SF Pro Text",system-ui,sans-serif;padding:40px 32px;max-width:760px;margin:0 auto;color:#1c1c1e;font-size:15px;line-height:1.7;-webkit-font-smoothing:antialiased}
h1{font-size:26px;font-weight:800;letter-spacing:-0.5px;color:#000;margin:0 0 8px;line-height:1.3}
.subtitle{font-size:14px;color:#86868b;margin-bottom:28px;padding-bottom:20px;border-bottom:1px solid #e5e5ea}
h2{font-size:20px;font-weight:700;letter-spacing:-0.3px;color:#1c1c1e;margin:32px 0 12px;padding-top:20px;border-top:1px solid #f2f2f7}
h3{font-size:17px;font-weight:700;color:#1c1c1e;margin:24px 0 8px}
h4,h5,h6{font-size:15px;font-weight:700;color:#3a3a3c;margin:20px 0 6px}
p{margin:12px 0;color:#3a3a3c}
strong{font-weight:700;color:#1c1c1e}
em{font-style:italic;color:#48484a}
del{text-decoration:line-through;color:#86868b}
a{color:#0071e3;text-decoration:none;font-weight:500}
code{background:#f2f2f7;padding:2px 7px;border-radius:5px;font-size:12.5px;font-family:"SF Mono",Menlo,Consolas,monospace;color:#e8453c;font-weight:500}
.code-block{position:relative;margin:20px 0;border-radius:10px;overflow:hidden;background:#1c1c1e}
.code-lang{position:absolute;top:0;right:0;padding:4px 12px;font-size:11px;font-weight:600;color:#86868b;text-transform:uppercase;letter-spacing:0.5px}
pre{padding:20px;overflow-x:auto;font-size:13px;line-height:1.6;color:#e5e5ea}
pre code{background:none;padding:0;color:inherit;font-size:inherit;font-weight:400}
blockquote{margin:20px 0;padding:16px 20px;background:linear-gradient(135deg,#fef9ef,#fef6e4);border-left:4px solid #d4af37;border-radius:0 8px 8px 0}
blockquote p{margin:4px 0;color:#5d4e37;font-size:14px}
ul,ol{padding-left:24px;margin:14px 0}
li{margin:6px 0;line-height:1.6;color:#3a3a3c}
li::marker{color:#86868b}
hr{border:none;height:1px;background:linear-gradient(to right,transparent,#d1d1d6,transparent);margin:28px 0}
.table-wrap{margin:20px 0;border-radius:10px;overflow:hidden;border:1px solid #e5e5ea}
table{width:100%;border-collapse:collapse;font-size:13.5px}
thead{background:#f9f9fb}
th{font-weight:700;font-size:11px;letter-spacing:0.8px;text-transform:uppercase;color:#6e6e73;padding:12px 16px;border-bottom:2px solid #e5e5ea;white-space:nowrap}
td{padding:12px 16px;border-bottom:1px solid #f2f2f7;color:#3a3a3c;vertical-align:top;line-height:1.5}
tbody tr:last-child td{border-bottom:none}
tbody tr:nth-child(even){background:#fafafa}
tbody tr:hover{background:#f2f2f7}
td code{font-size:11.5px;padding:2px 6px;background:#eeeef0;color:#6e6e73}
td strong{color:#1c1c1e}
footer{margin-top:48px;padding-top:20px;border-top:1px solid #e5e5ea;font-size:12px;color:#aeaeb2;text-align:center;letter-spacing:0.3px}
footer a{color:#aeaeb2;font-weight:500}
@media print{body{padding:20px}h1{font-size:22px}.table-wrap{border-color:#ccc}th{background:#f0f0f0}footer{margin-top:32px}}
</style>
</head><body>
<h1>${esc(title)}</h1>
<div class="subtitle">Generated ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
${out.join("\n")}
<footer>Generated with <a href="https://github.com/yazinsai/exec">Exec</a></footer>
</body></html>`;
}

function getStatusDisplay(action: Action, colors: ThemeColors, isDark: boolean): { label: string; color: string; bg: string } {
  const status = action.status as ActionStatus;
  const typeColors = isDark ? actionTypeColorsDark : actionTypeColorsLight;

  // Check if awaiting user feedback
  if (action.messages) {
    try {
      const messages = JSON.parse(action.messages) as { role: string }[];
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage.role === "assistant" && status === "completed") {
          return { label: typeColors.review.label, color: typeColors.review.color, bg: typeColors.review.bg };
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  // Light mode needs higher alpha for visibility
  const alpha = isDark ? "20" : "30";

  switch (status) {
    case "pending":
      return { label: "Queued", color: colors.textTertiary, bg: colors.textMuted + alpha };
    case "in_progress":
      return { label: "Running", color: colors.primary, bg: colors.primary + alpha };
    case "awaiting_feedback":
      return { label: "Awaiting Reply", color: colors.warning, bg: colors.warning + alpha };
    case "completed":
      return { label: "Done", color: colors.success, bg: colors.success + alpha };
    case "failed":
      return { label: "Failed", color: colors.error, bg: colors.error + alpha };
    case "cancelled":
      return { label: "Stopped", color: colors.warning, bg: colors.warning + alpha };
    default:
      return { label: "Queued", color: colors.textTertiary, bg: colors.textMuted + alpha };
  }
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

function formatDuration(ms: number | undefined, startedAt?: number): string {
  // If no duration provided but we have startedAt, compute running duration
  const duration = ms ?? (startedAt ? Date.now() - startedAt : 0);
  if (duration < 1000) return "<1s";
  const seconds = Math.floor(duration / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }
  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (isToday) return time;
  if (isYesterday) return `Yesterday, ${time}`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" }) + `, ${time}`;
}


interface Progress {
  currentActivity?: string;
  skills: string[];
  currentTask?: string;
  taskProgress?: { done: number; total: number };
  activities: Activity[];
  lastUpdate: number;
}

function parseProgress(json: string | undefined | null): Progress | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    // Provide defaults for required array fields
    return {
      ...parsed,
      skills: parsed.skills ?? [],
      activities: parsed.activities ?? [],
    } as Progress;
  } catch {
    return null;
  }
}

export default function HomeScreen() {
  const { colors, isDark } = useThemeColors();
  const [activeTab, setActiveTab] = useState<TabKey>("recordings");
  const [showSettings, setShowSettings] = useState(false);
  const [showVocabulary, setShowVocabulary] = useState(false);

  const { terms: vocabularyTerms } = useVocabulary();
  const { pendingImages, showRecordingOverlay, clearPendingImages } = useShareIntentState();
  const { lastActionId: notificationActionId, clearLastActionId } = usePushNotifications();

  const {
    recordings,
    pendingCount,
    failedCount,
    triggerProcessing,
    retry,
    remove,
    share,
  } = useQueue();

  const {
    duration,
    hasPermission,
    metering,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    cancelRecording,
    isRecording,
    isPaused,
    isSaving,
    isActive,
  } = useRecorder(() => {
    triggerProcessing();
    clearPendingImages();
  });

  // Collect all actions from all recordings, including parent recording data
  const allActions = useMemo(() => {
    const actions: ActionWithRecording[] = [];
    for (const recording of recordings) {
      if (recording.actions) {
        for (const action of recording.actions) {
          actions.push({
            ...action,
            _recording: {
              id: recording.id,
              audioUrl: recording.audioFile?.url,
              duration: recording.duration,
              title: recording.title,
            },
          });
        }
      }
    }
    // Sort by extractedAt descending (newest first)
    return actions.sort((a, b) => b.extractedAt - a.extractedAt);
  }, [recordings]);

  // Count running actions
  const runningActionsCount = useMemo(() => {
    return allActions.filter((a) => a.status === "in_progress").length;
  }, [allActions]);

  // Auto-start recording when images are shared
  const hasTriggeredRecording = useRef(false);
  useEffect(() => {
    if (showRecordingOverlay && pendingImages.length > 0 && !isActive && !hasTriggeredRecording.current) {
      hasTriggeredRecording.current = true;
      handleStartRecording(true);
    }
    if (!showRecordingOverlay) {
      hasTriggeredRecording.current = false;
    }
  }, [showRecordingOverlay, pendingImages.length, isActive]);

  // Project timeline state
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  // Action detail/feedback modal state - store ID for real-time updates
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [copiedResult, setCopiedResult] = useState(false);

  // Handle notification taps - open action modal when tapped
  useEffect(() => {
    if (notificationActionId && allActions.length > 0) {
      // Check if the action exists in our list
      const actionExists = allActions.some((a) => a.id === notificationActionId);
      if (actionExists) {
        setSelectedActionId(notificationActionId);
        setActiveTab("actions"); // Switch to actions tab
        clearLastActionId();
      }
    }
  }, [notificationActionId, allActions, clearLastActionId]);

  // Look up action from allActions to get real-time updates
  const selectedAction: ActionWithRecording | null = selectedActionId
    ? allActions.find((a) => a.id === selectedActionId) ?? null
    : null;

  const selectedActionMessages = useMemo(
    () => parseMessages(selectedAction?.messages),
    [selectedAction?.messages]
  );

  const selectedActionTimelineTurns = useMemo(() => {
    const activities = parseProgress(selectedAction?.progress)?.activities ?? [];
    return buildTimelineTurns(selectedActionMessages, activities);
  }, [selectedAction?.progress, selectedActionMessages]);

  const handleActionPress = async (action: ActionWithRecording) => {
    setSelectedActionId(action.id);
    setFeedbackText("");

    // Mark as read if it's a completed/cancelled action that hasn't been viewed yet
    if ((action.status === "completed" || action.status === "cancelled") && !action.readAt) {
      await db.transact(
        db.tx.actions[action.id].update({
          readAt: Date.now(),
        })
      );
    }
  };

  const handleCloseModal = () => {
    tts.stop();
    setSelectedActionId(null);
    setFeedbackText("");
  };

  const handleSubmitFeedback = async () => {
    if (!selectedAction || !feedbackText.trim()) return;

    const existingMessages = parseMessages(selectedAction.messages);
    const newMessage: ThreadMessage = {
      role: "user",
      content: feedbackText.trim(),
      timestamp: Date.now(),
    };
    const updatedMessages = [...existingMessages, newMessage];

    // Build update object - always include messages
    const updateFields: Record<string, unknown> = {
      messages: JSON.stringify(updatedMessages),
    };

    // If the action is completed, failed, or cancelled, requeue it for re-processing
    // This allows the executor to pick it up and resume the session with the new feedback
    if (selectedAction.status === "completed" || selectedAction.status === "failed" || selectedAction.status === "cancelled") {
      updateFields.status = "pending";
      updateFields.startedAt = null;
      updateFields.completedAt = null;
      updateFields.errorMessage = null;
      updateFields.cancelRequested = null; // Clear any previous cancel request
    }

    await db.transact(
      db.tx.actions[selectedAction.id].update(updateFields)
    );
    setFeedbackText("");
  };

  const handleStopAction = () => {
    if (!selectedAction) return;

    Alert.alert(
      "Stop Action",
      `Are you sure you want to stop "${selectedAction.title}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Stop",
          style: "destructive",
          onPress: async () => {
            await db.transact(
              db.tx.actions[selectedAction.id].update({
                cancelRequested: true,
              })
            );
          },
        },
      ]
    );
  };

  const handleMarkDone = async () => {
    if (!selectedAction) return;

    await db.transact(
      db.tx.actions[selectedAction.id].update({
        status: "completed",
        completedAt: Date.now(),
      })
    );
  };

  const handleCopyResult = async () => {
    if (!selectedAction?.result) return;
    await Clipboard.setStringAsync(selectedAction.result);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopiedResult(true);
    setTimeout(() => setCopiedResult(false), 2000);
  };

  const handleExportPdf = async () => {
    if (!selectedAction?.result) return;
    const markdown = selectedAction.result;
    // Convert markdown to basic HTML for PDF rendering
    const html = markdownToHtml(markdown, selectedAction.title);
    try {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { UTI: ".pdf", mimeType: "application/pdf" });
    } catch {
      // User cancelled sharing
    }
  };

  const handleStartRecording = async (withPendingImages?: boolean) => {
    if (hasPermission === false) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    startRecording(
      withPendingImages ? pendingImages : undefined,
      selectedProject,
    );
  };

  const handlePauseResume = () => {
    if (isPaused) {
      resumeRecording();
    } else {
      pauseRecording();
    }
  };

  // TTS for reading action results aloud
  const tts = useTTS();

  const headerTitle = activeTab === "actions" ? "Actions" : "Recordings";
  const showHeader = !(activeTab === "actions" && selectedProject);

  // Create markdown styles dynamically based on current theme
  const markdownStyles = {
    body: {
      color: colors.textSecondary,
      fontSize: typography.sm,
      lineHeight: typography.sm * 1.6,
    },
    heading1: {
      color: colors.textPrimary,
      fontSize: typography.xl,
      fontWeight: "700" as const,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
    heading2: {
      color: colors.textPrimary,
      fontSize: typography.lg,
      fontWeight: "600" as const,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
    heading3: {
      color: colors.textPrimary,
      fontSize: typography.base,
      fontWeight: "600" as const,
      marginTop: spacing.sm,
      marginBottom: spacing.xs,
    },
    paragraph: {
      marginBottom: spacing.sm,
    },
    strong: {
      fontWeight: "600" as const,
      color: colors.textPrimary,
    },
    em: {
      fontStyle: "italic" as const,
    },
    bullet_list: {
      marginBottom: spacing.sm,
    },
    ordered_list: {
      marginBottom: spacing.sm,
    },
    list_item: {
      marginBottom: spacing.xs,
    },
    code_inline: {
      backgroundColor: colors.backgroundElevated,
      color: colors.primary,
      paddingHorizontal: 4,
      borderRadius: 4,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
      fontSize: typography.xs,
    },
    fence: {
      backgroundColor: colors.backgroundElevated,
      padding: spacing.sm,
      borderRadius: radii.sm,
      marginVertical: spacing.sm,
    },
    code_block: {
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
      fontSize: typography.xs,
      color: colors.textSecondary,
    },
    blockquote: {
      backgroundColor: colors.backgroundElevated,
      borderLeftColor: colors.primary,
      borderLeftWidth: 3,
      paddingLeft: spacing.md,
      paddingVertical: spacing.sm,
      marginVertical: spacing.sm,
    },
    link: {
      color: colors.primary,
    },
    hr: {
      backgroundColor: colors.border,
      height: 1,
      marginVertical: spacing.md,
    },
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
      {showHeader && (
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{headerTitle}</Text>
          <View style={styles.headerRight}>
            {(pendingCount > 0 || failedCount > 0) && (
              <QueueStatus pendingCount={pendingCount} failedCount={failedCount} />
            )}
            <WorkerStatusBadge />
            <VersionBadge />
            <Pressable
              onPress={() => setShowSettings(true)}
              style={({ pressed }) => [
                styles.settingsButton,
                { backgroundColor: colors.backgroundElevated },
                pressed && { opacity: 0.7 },
                !isDark && [styles.settingsButtonLight, { borderColor: colors.border }],
              ]}
            >
              <Ionicons name="settings-outline" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
        </View>
      )}

      <View style={styles.content}>
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
          <RecordingsList
            recordings={recordings}
            onRetry={retry}
            onDelete={remove}
            onShare={share}
            onActionPress={handleActionPress}
          />
        )}
      </View>

      <BottomNavBar
        activeTab={activeTab}
        onTabPress={(tab) => {
          setActiveTab(tab);
          setSelectedProject(null);
        }}
        onRecordPress={handleStartRecording}
        recordDisabled={hasPermission === false}
        runningCount={runningActionsCount}
      />

      <RecordingOverlay
        isVisible={isActive || isSaving}
        duration={duration}
        metering={metering}
        isRecording={isRecording}
        isPaused={isPaused}
        isSaving={isSaving}
        onPauseResume={handlePauseResume}
        onStop={stopRecording}
        onDelete={() => {
          cancelRecording();
          clearPendingImages();
        }}
        pendingImages={pendingImages}
        projectContext={selectedProject}
      />

      {/* Settings Modal */}
      <SettingsModal
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        onVocabularyPress={() => setShowVocabulary(true)}
        vocabularyCount={vocabularyTerms.length}
      />

      {/* Vocabulary Screen */}
      <VocabularyScreen
        visible={showVocabulary}
        onClose={() => setShowVocabulary(false)}
      />

      {/* Action Detail/Feedback Modal */}
      <Modal
        visible={selectedAction !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseModal}
      >
        {selectedAction && (
          <GestureHandlerRootView style={[styles.modalContainer, { backgroundColor: colors.background }]}>
            <SafeAreaView style={styles.flex1} edges={["top"]}>
            <KeyboardAvoidingView
              style={styles.flex1}
              behavior={Platform.OS === "ios" ? "padding" : "height"}
            >
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Pressable onPress={handleCloseModal} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </Pressable>
              <View style={styles.headerBadges}>
                {(() => {
                  const typeColors = isDark ? actionTypeColorsDark : actionTypeColorsLight;
                  const typeConfig = typeColors[selectedAction.type as ActionType] ?? typeColors.note;
                  return (
                    <View style={[styles.typeBadgeColored, { backgroundColor: typeConfig.bg }]}>
                      <Text style={[styles.typeBadgeColoredText, { color: typeConfig.color }]}>
                        {typeConfig.label}
                      </Text>
                    </View>
                  );
                })()}
                {selectedAction.type === "CodeChange" && selectedAction.subtype && (
                  <View style={[styles.subtypeBadge, { backgroundColor: colors.textMuted + "20" }]}>
                    <Text style={[styles.subtypeBadgeText, { color: colors.textSecondary }]}>
                      {selectedAction.subtype}
                    </Text>
                  </View>
                )}
                {selectedAction.type === "CodeChange" && (
                  <View style={[
                    styles.deployModeBadge,
                    {
                      backgroundColor: selectedAction.prOnly
                        ? colors.warning + "20"
                        : colors.success + "20",
                    },
                  ]}>
                    <Ionicons
                      name={selectedAction.prOnly ? "git-pull-request-outline" : "rocket-outline"}
                      size={12}
                      color={selectedAction.prOnly ? colors.warning : colors.success}
                    />
                    <Text style={[
                      styles.deployModeBadgeText,
                      { color: selectedAction.prOnly ? colors.warning : colors.success },
                    ]}>
                      {selectedAction.prOnly ? "PR Only" : "Deploy"}
                    </Text>
                  </View>
                )}
                {(() => {
                  const statusDisplay = getStatusDisplay(selectedAction, colors, isDark);
                  return (
                    <View style={[styles.statusBadge, { backgroundColor: statusDisplay.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: statusDisplay.color }]}>
                        {statusDisplay.label}
                      </Text>
                    </View>
                  );
                })()}
              </View>
              {selectedAction.status === "in_progress" ? (
                <Pressable
                  onPress={handleStopAction}
                  style={({ pressed }) => [styles.stopButton, { backgroundColor: colors.error + "20" }, pressed && styles.buttonPressed]}
                >
                  <View style={styles.stopButtonContent}>
                    <Ionicons name="stop-circle" size={20} color={colors.error} />
                    <Text style={[styles.stopButtonText, { color: colors.error }]}>Stop</Text>
                  </View>
                </Pressable>
              ) : selectedAction.status === "awaiting_feedback" ? (
                <Pressable
                  onPress={handleMarkDone}
                  style={({ pressed }) => [styles.doneButton, { backgroundColor: colors.success + "20" }, pressed && styles.buttonPressed]}
                >
                  <View style={styles.stopButtonContent}>
                    <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                    <Text style={[styles.stopButtonText, { color: colors.success }]}>Done</Text>
                  </View>
                </Pressable>
              ) : (
                <View style={styles.headerSpacer} />
              )}
            </View>

            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{selectedAction.title}</Text>
              {selectedAction.description && (
                <Text style={[styles.modalDescription, { color: colors.textSecondary }]}>{selectedAction.description}</Text>
              )}

              <View style={[styles.projectAssociationBox, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "30" }]}>
                <Ionicons name="folder-open-outline" size={16} color={colors.primary} />
                <View style={styles.projectAssociationTextWrap}>
                  <Text style={[styles.projectAssociationLabel, { color: colors.textTertiary }]}>Project</Text>
                  <Text style={[styles.projectAssociationValue, { color: colors.textPrimary }]}>
                    {getProjectLabel(selectedAction.projectPath)}
                  </Text>
                  {selectedAction.projectPath && (
                    <Text style={[styles.projectAssociationPath, { color: colors.textMuted }]} numberOfLines={1}>
                      {selectedAction.projectPath}
                    </Text>
                  )}
                </View>
              </View>

              {/* Dependency Info */}
              {selectedAction.dependsOn && selectedAction.dependsOn.length > 0 && (
                <View style={[styles.dependencySection, { backgroundColor: colors.warning + "15", borderColor: colors.warning + "30" }]}>
                  <View style={styles.dependencyHeader}>
                    <Ionicons name="git-branch-outline" size={16} color={colors.warning} />
                    <Text style={[styles.dependencySectionLabel, { color: colors.warning }]}>
                      {selectedAction.status === "pending" ? "Waiting for:" : "Depends on:"}
                    </Text>
                  </View>
                  <View style={[styles.dependencyItem, { backgroundColor: colors.background }]}>
                    <Text style={[styles.dependencyTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                      {selectedAction.dependsOn[0].title}
                    </Text>
                    <View style={[
                      styles.dependencyStatus,
                      { backgroundColor: selectedAction.dependsOn[0].status === "completed" ? colors.success + "20" : colors.warning + "20" }
                    ]}>
                      <Text style={[
                        styles.dependencyStatusText,
                        { color: selectedAction.dependsOn[0].status === "completed" ? colors.success : colors.warning }
                      ]}>
                        {selectedAction.dependsOn[0].status === "completed" ? "Done" : selectedAction.dependsOn[0].status === "in_progress" ? "Running" : "Queued"}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Timestamps */}
              <View style={[styles.timestampSection, { borderColor: colors.border }]}>
                <View style={styles.timestampItem}>
                  <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                  <Text style={[styles.timestampText, { color: colors.textMuted }]}>
                    Created {formatRelativeTime(selectedAction.extractedAt)}
                  </Text>
                </View>
                {selectedAction.startedAt && (
                  <View style={styles.timestampItem}>
                    <Ionicons name="play-outline" size={14} color={colors.textMuted} />
                    <Text style={[styles.timestampText, { color: colors.textMuted }]}>
                      Started {formatRelativeTime(selectedAction.startedAt)}
                    </Text>
                  </View>
                )}
                {selectedAction.completedAt && (
                  <View style={styles.timestampItem}>
                    <Ionicons name="checkmark-outline" size={14} color={colors.textMuted} />
                    <Text style={[styles.timestampText, { color: colors.textMuted }]}>
                      Completed {formatRelativeTime(selectedAction.completedAt)}
                    </Text>
                  </View>
                )}
              </View>

              {/* Skills Used (shown for all statuses when skills data exists) */}
              {(() => {
                const progress = parseProgress(selectedAction.progress);
                if (!progress?.skills || progress.skills.length === 0) return null;
                return (
                  <View style={[styles.skillsUsedSection, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>
                    <View style={styles.skillsUsedHeader}>
                      <Text style={styles.skillsUsedIcon}>✨</Text>
                      <Text style={[styles.skillsUsedLabel, { color: colors.textPrimary }]}>Skills Used</Text>
                    </View>
                    <View style={styles.skillsUsedBadges}>
                      {progress.skills.map((skill, idx) => (
                        <View key={idx} style={[styles.skillUsedBadge, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "30" }]}>
                          <Text style={[styles.skillUsedBadgeText, { color: colors.primary }]}>/{skill}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })()}

              {/* Live Progress (for running actions) */}
              {selectedAction.status === "in_progress" && (() => {
                const progress = parseProgress(selectedAction.progress);
                if (!progress) {
                  return (
                    <View style={[styles.progressSection, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
                      <View style={styles.progressHeader}>
                        <View style={[styles.progressDot, { backgroundColor: colors.primary }]} />
                        <Text style={[styles.progressLabel, { color: colors.primary }]}>Running...</Text>
                      </View>
                      <Text style={[styles.progressWaiting, { color: colors.textMuted }]}>Waiting for updates...</Text>
                    </View>
                  );
                }
                return (
                  <View style={[styles.progressSection, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
                    {/* Header with task progress */}
                    <View style={styles.progressHeader}>
                      <View style={[styles.progressDot, { backgroundColor: colors.primary }]} />
                      <Text style={[styles.progressLabel, { color: colors.primary }]}>
                        {progress.taskProgress
                          ? `Working... ${progress.taskProgress.done}/${progress.taskProgress.total}`
                          : "Working..."}
                      </Text>
                    </View>

                    {/* Skills badges (prominent!) */}
                    {progress.skills && progress.skills.length > 0 && (
                      <View style={styles.skillsBadges}>
                        {progress.skills.map((skill, idx) => (
                          <View key={idx} style={[styles.skillBadge, { backgroundColor: colors.primary + "20" }]}>
                            <Text style={styles.skillBadgeIcon}>✨</Text>
                            <Text style={[styles.skillBadgeText, { color: colors.primary }]}>{skill}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Current activity (what's happening now) */}
                    {progress.currentActivity && (
                      <View style={[styles.currentActivityBox, { backgroundColor: colors.background }]}>
                        <Text style={[styles.currentActivityText, { color: colors.textPrimary }]}>
                          {progress.currentActivity}
                        </Text>
                      </View>
                    )}

                    {/* Activity feed (whimsical timeline) */}
                    {progress.activities && progress.activities.length > 0 && (
                      <View style={styles.activityFeed}>
                        {progress.activities.slice(-12).reverse().map((activity) => {
                          const isActive = activity.status === "active";
                          const isError = activity.status === "error";
                          const opacity = isActive ? 1 : 0.7;
                          return (
                            <View key={activity.id} style={[styles.activityRow, { opacity }]}>
                              <Text style={styles.activityIcon}>{activity.icon}</Text>
                              <View style={styles.activityContent}>
                                <Text
                                  style={[
                                    styles.activityLabel,
                                    { color: isError ? colors.error : isActive ? colors.textPrimary : colors.textSecondary },
                                  ]}
                                  numberOfLines={2}
                                >
                                  {activity.detail ? `${activity.label}: ${activity.detail}` : activity.label}
                                </Text>
                              </View>
                              {activity.duration && (
                                <Text style={[styles.activityDuration, { color: colors.textMuted }]}>
                                  {formatDuration(activity.duration)}
                                </Text>
                              )}
                              {isActive && (
                                <View style={[styles.activityPulse, { backgroundColor: colors.primary }]} />
                              )}
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })()}

              {selectedActionTimelineTurns.length > 0 && (
                <View style={[styles.threadedTimelineSection, { borderColor: colors.border }]}>
                  <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Action Timeline</Text>
                  {selectedActionTimelineTurns.map((turn, turnIdx) => (
                    <View key={turn.id} style={[styles.turnCard, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>
                      <View style={styles.turnHeader}>
                        <Text style={[styles.turnTitle, { color: colors.textPrimary }]}>Turn {turnIdx + 1}</Text>
                        <Text style={[styles.turnTime, { color: colors.textMuted }]}>{formatRelativeTime(turn.startedAt)}</Text>
                      </View>

                      {turn.userMessage && (
                        <View style={[styles.messageBubble, styles.userBubble, { backgroundColor: colors.primary + "20" }]}>
                          <Text style={[styles.messageRole, { color: colors.textTertiary }]}>You</Text>
                          <Text style={[styles.messageContent, { color: colors.textPrimary }]}>{turn.userMessage.content}</Text>
                        </View>
                      )}

                      {turn.assistantMessages.map((msg, idx) => (
                        <View key={`${turn.id}-assistant-${idx}`} style={[styles.messageBubble, styles.assistantBubble, { backgroundColor: colors.background }]}>
                          <Text style={[styles.messageRole, { color: colors.textTertiary }]}>Claude</Text>
                          <Text style={[styles.messageContent, { color: colors.textPrimary }]}>{msg.content}</Text>
                        </View>
                      ))}

                      {turn.toolActivities.length > 0 && (
                        <View style={styles.turnToolsContainer}>
                          <Text style={[styles.turnToolsLabel, { color: colors.textSecondary }]}>Tool calls</Text>
                          {turn.toolActivities.map((activity) => (
                            <View key={activity.id} style={styles.activityRow}>
                              <Text style={styles.activityIcon}>{activity.icon}</Text>
                              <View style={styles.activityContent}>
                                <Text
                                  style={[
                                    styles.activityLabel,
                                    { color: activity.status === "error" ? colors.error : colors.textSecondary },
                                  ]}
                                  numberOfLines={2}
                                >
                                  {activity.detail ? `${activity.label}: ${activity.detail}` : activity.label}
                                </Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}

              {/* Original Voice Note */}
              {selectedAction._recording?.audioUrl && (
                <View style={styles.voiceNoteSection}>
                  <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Original Voice Note</Text>
                  <AudioPlayer
                    uri={selectedAction._recording.audioUrl}
                    duration={selectedAction._recording.duration}
                    title={selectedAction._recording.title ?? undefined}
                  />
                </View>
              )}

              {/* Prominent Result URL Button */}
              {selectedAction.deployUrl && (
                <Pressable
                  style={({ pressed }) => [styles.resultUrlButton, { backgroundColor: colors.primary }, pressed && styles.buttonPressed]}
                  onPress={() => Linking.openURL(selectedAction.deployUrl!)}
                >
                  <Ionicons name="open-outline" size={20} color={colors.white} />
                  <Text style={[styles.resultUrlButtonText, { color: colors.white }]}>
                    {selectedAction.deployUrlLabel || "Open App"}
                  </Text>
                </Pressable>
              )}

              {/* Result */}
              {selectedAction.result && (
                <View style={styles.resultSection}>
                  <View style={styles.resultHeader}>
                    <Text style={[styles.sectionLabel, { color: colors.textPrimary, marginBottom: 0 }]}>Result</Text>
                    <Pressable
                      onPress={() => tts.toggle(selectedAction.result!)}
                      style={({ pressed }) => [
                        styles.ttsButton,
                        {
                          backgroundColor: tts.status !== "idle"
                            ? colors.primary + "20"
                            : colors.textMuted + "15",
                        },
                        pressed && styles.buttonPressed,
                      ]}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name={
                          tts.status === "playing"
                            ? "pause"
                            : tts.status === "paused"
                              ? "play"
                              : "volume-high"
                        }
                        size={16}
                        color={tts.status !== "idle" ? colors.primary : colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.ttsButtonText,
                          { color: tts.status !== "idle" ? colors.primary : colors.textSecondary },
                        ]}
                      >
                        {tts.status === "playing"
                          ? "Pause"
                          : tts.status === "paused"
                            ? "Resume"
                            : "Listen"}
                      </Text>
                    </Pressable>
                    {tts.status !== "idle" && (
                      <>
                        <Pressable
                          onPress={() => tts.cycleRate(selectedAction.result!)}
                          style={({ pressed }) => [
                            styles.ttsSpeedButton,
                            { backgroundColor: colors.primary + "15" },
                            pressed && styles.buttonPressed,
                          ]}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={[styles.ttsSpeedText, { color: colors.primary }]}>
                            {tts.rate === 1 ? "1x" : tts.rate === 1.5 ? "1.5x" : "2x"}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={tts.stop}
                          style={({ pressed }) => [
                            styles.ttsStopButton,
                            { backgroundColor: colors.error + "15" },
                            pressed && styles.buttonPressed,
                          ]}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="stop" size={14} color={colors.error} />
                        </Pressable>
                      </>
                    )}
                    <View style={{ flex: 1 }} />
                    <Pressable
                      onPress={handleCopyResult}
                      style={({ pressed }) => [
                        styles.ttsButton,
                        { backgroundColor: copiedResult ? colors.success + "20" : colors.textMuted + "15" },
                        pressed && styles.buttonPressed,
                      ]}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name={copiedResult ? "checkmark" : "copy-outline"}
                        size={14}
                        color={copiedResult ? colors.success : colors.textSecondary}
                      />
                      <Text style={[styles.ttsButtonText, { color: copiedResult ? colors.success : colors.textSecondary }]}>
                        {copiedResult ? "Copied" : "Copy"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={handleExportPdf}
                      style={({ pressed }) => [
                        styles.ttsButton,
                        { backgroundColor: colors.textMuted + "15" },
                        pressed && styles.buttonPressed,
                      ]}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="document-outline" size={14} color={colors.textSecondary} />
                      <Text style={[styles.ttsButtonText, { color: colors.textSecondary }]}>PDF</Text>
                    </Pressable>
                  </View>
                  <View style={[styles.resultBox, { backgroundColor: colors.success + "20" }]}>
                    <Markdown style={markdownStyles}>
                      {selectedAction.result}
                    </Markdown>
                  </View>
                </View>
              )}

              {/* Error */}
              {selectedAction.errorMessage && (
                <View style={styles.errorSection}>
                  <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Error</Text>
                  <View style={[styles.errorBox, { backgroundColor: colors.error + "20" }]}>
                    <Ionicons name="alert-circle" size={18} color={colors.error} />
                    <Text style={[styles.errorText, { color: colors.error }]}>{selectedAction.errorMessage}</Text>
                  </View>
                </View>
              )}

              {/* Conversation Thread */}
              <View style={styles.threadSection}>
                {parseMessages(selectedAction.messages).length > 0 && (
                  <>
                    <View style={styles.threadHeaderRow}>
                      <View style={[styles.threadDividerLine, { backgroundColor: colors.border }]} />
                      <Text style={[styles.threadHeaderLabel, { color: colors.textTertiary }]}>Conversation</Text>
                      <View style={[styles.threadDividerLine, { backgroundColor: colors.border }]} />
                    </View>

                    <View style={styles.threadMessages}>
                      {parseMessages(selectedAction.messages).map((msg, idx) => (
                        <View
                          key={idx}
                          style={[
                            styles.chatRow,
                            msg.role === "user" ? styles.chatRowUser : styles.chatRowAssistant,
                          ]}
                        >
                          {msg.role === "assistant" && (
                            <View style={[styles.chatAvatar, { backgroundColor: colors.primary + "20" }]}>
                              <Ionicons name="sparkles" size={14} color={colors.primary} />
                            </View>
                          )}
                          <View
                            style={[
                              styles.chatBubble,
                              msg.role === "user"
                                ? [styles.chatBubbleUser, { backgroundColor: colors.primary }]
                                : [styles.chatBubbleAssistant, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }],
                            ]}
                          >
                            {msg.role === "assistant" ? (
                              <Markdown style={{
                                ...markdownStyles,
                                body: {
                                  ...markdownStyles.body,
                                  color: colors.textPrimary,
                                  fontSize: typography.sm,
                                  lineHeight: typography.sm * 1.5,
                                },
                              }}>
                                {msg.content}
                              </Markdown>
                            ) : (
                              <Text style={[styles.chatContent, styles.chatContentUser, { color: colors.white }]}>
                                {msg.content}
                              </Text>
                            )}
                            <Text style={[
                              styles.chatTimestamp,
                              { color: msg.role === "user" ? "rgba(255,255,255,0.6)" : colors.textMuted },
                            ]}>
                              {formatMessageTime(msg.timestamp)}
                            </Text>
                          </View>
                          {msg.role === "user" && (
                            <View style={[styles.chatAvatar, { backgroundColor: colors.primary + "30" }]}>
                              <Ionicons name="person" size={14} color={colors.primary} />
                            </View>
                          )}
                        </View>
                      ))}
                    </View>
                  </>
                )}

                {/* Message Input */}
                <View style={[
                  styles.chatInputContainer,
                  { backgroundColor: colors.backgroundElevated, borderColor: colors.border },
                ]}>
                  <TextInput
                    style={[styles.chatInput, { color: colors.textPrimary }]}
                    placeholder={parseMessages(selectedAction.messages).length > 0 ? "Reply..." : "Start a conversation..."}
                    placeholderTextColor={colors.textMuted}
                    multiline
                    value={feedbackText}
                    onChangeText={setFeedbackText}
                  />
                  <Pressable
                    onPress={handleSubmitFeedback}
                    disabled={!feedbackText.trim()}
                    style={({ pressed }) => ([
                      styles.chatSendButton,
                      {
                        backgroundColor: feedbackText.trim() ? colors.primary : "transparent",
                        opacity: pressed ? 0.7 : 1,
                      },
                    ])}
                  >
                    <Ionicons
                      name="arrow-up"
                      size={18}
                      color={feedbackText.trim() ? colors.white : colors.textMuted}
                    />
                  </Pressable>
                </View>
              </View>

              {/* Rating Section - only for completed/failed actions */}
              {(selectedAction.status === "completed" || selectedAction.status === "failed") && (
                <RatingSection
                  actionId={selectedAction.id}
                  existingRating={selectedAction.rating}
                  existingTags={selectedAction.ratingTags ? JSON.parse(selectedAction.ratingTags) : []}
                  existingComment={selectedAction.ratingComment}
                />
              )}
            </ScrollView>
            </KeyboardAvoidingView>
            </SafeAreaView>
          </GestureHandlerRootView>
        )}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex1: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: fontFamily.bold,
    fontWeight: "700",
    letterSpacing: typography.tracking.tight,
    textTransform: "uppercase",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  settingsButton: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsButtonLight: {
    borderWidth: 1,
    // borderColor set dynamically via colors.border
  },
  content: {
    flex: 1,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  stopButton: {
    borderRadius: radii.md,
  },
  doneButton: {
    borderRadius: radii.md,
  },
  stopButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  stopButtonText: {
    fontSize: typography.sm,
    fontWeight: "600",
  },
  typeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  typeBadgeText: {
    fontSize: typography.xs,
    fontWeight: "600",
  },
  headerSpacer: {
    width: 40,
  },
  headerBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  typeBadgeColored: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  typeBadgeColoredText: {
    fontSize: typography.xs,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  subtypeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  subtypeBadgeText: {
    fontSize: typography.xs,
    fontWeight: "500",
    textTransform: "capitalize",
  },
  deployModeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  deployModeBadgeText: {
    fontSize: typography.xs,
    fontWeight: "500",
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  statusBadgeText: {
    fontSize: typography.xs,
    fontWeight: "500",
  },
  modalScroll: {
    flex: 1,
  },
  modalContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  modalTitle: {
    fontSize: typography.xl,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  modalDescription: {
    fontSize: typography.base,
    lineHeight: typography.base * 1.5,
    marginBottom: spacing.md,
  },
  projectAssociationBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  projectAssociationTextWrap: {
    flex: 1,
  },
  projectAssociationLabel: {
    fontSize: typography.xs,
    marginBottom: 2,
  },
  projectAssociationValue: {
    fontSize: typography.sm,
    fontWeight: "700",
  },
  projectAssociationPath: {
    fontSize: typography.xs,
    marginTop: 2,
  },
  dependencySection: {
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  dependencyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  dependencySectionLabel: {
    fontSize: typography.sm,
    fontWeight: "600",
  },
  dependencyItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.sm,
    borderRadius: radii.sm,
    gap: spacing.sm,
  },
  dependencyTitle: {
    fontSize: typography.sm,
    flex: 1,
  },
  dependencyStatus: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  dependencyStatusText: {
    fontSize: typography.xs,
    fontWeight: "500",
  },
  timestampSection: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginBottom: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  timestampItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  timestampText: {
    fontSize: typography.xs,
  },
  // Skills Used section
  skillsUsedSection: {
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  skillsUsedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  skillsUsedIcon: {
    fontSize: 16,
  },
  skillsUsedLabel: {
    fontSize: typography.sm,
    fontWeight: "600",
  },
  skillsUsedBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  skillUsedBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  skillUsedBadgeText: {
    fontSize: typography.sm,
    fontWeight: "600",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  // Progress section styles
  progressSection: {
    marginBottom: spacing.lg,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  progressLabel: {
    fontSize: typography.sm,
    fontWeight: "600",
  },
  progressWaiting: {
    fontSize: typography.sm,
    fontStyle: "italic",
  },
  // Skills badges (prominent!)
  skillsBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  skillBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  skillBadgeIcon: {
    fontSize: 12,
  },
  skillBadgeText: {
    fontSize: typography.xs,
    fontWeight: "600",
  },
  skillsBadgesSmall: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  skillBadgeSmall: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  skillBadgeTextSmall: {
    fontSize: typography.xs,
    fontWeight: "500",
  },
  // Current activity (what's happening now)
  currentActivityBox: {
    padding: spacing.sm,
    borderRadius: radii.sm,
    marginBottom: spacing.md,
  },
  currentActivityText: {
    fontSize: typography.sm,
    fontWeight: "500",
    lineHeight: typography.sm * 1.4,
  },
  // Whimsical activity feed
  activityFeed: {
    gap: spacing.xs,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  activityIcon: {
    fontSize: 16,
    width: 22,
    textAlign: "center",
  },
  activityContent: {
    flex: 1,
  },
  activityLabel: {
    fontSize: typography.sm,
    lineHeight: typography.sm * 1.4,
  },
  activityDuration: {
    fontSize: typography.xs,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  activityPulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
  },
  threadedTimelineSection: {
    marginBottom: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  turnCard: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  turnHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  turnTitle: {
    fontSize: typography.xs,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  turnTime: {
    fontSize: typography.xs,
  },
  turnToolsContainer: {
    marginTop: spacing.xs,
  },
  turnToolsLabel: {
    fontSize: typography.xs,
    fontWeight: "600",
    marginBottom: spacing.xs,
  },
  // Legacy styles kept for backward compat
  thinkingBox: {
    borderRadius: radii.sm,
    padding: spacing.sm,
  },
  thinkingLabel: {
    fontSize: typography.xs,
    marginBottom: spacing.xs,
  },
  thinkingText: {
    fontSize: typography.sm,
    fontStyle: "italic",
    lineHeight: typography.sm * 1.4,
  },
  sectionLabel: {
    fontSize: typography.sm,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  voiceNoteSection: {
    marginBottom: spacing.lg,
  },
  resultSection: {
    marginBottom: spacing.lg,
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  ttsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  ttsButtonText: {
    fontSize: typography.xs,
    fontWeight: "600",
  },
  ttsSpeedButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
  },
  ttsSpeedText: {
    fontSize: typography.xs,
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  ttsStopButton: {
    width: 26,
    height: 26,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
  },
  errorSection: {
    marginBottom: spacing.lg,
  },
  resultUrlButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.lg,
    marginBottom: spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  resultUrlButtonText: {
    fontSize: typography.lg,
    fontWeight: "700",
  },
  resultBox: {
    padding: spacing.md,
    borderRadius: radii.md,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
  },
  errorText: {
    flex: 1,
    fontSize: typography.sm,
    lineHeight: typography.sm * 1.4,
  },
  threadSection: {
    marginTop: spacing.lg,
  },
  threadHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  threadDividerLine: {
    flex: 1,
    height: 1,
  },
  threadHeaderLabel: {
    fontSize: typography.xs,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  threadMessages: {
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  chatRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  chatRowUser: {
    justifyContent: "flex-end",
  },
  chatRowAssistant: {
    justifyContent: "flex-start",
  },
  chatAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  chatBubble: {
    maxWidth: "78%",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
  },
  chatBubbleUser: {
    borderBottomRightRadius: radii.xs,
  },
  chatBubbleAssistant: {
    borderBottomLeftRadius: radii.xs,
    borderWidth: 1,
  },
  chatContent: {
    fontSize: typography.sm,
    lineHeight: typography.sm * 1.5,
  },
  chatContentUser: {
    fontWeight: "400",
  },
  chatTimestamp: {
    fontSize: 10,
    marginTop: spacing.xs,
    textAlign: "right",
  },
  chatInputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  chatInput: {
    flex: 1,
    fontSize: typography.sm,
    maxHeight: 100,
    paddingVertical: spacing.sm,
    lineHeight: typography.sm * 1.4,
  },
  chatSendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: {
    opacity: 0.8,
  },
});
