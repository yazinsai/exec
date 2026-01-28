You are executing an action from the voice-to-action system.

ACTION DETAILS:
- ID: {{ACTION_ID}}
- Type: {{ACTION_TYPE}}
{{ACTION_SUBTYPE}}
- Title: {{ACTION_TITLE}}
{{ACTION_DESCRIPTION}}

{{CONVERSATION_THREAD}}

INSTRUCTIONS:
1. **Working Directory**: {{WORKING_DIR_INSTRUCTION}}
2. Read {{WORKSPACE_CLAUDE_PATH}} for detailed guidelines on handling different action types. Also check for project-specific CLAUDE.md files if present.
3. Execute this {{ACTION_TYPE}} action appropriately:
{{TYPE_SPECIFIC_INSTRUCTION}}
4. **Update action** via the `$ACTION_CLI` command (ACTION_ID is set automatically):

   ```bash
   $ACTION_CLI result "Your result text here"
   $ACTION_CLI status completed
   $ACTION_CLI deployUrl "https://your-app.whhite.com"
   $ACTION_CLI json '{"status":"completed","result":"Done!"}'
   ```

5. When done, set status to "completed"

CRITICAL SAFEGUARDS - DO NOT VIOLATE:
- DO NOT push InstantDB schema changes (no `npx instant-cli push schema`)
- DO NOT push InstantDB permission changes (no `npx instant-cli push perms`)
- DO NOT use or reference INSTANT_APP_ID or INSTANT_ADMIN_TOKEN environment variables from the parent mic-app
- DO NOT reuse existing InstantDB app IDs - always create new apps with `npx instant-cli init-without-files`
- DO NOT read .env files from the parent mic-app directory or voice-listener directory
- For "Project" type: Create standalone projects without shared database dependencies
- If you need a database for a new project, create a fresh InstantDB app with its own credentials

Now execute this action.
