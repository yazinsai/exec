export interface ThreadMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export type ActivityType = "skill" | "tool" | "agent" | "message" | "milestone";

export interface Activity {
  id: string;
  type: ActivityType;
  icon: string;
  label: string;
  detail?: string;
  timestamp: number;
  duration?: number;
  status: "active" | "done" | "error";
}

export interface TimelineTurn {
  id: string;
  userMessage?: ThreadMessage;
  assistantMessages: ThreadMessage[];
  toolActivities: Activity[];
  startedAt: number;
}

export function parseMessages(json: string | undefined | null): ThreadMessage[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as ThreadMessage[];
    return parsed
      .filter((msg) => typeof msg?.timestamp === "number")
      .sort((a, b) => a.timestamp - b.timestamp);
  } catch {
    return [];
  }
}

export function buildTimelineTurns(messages: ThreadMessage[], activities: Activity[]): TimelineTurn[] {
  const users = messages.filter((m) => m.role === "user");
  const assistants = messages.filter((m) => m.role === "assistant");
  const sortedActivities = [...activities].sort((a, b) => a.timestamp - b.timestamp);

  if (users.length === 0) {
    return [
      {
        id: "execution",
        assistantMessages: assistants,
        toolActivities: sortedActivities,
        startedAt:
          assistants[0]?.timestamp ??
          sortedActivities[0]?.timestamp ??
          Date.now(),
      },
    ];
  }

  return users.map((user, index) => {
    const nextUserTs = users[index + 1]?.timestamp ?? Number.POSITIVE_INFINITY;

    return {
      id: `turn-${index + 1}`,
      userMessage: user,
      assistantMessages: assistants.filter(
        (a) => a.timestamp >= user.timestamp && a.timestamp < nextUserTs
      ),
      toolActivities: sortedActivities.filter(
        (activity) => activity.timestamp >= user.timestamp && activity.timestamp < nextUserTs
      ),
      startedAt: user.timestamp,
    };
  });
}

export function getProjectLabel(projectPath?: string | null): string {
  if (!projectPath) return "No Project";
  const normalized = projectPath.replace(/\\/g, "/").replace(/\/$/, "");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] || normalized;
}
