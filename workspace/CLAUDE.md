# Workspace Guidelines

This workspace is used by the voice-to-action system. Claude Code executes actions in `workspace/projects/`.

## Working Directory

- **Projects**: `workspace/projects/` - Contains existing projects that Claude will work on
- **Notes**: `workspace/notes/` - Documentation, research, and planning notes

## Action Types

### `CodeChange`
Changes to existing code. Has subtype: `bug`, `feature`, or `refactor`.

**Process**:
1. **Navigate to project**: Use `projectPath` to find the project in `workspace/projects/`
2. **Check existing state**: Search codebase/git history to see if already addressed
3. **Implement the change**:
   - `bug`: Investigate, identify root cause, fix, test
   - `feature`: Design approach, implement, test
   - `refactor`: Improve code quality while preserving behavior
4. **Document**: Update `result` field with what was done

**Important**: The project must already exist in `workspace/projects/`.

### `Project`
Create a new standalone project from an idea.

**Process**:
1. **Research Phase**:
   - Research the concept and similar solutions
   - Identify required 3rd party services/APIs
2. **Planning Phase**:
   - Design the architecture/approach
   - List required services and dependencies
   - Create implementation plan
3. **Prototype Phase**:
   - **Create new project**: Create a new subdirectory in `workspace/projects/` for this prototype
   - Build a working prototype in the new project directory
   - Implement core functionality
   - Test basic flows
4. **Deployment** (for web apps):
   - Deploy to dokku using a subdomain of `*.whhite.com` (DNS already configured)
   - Domain format: `{app-name}.whhite.com` (e.g., `my-app.whhite.com`)
   - After deployment, obtain the URL from dokku output and **set `deployUrl`** in the action record
   - This enables the "Open App" button in the mobile app UI
5. **Documentation**:
   - Update `result` field with research summary, services identified, and plan
   - If deployed, set `deployUrl`

**Note**: This is the only type that creates new projects in `workspace/projects/`.

### `Research`
Questions that need investigation or analysis.

**Process**:
1. Research the topic thoroughly
2. Provide comprehensive answer with sources
3. Update `result` field with findings

### `Write`
Content creation - posts, docs, articles, emails.

**Process**:
1. Understand the audience and tone
2. Draft the content
3. For social media: Use `/typefully` to create drafts for LinkedIn and Twitter
4. Update `result` with the content or draft links

### `UserTask`
Tasks requiring human action (not for AI to execute).

**Fields**:
- `task`: What needs to be done
- `why_user`: Why this requires human involvement
- `prep_allowed`: What AI can prepare in advance
- `remind_at`: Optional reminder time

**Process**:
1. If `prep_allowed` is set, prepare/draft what's allowed
2. Update `result` with any prepared materials
3. Mark as completed (the actual task is for the human)

## Deploying to Dokku

For `Project` type actions that produce web apps:

1. **Domain**: Use `{app-name}.whhite.com` - DNS is pre-configured to point to `dokku-server`
2. **Create app**: `ssh dokku@dokku-server apps:create {app-name}`
3. **Add domain**: `ssh dokku@dokku-server domains:add {app-name} {app-name}.whhite.com`
4. **Deploy**: Push via git or use `dokku git:sync`
5. **Set deployUrl**: After successful deployment, update the action:
   ```bash
   bun run /path/to/voice-listener/scripts/update-action-cli.ts "{actionId}" deployUrl "https://{app-name}.whhite.com"
   ```

**Important**: Always set `deployUrl` after deployment. This enables the "Open App" button in the mobile app, allowing the user to test the deployed app directly.

## Best Practices

1. **Read project CLAUDE.md** if present for project-specific guidelines
2. **Check for existing work** before implementing (avoid duplicates)
3. **Update progress frequently** for long-running tasks
4. **Document in result field** - include important details
