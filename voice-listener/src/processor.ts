import { spawn } from "bun";
import { join, resolve } from "path";

export interface ExtractedAction {
  type: "bug" | "feature" | "todo" | "question" | "command" | "idea";
  title: string;
  description?: string;
  status: "pending";
  projectPath?: string;
}

interface ProcessResult {
  success: boolean;
  actions: ExtractedAction[];
  error?: string;
}

// Resolve workspace paths relative to mic-app root (one level up from voice-listener)
const MIC_APP_ROOT = resolve(import.meta.dir, "../..");
const WORKSPACE_PROJECTS = join(MIC_APP_ROOT, "workspace", "projects");

const PROMPT_TEMPLATE = `You are an action extractor. Analyze the following voice transcription and extract any actionable items.

For each action, determine its type:
- "bug": Reports of bugs, issues, or things that are broken
- "feature": Feature requests or enhancements
- "todo": Tasks to complete, reminders
- "question": Questions that need answers
- "command": Direct commands to execute something
- "idea": Ideas for products, features, or projects (phrases like "I have an idea", "what if we built", "we could create")

Output ONLY a JSON block with the extracted actions. If no actions are found, output an empty array.

Format:
\`\`\`json
{
  "actions": [
    {
      "type": "bug|feature|todo|question|command|idea",
      "title": "Brief title (under 80 chars)",
      "description": "Optional longer description",
      "status": "pending",
      "projectPath": "Optional project path if mentioned"
    }
  ]
}
\`\`\`

Transcription:
"""
{{TRANSCRIPTION}}
"""`;

export async function processTranscription(transcription: string): Promise<ProcessResult> {
  const prompt = PROMPT_TEMPLATE.replace("{{TRANSCRIPTION}}", transcription);

  try {
    const proc = spawn({
      cmd: [
        "claude",
        "-p",
        prompt,
        "--dangerously-skip-permissions",
        "--max-budget-usd",
        "2.00",
        "--output-format",
        "text",
      ],
      stdout: "pipe",
      stderr: "pipe",
      cwd: WORKSPACE_PROJECTS,
    });

    // Set timeout (5 minutes)
    const timeout = setTimeout(() => {
      proc.kill();
    }, 5 * 60 * 1000);

    const output = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    clearTimeout(timeout);

    if (exitCode !== 0) {
      console.error("Claude stderr:", stderr);
      return {
        success: false,
        actions: [],
        error: `Claude exited with code ${exitCode}: ${stderr}`,
      };
    }

    // Extract JSON from the output
    const actions = parseActionsFromOutput(output);
    return { success: true, actions };
  } catch (error) {
    return {
      success: false,
      actions: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function parseActionsFromOutput(output: string): ExtractedAction[] {
  // Try to find JSON block in the output
  const jsonMatch = output.match(/```json\s*([\s\S]*?)\s*```/);
  const jsonStr = jsonMatch ? jsonMatch[1] : output;

  try {
    // Try to parse the entire output or extracted JSON
    const parsed = JSON.parse(jsonStr.trim());

    if (Array.isArray(parsed)) {
      return parsed.filter(isValidAction);
    }

    if (parsed.actions && Array.isArray(parsed.actions)) {
      return parsed.actions.filter(isValidAction);
    }

    return [];
  } catch {
    // Try to find any JSON object in the output
    const objectMatch = output.match(/\{[\s\S]*"actions"[\s\S]*\}/);
    if (objectMatch) {
      try {
        const parsed = JSON.parse(objectMatch[0]);
        if (parsed.actions && Array.isArray(parsed.actions)) {
          return parsed.actions.filter(isValidAction);
        }
      } catch {
        // Ignore parse errors
      }
    }
    return [];
  }
}

function isValidAction(action: unknown): action is ExtractedAction {
  if (typeof action !== "object" || action === null) return false;
  const a = action as Record<string, unknown>;
  return (
    typeof a.type === "string" &&
    ["bug", "feature", "todo", "question", "command", "idea"].includes(a.type) &&
    typeof a.title === "string" &&
    a.title.length > 0
  );
}
