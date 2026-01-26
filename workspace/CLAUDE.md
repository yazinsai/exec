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
  3. Reproduce the bug if possible
  4. Identify root cause
  5. Implement fix within the project
  6. Test the fix
  7. Document the fix in `result` field
- **Notes**: The project must already exist in `workspace/projects/`.

### `feature`
- **Goal**: Implement the requested feature in an existing project
- **Process**:
  1. **Locate the project**: Find the project directory in `workspace/projects/` (check `projectPath` field or match by name)
  2. **Navigate to project**: Change to the project directory
  3. Understand requirements from title/description
  4. Design the implementation approach
  5. Implement the feature within the project
  6. Test thoroughly
  7. Document implementation in `result` field
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
  4. **Documentation**:
     - Update `result` field with research summary, services identified, and plan
     - If deployed, set `deployUrl`
- **Notes**: Ideas create NEW projects in `workspace/projects/`. This is the only action type that creates new projects.

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

## Best Practices

1. **Always read project CLAUDE.md** if present in workspace for project-specific guidelines
2. **Keep projects organized** - use subdirectories for different projects
3. **Update progress frequently** - especially for long-running ideas
4. **Document in result field** - include important details in the action's `result` field
5. **Deploy when appropriate** - set `deployUrl` for deployed prototypes/apps
