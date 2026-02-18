import { spawn } from "bun";

/**
 * Call Claude via `claude -p` for lightweight prompt→text tasks.
 * No API key needed — uses the same Claude Code CLI as the executor.
 */
export async function callClaude(
  prompt: string,
  options?: { model?: string; maxTurns?: number }
): Promise<string | null> {
  const cmd = [
    "claude",
    "-p",
    prompt,
    "--output-format",
    "text",
    "--max-turns",
    String(options?.maxTurns ?? 1),
  ];

  if (options?.model) {
    cmd.push("--model", options.model);
  }

  try {
    const proc = spawn({
      cmd,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    proc.stdin.end();

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      console.error(`claude -p exited with code ${exitCode}:`, stderr.slice(0, 300));
      return null;
    }

    return stdout.trim() || null;
  } catch (error) {
    console.error("claude -p call failed:", error);
    return null;
  }
}
