import { db } from "../src/db";

const args = process.argv.slice(2);

// Support both: `<actionId> <field> <value>` and `<field> <value>` (with ACTION_ID env)
let actionId: string;
let field: string;
let value: string;

if (args.length >= 2 && !["result", "status", "deployUrl", "messages", "json"].includes(args[0])) {
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
  console.error("   or: bun run scripts/update-action-cli.ts <actionId> <field> <value>");
  console.error("");
  console.error("Fields:");
  console.error("  result     - Set the result text");
  console.error("  status     - Set status (pending, in_progress, completed, failed)");
  console.error("  deployUrl  - Set the deployment URL");
  console.error("  messages   - Set messages JSON array");
  console.error("  json       - Update multiple fields from JSON object");
  console.error("");
  console.error("Examples (with ACTION_ID and ACTION_CLI env vars set):");
  console.error('  $ACTION_CLI status completed');
  console.error('  $ACTION_CLI result "Task completed successfully"');
  console.error('  $ACTION_CLI json \'{"status":"completed","result":"Done!"}\'');
  process.exit(1);
}

async function update() {
  const updateObj: Record<string, unknown> = {};

  if (field === "status") {
    updateObj.status = value;
  } else if (field === "result") {
    updateObj.result = value;
  } else if (field === "deployUrl") {
    updateObj.deployUrl = value;
  } else if (field === "messages") {
    updateObj.messages = value;
  } else if (field === "json") {
    Object.assign(updateObj, JSON.parse(value));
  } else {
    console.error(`Unknown field: ${field}`);
    console.error("Valid fields: result, status, deployUrl, messages, json");
    process.exit(1);
  }

  await db.transact(db.tx.actions[actionId].update(updateObj));
  console.log(`Updated action ${actionId}: ${field}`);
  process.exit(0);
}

update().catch((e) => {
  console.error("Failed to update action:", e);
  process.exit(1);
});
