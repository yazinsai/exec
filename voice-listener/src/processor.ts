import { spawn } from "bun";
import { existsSync, statSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join, resolve, isAbsolute } from "path";
import { loadPrompt } from "./prompt-loader";

const TEMP_DIR = join(import.meta.dir, "..", ".temp-images");

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
  // Sequencing fields
  sequenceIndex?: number; // Position in sequence (1-based)
  dependsOnIndex?: number; // Which sequenceIndex this depends on
}

interface ProcessResult {
  success: boolean;
  actions: ExtractedAction[];
  error?: string;
}

// Resolve paths: projects live under ~/ai/
const AI_ROOT = resolve(import.meta.dir, "../../../..");
const PROJECTS_DIR = join(AI_ROOT, "projects");

async function downloadImages(imageUrls: string[]): Promise<string[]> {
  if (imageUrls.length === 0) return [];

  // Ensure temp directory exists
  if (!existsSync(TEMP_DIR)) {
    mkdirSync(TEMP_DIR, { recursive: true });
  }

  const localPaths: string[] = [];

  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i];
    const ext = url.includes(".png") ? ".png" : url.includes(".jpg") || url.includes(".jpeg") ? ".jpg" : ".png";
    const filename = `image-${Date.now()}-${i}${ext}`;
    const localPath = join(TEMP_DIR, filename);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`Failed to download image ${url}: ${response.status}`);
        continue;
      }
      const buffer = await response.arrayBuffer();
      writeFileSync(localPath, Buffer.from(buffer));
      localPaths.push(localPath);
    } catch (error) {
      console.error(`Error downloading image ${url}:`, error);
    }
  }

  return localPaths;
}

function cleanupImages(localPaths: string[]): void {
  for (const path of localPaths) {
    try {
      if (existsSync(path)) {
        rmSync(path);
      }
    } catch (error) {
      console.error(`Failed to cleanup image ${path}:`, error);
    }
  }
}

export async function processTranscription(
  transcription: string,
  imageUrls: string[] = [],
  projectContext?: string,
): Promise<ProcessResult> {
  const hasImages = imageUrls.length > 0;
  let localImagePaths: string[] = [];

  try {
    // Download images if present
    if (hasImages) {
      localImagePaths = await downloadImages(imageUrls);
      if (localImagePaths.length === 0) {
        console.warn("Failed to download any images, proceeding without them");
      }
    }

    const useImagesPrompt = localImagePaths.length > 0;
    const promptName = useImagesPrompt ? "extraction-images" : "extraction";

    // Build variables for prompt
    const promptVars: Record<string, string> = { TRANSCRIPTION: transcription };
    if (useImagesPrompt) {
      promptVars.IMAGE_PATHS = localImagePaths.join("\n");
    }
    if (projectContext) {
      const folderName = projectContext.split("/").filter(Boolean).pop() ?? projectContext;
      promptVars.PROJECT_CONTEXT = [
        `The user was viewing project "${folderName}" when they recorded this.`,
        `- Default to routing CodeChange actions to this project (projectPath: "${folderName}")`,
        `- Only route elsewhere if the transcription clearly refers to a different project`,
        `- If the request is general with no specific project reference, route to "${folderName}"`,
      ].join("\n");
    } else {
      promptVars.PROJECT_CONTEXT = "No project context — the user recorded from the main screen.";
    }

    const prompt = loadPrompt(promptName, promptVars);

    // Build command arguments
    const cmdArgs = [
      "claude",
      "-p",
      prompt,
      "--dangerously-skip-permissions",
      "--output-format",
      "text",
    ];

    const proc = spawn({
      cmd: cmdArgs,
      stdout: "pipe",
      stderr: "pipe",
      cwd: PROJECTS_DIR,
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
      cleanupImages(localImagePaths);
      return {
        success: false,
        actions: [],
        error: `Claude exited with code ${exitCode}: ${stderr}`,
      };
    }

    // Extract JSON from the output
    const actions = validateExtractedActions(parseActionsFromOutput(output));
    cleanupImages(localImagePaths);
    return { success: true, actions };
  } catch (error) {
    cleanupImages(localImagePaths);
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
          `Extracted a CodeChange action, but it requires an existing project in ~/ai/projects/.`,
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
      : join(PROJECTS_DIR, projectPath);

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
          `Extracted a CodeChange action for "${projectPath}", but that folder doesn't exist in ~/ai/projects/.`,
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
