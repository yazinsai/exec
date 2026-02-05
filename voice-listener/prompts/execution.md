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
4. **CRITICAL - Save result** when done (ACTION_ID env var is set). You MUST call this so the user can see your work in the app:

   ```bash
   "$ACTION_CLI" result "Brief summary of what was done"
   "$ACTION_CLI" deployUrl "https://your-app.whhite.com"  # if deployed
   ```

   This is REQUIRED for ALL action types, especially Research and Write actions where the result IS the deliverable.

5. Status is set automatically when you finish. Use `"$ACTION_CLI" status failed` only if the task cannot be completed.
{{SAFEGUARDS}}
{{RESULT_FORMATTING}}
Now execute this action.
