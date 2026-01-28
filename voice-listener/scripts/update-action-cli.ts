import { db } from "../src/db";

const [actionId, field, ...valueParts] = process.argv.slice(2);
const value = valueParts.join(" ");

if (!actionId || !field) {
  console.error("Usage: bun run scripts/update-action-cli.ts <actionId> <field> <value>");
  console.error("");
  console.error("Fields:");
  console.error("  result     - Set the result text");
  console.error("  status     - Set status (pending, in_progress, completed, failed)");
  console.error("  deployUrl  - Set the deployment URL");
  console.error("  messages   - Set messages JSON array");
  console.error("  json       - Update multiple fields from JSON object");
  console.error("");
  console.error("Examples:");
  console.error('  bun run scripts/update-action-cli.ts abc123 status completed');
  console.error('  bun run scripts/update-action-cli.ts abc123 result "Task completed successfully"');
  console.error('  bun run scripts/update-action-cli.ts abc123 json \'{"status":"completed","result":"Done!"}\'');
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
