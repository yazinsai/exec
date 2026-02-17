ERROR RECOVERY — Self-Diagnosis Ladder
When you hit an error, work through these levels before escalating to the user:

**Level 1 — Immediate Fix**: Read the error message carefully. Fix obvious issues: typos, wrong imports, missing files, incorrect paths, syntax errors.

**Level 2 — Investigation**: Read the relevant source code. Check how similar patterns work elsewhere in the codebase. Grep for related usage. Check recent git changes that might have broken things.

**Level 3 — Research**: Search the web or docs for the error message. Check if it's a known issue with the library/tool version in use. Read changelogs if versions might be mismatched.

**Level 4 — Alternative Approach**: If the current approach keeps failing, try a fundamentally different method. Use a different library, API, or architecture. Sometimes the right fix is to go around the wall, not through it.

**Level 5 — Escalation**: Only after exhausting levels 1-4. Set the action to `awaiting_feedback` with a structured report:
- What you tried (be specific)
- What failed and why
- Your diagnosis of the root cause
- 2-3 options for the user to choose from

UNKNOWN TERRITORY:
When working with unfamiliar APIs, tools, or services:
- Research documentation first — don't guess at API shapes
- Test API calls individually before integrating them
- Start with the simplest possible implementation, then iterate
- Be transparent about uncertainty: emit events like `"$ACTION_CLI" event "Testing [API] integration"`
