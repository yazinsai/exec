/**
 * CLI to update action fields from Claude Code execution.
 *
 * Simplified to only essential fields:
 * - status: Mark action complete/failed
 * - result: Set final summary
 * - deployUrl: Set deployment URL
 *
 * Progress updates are handled by log-watcher.
 */

import { db, id } from "../src/db";

const args = process.argv.slice(2);

// Support both: `<actionId> <field> <value>` and `<field> <value>` (with ACTION_ID env)
let actionId: string;
let field: string;
let value: string;

const VALID_FIELDS = ["status", "result", "deployUrl", "deployUrlLabel", "event"];

if (args.length >= 2 && !VALID_FIELDS.includes(args[0])) {
  // First arg is not a field name, so it's an action ID
  actionId = args[0];
  field = args[1];
  value = args.slice(2).join(" ");
} else {
  // First arg is a field name, get action ID from env
  actionId = process.env.ACTION_ID || "";
  field = args[0];
  value = args.slice(1).join(" ");
}

if (!actionId || !field) {
  console.error("Usage: $ACTION_CLI <field> <value>");
  console.error("");
  console.error("Fields:");
  console.error("  status         - Set status (completed, failed, cancelled)");
  console.error("  result         - Set final result summary");
  console.error("  deployUrl      - Set deployment URL");
  console.error("  deployUrlLabel - Set custom button text (e.g., 'Download APK')");
  console.error("  event          - Emit a progress milestone event");
  console.error("");
  console.error("Examples:");
  console.error('  $ACTION_CLI status completed');
  console.error('  $ACTION_CLI result "Task completed successfully"');
  console.error('  $ACTION_CLI deployUrl "https://my-app.whhite.com"');
  console.error('  $ACTION_CLI deployUrlLabel "Download APK"');
  console.error('  $ACTION_CLI event "Deploying to production"');
  process.exit(1);
}

if (!VALID_FIELDS.includes(field)) {
  console.error(`Unknown field: ${field}`);
  console.error(`Valid fields: ${VALID_FIELDS.join(", ")}`);
  process.exit(1);
}

async function update() {
  if (field === "event") {
    const now = Date.now();
    const eventId = id();
    await db.transact([
      db.tx.events[eventId].update({
        actionId,
        projectPath: null,
        type: "milestone",
        icon: "📌",
        label: value,
        detail: null,
        status: "done",
        duration: null,
        createdAt: now,
      }),
      db.tx.events[eventId].link({ action: actionId }),
      db.tx.actions[actionId].update({ lastEventAt: now }),
    ]);
    console.log(`Emitted event for action ${actionId}: ${value}`);
    process.exit(0);
  }

  const updateObj: Record<string, string> = { [field]: value };

  // Add completedAt timestamp when marking as complete/failed
  if (field === "status" && ["completed", "failed", "cancelled"].includes(value)) {
    (updateObj as Record<string, unknown>).completedAt = Date.now();
  }

  await db.transact(db.tx.actions[actionId].update(updateObj));
  console.log(`Updated action ${actionId}: ${field} = ${value}`);
  process.exit(0);
}

update().catch((e) => {
  console.error("Failed to update action:", e);
  process.exit(1);
});
