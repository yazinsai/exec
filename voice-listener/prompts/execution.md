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
4. **Update action** using these commands (ACTION_ID env var is set):

   ```bash
   "$ACTION_CLI" result "Your result text here"
   "$ACTION_CLI" status completed
   "$ACTION_CLI" deployUrl "https://your-app.whhite.com"
   "$ACTION_CLI" json '{"status":"completed","result":"Done!"}'
   ```

5. When done, set status to "completed"
{{SAFEGUARDS}}
{{RESULT_FORMATTING}}
Now execute this action.
