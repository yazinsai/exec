import { spawn } from "bun";
import { existsSync, statSync } from "fs";
import { join, resolve, isAbsolute } from "path";
import { loadPrompt } from "./prompt-loader";

export interface ExtractedAction {
  type: "CodeChange" | "Project" | "Research" | "Write" | "UserTask";
  subtype?: "bug" | "feature" | "refactor"; // Only for CodeChange
  title: string;
  description?: string;
  status: "pending";
  projectPath?: string;
  // UserTask-specific fields
  task?: string;
  why_user?: string;
  prep_allowed?: string;
  remind_at?: string;
}

interface ProcessResult {
  success: boolean;
  actions: ExtractedAction[];
  error?: string;
}

// Resolve workspace paths relative to mic-app root (one level up from voice-listener)
const MIC_APP_ROOT = resolve(import.meta.dir, "../..");
const WORKSPACE_PROJECTS = join(MIC_APP_ROOT, "workspace", "projects");

export async function processTranscription(
  transcription: string,
  imageUrls: string[] = []
): Promise<ProcessResult> {
  const hasImages = imageUrls.length > 0;
  const promptName = hasImages ? "extraction-images" : "extraction";
  const prompt = loadPrompt(promptName, { TRANSCRIPTION: transcription });

  try {
    // Build command arguments
    const cmdArgs = [
      "claude",
      "-p",
      prompt,
      "--dangerously-skip-permissions",
      "--output-format",
      "text",
    ];

    // Add image arguments if present
    for (const imageUrl of imageUrls) {
      cmdArgs.push("--image", imageUrl);
    }

    const proc = spawn({
      cmd: cmdArgs,
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
    const actions = validateExtractedActions(parseActionsFromOutput(output));
    return { success: true, actions };
  } catch (error) {
    return {
      success: false,
      actions: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function validateExtractedActions(actions: ExtractedAction[]): ExtractedAction[] {
  return actions.map((action) => {
    // Only CodeChange requires projectPath validation
    if (action.type !== "CodeChange") return action;

    const projectPath = action.projectPath?.trim();
    if (!projectPath) {
      // Convert to Research action asking for clarification
      return {
        type: "Research",
        title: `Which project for this ${action.subtype || "code change"}?`,
        description: [
          `Extracted a CodeChange action, but it requires an existing project in workspace/projects/.`,
          ``,
          `Original action:`,
          `- title: ${action.title}`,
          `- subtype: ${action.subtype || "(none)"}`,
          action.description ? `- description: ${action.description}` : ``,
          ``,
          `Which existing project folder should this apply to?`,
        ].filter(Boolean).join("\n"),
        status: "pending",
      };
    }

    const projectDir = isAbsolute(projectPath)
      ? projectPath
      : join(WORKSPACE_PROJECTS, projectPath);

    const existsAndIsDir = (() => {
      try {
        return existsSync(projectDir) && statSync(projectDir).isDirectory();
      } catch {
        return false;
      }
    })();

    if (!existsAndIsDir) {
      return {
        type: "Research",
        title: `Unknown project: "${projectPath}"`,
        description: [
          `Extracted a CodeChange action for "${projectPath}", but that folder doesn't exist in workspace/projects/.`,
          ``,
          `Original action:`,
          `- title: ${action.title}`,
          `- subtype: ${action.subtype || "(none)"}`,
          `- projectPath: ${projectPath}`,
          action.description ? `- description: ${action.description}` : ``,
          ``,
          `Which existing project folder should this apply to instead?`,
        ].filter(Boolean).join("\n"),
        status: "pending",
      };
    }

    return action;
  });
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

const VALID_TYPES = ["CodeChange", "Project", "Research", "Write", "UserTask"];

function isValidAction(action: unknown): action is ExtractedAction {
  if (typeof action !== "object" || action === null) return false;
  const a = action as Record<string, unknown>;
  
  // Must have valid type and title
  if (typeof a.type !== "string" || !VALID_TYPES.includes(a.type)) return false;
  if (typeof a.title !== "string" || a.title.length === 0) return false;
  
  // UserTask must have task field
  if (a.type === "UserTask" && typeof a.task !== "string") return false;
  
  return true;
}
