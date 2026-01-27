# Workspace Guidelines

This workspace is used by the voice-to-action system. Claude Code executes actions in `workspace/projects/`.

## Working Directory

- **Projects**: `workspace/projects/` - Contains existing projects that Claude will work on. Each project should already exist as a subdirectory here.

**Important**: For bugs, features, and todos, the target project must already exist in `workspace/projects/`. Navigate to the appropriate project directory before making changes. Only `idea` type actions create new projects.

## Action Type Handling

### `bug`
- **Goal**: Investigate and fix the reported issue in an existing project
- **Process**:
  1. **Locate the project**: Find the project directory in `workspace/projects/` (check `projectPath` field or match by name)
  2. **Navigate to project**: Change to the project directory
  3. **Check if already fixed**: Search the codebase to see if this bug was already fixed (check git history, existing code)
  4. Reproduce the bug if possible
  5. Identify root cause
  6. Implement fix within the project
  7. Test the fix
  8. Document the fix in `result` field
- **Notes**: The project must already exist in `workspace/projects/`.

### `feature`
- **Goal**: Implement the requested feature in an existing project
- **Process**:
  1. **Locate the project**: Find the project directory in `workspace/projects/` (check `projectPath` field or match by name)
  2. **Navigate to project**: Change to the project directory
  3. **Check if already implemented**: Search the codebase to see if this feature (or similar) already exists. Check existing components, functions, and git history to avoid duplicate work.
  4. Understand requirements from title/description
  5. Design the implementation approach
  6. Implement the feature within the project
  7. Test thoroughly
  8. Document implementation in `result` field
- **Notes**: The project must already exist in `workspace/projects/`.

### `todo`
- **Goal**: Complete the task (may be in a project or general)
- **Process**:
  1. **Locate context**: If task is project-specific, find the project in `workspace/projects/` and navigate there
  2. Understand what needs to be done
  3. Execute the task
  4. Verify completion
  5. Document completion in `result` field
- **Notes**: If project-specific, the project must exist in `workspace/projects/`.

### `question`
- **Goal**: Answer the question
- **Process**:
  1. Research the question if needed
  2. Provide comprehensive answer
  3. Update `result` field with the answer

### `command`
- **Goal**: Execute the command
- **Process**:
  1. Parse and understand the command
  2. Execute safely (verify it's safe first)
  3. Document execution and results in `result` field

### `idea`
- **Goal**: Research, plan, and build a new prototype project
- **Process**:
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
     - After deployment, obtain the URL from dokku output and **set `deployUrl`** in InstantDB
     - This enables the "Open App" button in the mobile app UI
  5. **Documentation**:
     - Update `result` field with research summary, services identified, and plan
     - If deployed, set `deployUrl`
- **Notes**: Ideas create NEW projects in `workspace/projects/`. This is the only action type that creates new projects.

### `post`
- **Goal**: Draft social media posts using Typefully
- **Process**:
  1. Run `/typefully` with the post content from the action's description
  2. Create drafts for **both LinkedIn AND Twitter** by default
  3. Store the draft links or confirmation in the `result` field
- **Notes**: The user can then review and schedule the drafts in Typefully.

## File Organization

### Projects (`workspace/projects/`)
- Contains existing projects that Claude will work on
- Each project has its own subdirectory
- Use descriptive names: `my-app/`, `api-server/`, `web-dashboard/`, etc.
- Projects should already exist before bugs/features/todos reference them
- Only `idea` type actions create new projects here

## Updating Actions

Always update the action in InstantDB as you work:

```typescript
import { db } from "../../voice-listener/src/db";

// Update progress
await db.transact(db.tx.actions["${actionId}"].update({
  result: "Description of progress...",
  deployUrl: "http://...", // if deployed
}));

// Append messages for thread-based feedback
const messages = existingMessages || [];
messages.push({ 
  role: "assistant", 
  content: "Your response", 
  timestamp: Date.now() 
});
await db.transact(db.tx.actions["${actionId}"].update({
  messages: JSON.stringify(messages),
}));
```

## Deploying to Dokku

When deploying web apps (especially for `idea` type actions):

1. **Domain**: Use `{app-name}.whhite.com` - DNS is pre-configured to point to `dokku-server`
2. **Create app**: `ssh dokku@dokku-server apps:create {app-name}`
3. **Add domain**: `ssh dokku@dokku-server domains:add {app-name} {app-name}.whhite.com`
4. **Deploy**: Push via git or use `dokku git:sync`
5. **Set deployUrl**: After successful deployment, update the action in InstantDB:
   ```typescript
   await db.transact(db.tx.actions["${actionId}"].update({
     deployUrl: "https://{app-name}.whhite.com",
   }));
   ```

**Important**: Always set `deployUrl` after deployment. This enables the "Open App" button in the mobile app, allowing the user to test the deployed app directly.

## Best Practices

1. **Always read project CLAUDE.md** if present in workspace for project-specific guidelines
2. **Check for existing implementations** - Before working on bugs/features, verify they haven't already been addressed
3. **Keep projects organized** - use subdirectories for different projects
4. **Update progress frequently** - especially for long-running ideas
5. **Document in result field** - include important details in the action's `result` field
6. **Deploy when appropriate** - set `deployUrl` for deployed prototypes/apps
