#!/usr/bin/env bun
/**
 * Analyze action metrics for observability and prompt improvement
 *
 * Usage:
 *   bun run analyze                    # Last 7 days
 *   bun run analyze --format markdown  # Markdown output
 *   bun run analyze --from 2025-01-20  # Custom date range
 *   bun run analyze --to 2025-01-27    # End date
 */

import { db } from "../src/db";
import { updateVersionMetrics } from "../src/prompt-versioning";
import { getErrorCategoryDescription, type ErrorCategory } from "../src/error-categories";

interface Action {
  id: string;
  type: string;
  title: string;
  status: string;
  extractedAt: number;
  completedAt?: number;
  rating?: number;
  ratingTags?: string;
  ratingComment?: string;
  durationMs?: number;
  errorCategory?: string;
  toolsUsed?: number;
  promptVersionId?: string;
}

interface PromptVersion {
  id: string;
  version: string;
  createdAt: number;
  notes?: string;
}

// Parse CLI args
const args = process.argv.slice(2);
const formatMarkdown = args.includes("--format") && args[args.indexOf("--format") + 1] === "markdown";
const fromArg = args.includes("--from") ? args[args.indexOf("--from") + 1] : null;
const toArg = args.includes("--to") ? args[args.indexOf("--to") + 1] : null;

// Default to last 7 days
const now = Date.now();
const defaultFrom = now - 7 * 24 * 60 * 60 * 1000;
const fromDate = fromArg ? new Date(fromArg).getTime() : defaultFrom;
const toDate = toArg ? new Date(toArg).getTime() : now;

async function fetchData() {
  const [actionsResult, versionsResult] = await Promise.all([
    db.query({ actions: {} }),
    db.query({ promptVersions: {} }),
  ]);

  const actions = (actionsResult.actions ?? []) as Action[];
  const versions = (versionsResult.promptVersions ?? []) as PromptVersion[];

  // Filter by date range
  const filtered = actions.filter(
    (a) => a.extractedAt >= fromDate && a.extractedAt <= toDate
  );

  return { actions: filtered, versions };
}

function computeStats(actions: Action[]) {
  const total = actions.length;
  const completed = actions.filter((a) => a.status === "completed").length;
  const failed = actions.filter((a) => a.status === "failed").length;
  const cancelled = actions.filter((a) => a.status === "cancelled").length;
  const pending = actions.filter((a) => a.status === "pending").length;
  const inProgress = actions.filter((a) => a.status === "in_progress").length;

  const successRate = total > 0 ? ((completed / total) * 100).toFixed(1) : "0";

  // Rating stats
  const rated = actions.filter((a) => a.rating != null);
  const avgRating =
    rated.length > 0
      ? (rated.reduce((sum, a) => sum + (a.rating ?? 0), 0) / rated.length).toFixed(2)
      : "N/A";

  // Duration stats
  const withDuration = actions.filter((a) => a.durationMs != null);
  const avgDurationMs =
    withDuration.length > 0
      ? withDuration.reduce((sum, a) => sum + (a.durationMs ?? 0), 0) / withDuration.length
      : 0;
  const avgDurationMin = (avgDurationMs / 60000).toFixed(1);

  // Tool usage stats
  const withTools = actions.filter((a) => a.toolsUsed != null);
  const avgTools =
    withTools.length > 0
      ? (withTools.reduce((sum, a) => sum + (a.toolsUsed ?? 0), 0) / withTools.length).toFixed(0)
      : "N/A";

  return {
    total,
    completed,
    failed,
    cancelled,
    pending,
    inProgress,
    successRate,
    rated: rated.length,
    avgRating,
    avgDurationMin,
    avgTools,
  };
}

function computeByType(actions: Action[]) {
  const byType: Record<string, Action[]> = {};
  for (const action of actions) {
    if (!byType[action.type]) byType[action.type] = [];
    byType[action.type].push(action);
  }

  return Object.entries(byType).map(([type, typeActions]) => {
    const stats = computeStats(typeActions);
    return { type, ...stats };
  });
}

