/**
 * Structured error taxonomy for failure analysis
 */

export type ErrorCategory =
  | "timeout"
  | "crash"
  | "oom"
  | "rate_limit"
  | "permission_denied"
  | "dependency_error"
  | "cancelled"
  | "unknown";

interface ClassificationResult {
  category: ErrorCategory;
  confidence: "high" | "medium" | "low";
}

/**
 * Classify an error based on exit code and stderr content
 */
export function classifyError(
  exitCode: number,
  stderr: string,
  wasCancelled: boolean
): ClassificationResult {
  const stderrLower = stderr.toLowerCase();

  // User cancelled
  if (wasCancelled) {
    return { category: "cancelled", confidence: "high" };
  }

  // Timeout (exit code 124 from timeout command, or explicit message)
  if (exitCode === 124 || stderrLower.includes("timed out") || stderrLower.includes("timeout")) {
    return { category: "timeout", confidence: "high" };
  }

  // Out of memory (exit code 137 = killed by OOM, or explicit message)
  if (exitCode === 137 || stderrLower.includes("out of memory") || stderrLower.includes("oom")) {
    return { category: "oom", confidence: "high" };
  }

  // Rate limiting
  if (
    stderrLower.includes("rate limit") ||
    stderrLower.includes("429") ||
    stderrLower.includes("too many requests") ||
    stderrLower.includes("overloaded")
  ) {
    return { category: "rate_limit", confidence: "high" };
  }

  // Permission denied
  if (
    stderrLower.includes("eacces") ||
    stderrLower.includes("permission denied") ||
    stderrLower.includes("access denied")
  ) {
    return { category: "permission_denied", confidence: "high" };
  }

  // Dependency/file not found errors
  if (
    stderrLower.includes("enoent") ||
    stderrLower.includes("not found") ||
    stderrLower.includes("no such file") ||
    stderrLower.includes("module not found") ||
    stderrLower.includes("cannot find module")
  ) {
    return { category: "dependency_error", confidence: "medium" };
  }

  // Generic crash (non-zero exit without specific pattern)
  if (exitCode !== 0) {
    return { category: "crash", confidence: "low" };
  }

  return { category: "unknown", confidence: "low" };
}

/**
 * Get a human-readable description of an error category
 */
export function getErrorCategoryDescription(category: ErrorCategory): string {
  switch (category) {
    case "timeout":
      return "Execution timed out";
    case "crash":
      return "Process crashed unexpectedly";
    case "oom":
      return "Out of memory";
    case "rate_limit":
      return "API rate limit exceeded";
    case "permission_denied":
      return "Permission denied";
    case "dependency_error":
      return "Missing dependency or file";
    case "cancelled":
      return "Cancelled by user";
    case "unknown":
    default:
      return "Unknown error";
  }
}