function computeByVersion(actions: Action[], versions: PromptVersion[]) {
  const byVersion: Record<string, Action[]> = {};
  for (const action of actions) {
    const version = action.promptVersionId ?? "unknown";
    if (!byVersion[version]) byVersion[version] = [];
    byVersion[version].push(action);
  }

  return Object.entries(byVersion).map(([version, versionActions]) => {
    const stats = computeStats(versionActions);
    const versionInfo = versions.find((v) => v.version === version);
    return { version, createdAt: versionInfo?.createdAt, notes: versionInfo?.notes, ...stats };
  });
}

function computeErrorCategories(actions: Action[]) {
  const failed = actions.filter((a) => a.status === "failed" || a.status === "cancelled");
  const byCategory: Record<string, number> = {};

  for (const action of failed) {
    const category = action.errorCategory ?? "unknown";
    byCategory[category] = (byCategory[category] ?? 0) + 1;
  }

  return Object.entries(byCategory)
    .map(([category, count]) => ({
      category,
      description: getErrorCategoryDescription(category as ErrorCategory),
      count,
      percent: ((count / failed.length) * 100).toFixed(1),
    }))
    .sort((a, b) => b.count - a.count);
}

function computeRatingTags(actions: Action[]) {
  const rated = actions.filter((a) => a.ratingTags);
  const tagCounts: Record<string, number> = {};

  for (const action of rated) {
    try {
      const tags = JSON.parse(action.ratingTags!) as string[];
      for (const tag of tags) {
        tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
      }
    } catch {
      // ignore parse errors
    }
  }

  return Object.entries(tagCounts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

function getLowRatedActions(actions: Action[]) {
  return actions
    .filter((a) => a.rating != null && a.rating <= 2)
    .sort((a, b) => (a.rating ?? 0) - (b.rating ?? 0))
    .slice(0, 10);
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

async function printReport(markdown: boolean) {
  const { actions, versions } = await fetchData();

  const stats = computeStats(actions);
  const byType = computeByType(actions);
  const byVersion = computeByVersion(actions, versions);
  const errorCategories = computeErrorCategories(actions);
  const ratingTags = computeRatingTags(actions);
  const lowRated = getLowRatedActions(actions);

  const dateRange = `${new Date(fromDate).toISOString().split("T")[0]} to ${new Date(toDate).toISOString().split("T")[0]}`;

  if (markdown) {
    console.log(`# Action Metrics Report\n`);
    console.log(`**Date Range:** ${dateRange}\n`);

    console.log(`## Summary\n`);
    console.log(`| Metric | Value |`);
    console.log(`|--------|-------|`);
    console.log(`| Total Actions | ${stats.total} |`);
    console.log(`| Completed | ${stats.completed} |`);
    console.log(`| Failed | ${stats.failed} |`);
    console.log(`| Cancelled | ${stats.cancelled} |`);
    console.log(`| Success Rate | ${stats.successRate}% |`);
    console.log(`| Rated | ${stats.rated} |`);
    console.log(`| Avg Rating | ${stats.avgRating} |`);
    console.log(`| Avg Duration | ${stats.avgDurationMin} min |`);
    console.log(`| Avg Tools Used | ${stats.avgTools} |`);
    console.log();

    console.log(`## By Action Type\n`);
    console.log(`| Type | Total | Success Rate | Avg Rating |`);
    console.log(`|------|-------|--------------|------------|`);
    for (const row of byType) {
      console.log(`| ${row.type} | ${row.total} | ${row.successRate}% | ${row.avgRating} |`);
    }
    console.log();

    console.log(`## By Prompt Version\n`);
    console.log(`| Version | Total | Success Rate | Avg Rating |`);
    console.log(`|---------|-------|--------------|------------|`);
    for (const row of byVersion) {
      console.log(`| ${row.version} | ${row.total} | ${row.successRate}% | ${row.avgRating} |`);
    }
    console.log();

    if (errorCategories.length > 0) {
      console.log(`## Error Categories\n`);
      console.log(`| Category | Count | % |`);
      console.log(`|----------|-------|---|`);
      for (const row of errorCategories) {
        console.log(`| ${row.description} | ${row.count} | ${row.percent}% |`);
      }
      console.log();
    }

    if (ratingTags.length > 0) {
      console.log(`## Top Issue Tags\n`);
      console.log(`| Tag | Count |`);
      console.log(`|-----|-------|`);
      for (const row of ratingTags.slice(0, 10)) {
        console.log(`| ${row.tag} | ${row.count} |`);
      }
      console.log();
    }

    if (lowRated.length > 0) {
      console.log(`## Low-Rated Actions\n`);
      for (const action of lowRated) {
        console.log(`- **${action.title}** (${action.rating}/5)`);
        if (action.ratingComment) {
          console.log(`  > ${action.ratingComment}`);
        }
      }
      console.log();
    }
  } else {
    // Plain text output
    console.log(`\n${"=".repeat(60)}`);
    console.log(`ACTION METRICS REPORT`);
    console.log(`Date Range: ${dateRange}`);
    console.log("=".repeat(60));

    console.log(`\n--- SUMMARY ---`);
    console.log(`Total Actions:    ${stats.total}`);
    console.log(`Completed:        ${stats.completed}`);
    console.log(`Failed:           ${stats.failed}`);
    console.log(`Cancelled:        ${stats.cancelled}`);
    console.log(`Pending:          ${stats.pending}`);
    console.log(`In Progress:      ${stats.inProgress}`);
    console.log(`Success Rate:     ${stats.successRate}%`);
    console.log(`Rated:            ${stats.rated}`);
    console.log(`Avg Rating:       ${stats.avgRating}`);
    console.log(`Avg Duration:     ${stats.avgDurationMin} min`);
    console.log(`Avg Tools Used:   ${stats.avgTools}`);

    console.log(`\n--- BY ACTION TYPE ---`);
    for (const row of byType) {
      console.log(`  ${row.type.padEnd(12)} total=${row.total} success=${row.successRate}% rating=${row.avgRating}`);
    }

    console.log(`\n--- BY PROMPT VERSION ---`);
    for (const row of byVersion) {
      console.log(`  ${row.version.padEnd(14)} total=${row.total} success=${row.successRate}% rating=${row.avgRating}`);
    }

    if (errorCategories.length > 0) {
      console.log(`\n--- ERROR CATEGORIES ---`);
      for (const row of errorCategories) {
        console.log(`  ${row.description.padEnd(25)} ${row.count} (${row.percent}%)`);
      }
    }

    if (ratingTags.length > 0) {
      console.log(`\n--- TOP ISSUE TAGS ---`);
      for (const row of ratingTags.slice(0, 10)) {
        console.log(`  ${row.tag.padEnd(20)} ${row.count}`);
      }
    }

    if (lowRated.length > 0) {
      console.log(`\n--- LOW-RATED ACTIONS ---`);
      for (const action of lowRated) {
        console.log(`  [${action.rating}/5] ${action.title}`);
        if (action.ratingComment) {
          console.log(`         "${action.ratingComment}"`);
        }
      }
    }

    console.log(`\n${"=".repeat(60)}\n`);
  }

  // Update prompt version metrics in DB
  for (const row of byVersion) {
    if (row.version !== "unknown") {
      await updateVersionMetrics(row.version, {
        totalRuns: row.total,
        avgRating: row.avgRating !== "N/A" ? parseFloat(row.avgRating) : undefined,
        successRate: parseFloat(row.successRate),
      });
    }
  }
}

printReport(formatMarkdown).catch(console.error);
