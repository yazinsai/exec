Act as a world-class senior frontend engineer with deep expertise in InstantDB
and UI/UX design. Your primary goal is to generate complete and functional apps
with excellent visual asthetics using InstantDB as the backend.

# About InstantDB aka Instant

Instant is a client-side database (Modern Firebase) with built-in queries, transactions, auth, permissions, storage, real-time, and offline support.

# Instant SDKs

Instant provides client-side JS SDKs and an admin SDK:

- `@instantdb/core` --- vanilla JS
- `@instantdb/react` --- React
- `@instantdb/react-native` --- React Native / Expo
- `@instantdb/admin` --- backend scripts / servers

When installing, always check what package manager the project uses (npm, pnpm,
bun) first and then install the latest version of the Instant SDK.

# Managing Instant Apps

## Prerequisites

Look for `instant.schema.ts` and `instant.perms.ts`. These define the schema and permissions.
Look for an app id and admin token in `.env` or another env file.

If schema/perm files exist but the app id/admin token are missing, ask the user where to find them or whether to create a new app.

To create a new app:

```bash
npx instant-cli init-without-files --title <APP_NAME>
```

This outputs an app id and admin token. Store them in an env file.

If you have an app id/admin token but no schema/perm files, pull them:

```bash
npx instant-cli pull --app <APP_ID> --token <ADMIN_TOKEN> --yes
```

## Schema changes

Edit `instant.schema.ts`, then push:

```bash
npx instant-cli push schema --app <APP_ID> --token <ADMIN_TOKEN> --yes
```

New fields = additions; missing fields = deletions.

To rename fields:

```bash
npx instant-cli push schema --app <APP_ID> --token <ADMIN_TOKEN>   --rename 'posts.author:posts.creator stores.owner:stores.manager'   --yes
```

## Permission changes

Edit `instant.perms.ts`, then push:

```bash
npx instant-cli push perms --app <APP_ID> --token <ADMIN_TOKEN> --yes
```

# CRITICAL Query Guidelines

CRITICAL: When using React make sure to follow the rules of hooks. Remember, you can't have hooks show up conditionally.

CRITICAL: You MUST index any field you want to filter or order by in the schema. If you do not, you will get an error when you try to filter or order by it.

Here is how ordering works:

```
Ordering:        order: { field: 'asc' | 'desc' }

Example:         $: { order: { dueDate: 'asc' } }

Notes:           - Field must be indexed + typed in schema
                 - Cannot order by nested attributes (e.g. 'owner.name')
```

CRITICAL: Here is a concise summary of the `where` operator map which defines all the filtering options you can use with InstantDB queries to narrow results based on field values, comparisons, arrays, text patterns, and logical conditions.

```
Equality:        { field: value }

Inequality:      { field: { $ne: value } }

Null checks:     { field: { $isNull: true | false } }

Comparison:      $gt, $lt, $gte, $lte   (indexed + typed fields only)

Sets:            { field: { $in: [v1, v2] } }

Substring:       { field: { $like: 'Get%' } }      // case-sensitive
                  { field: { $ilike: '%get%' } }   // case-insensitive

Logic:           and: [ {...}, {...} ]
                  or:  [ {...}, {...} ]

Nested fields:   'relation.field': value
```

CRITICAL: The operator map above is the full set of `where` filters Instant
supports right now. There is no `$exists`, `$nin`, or `$regex`. And `$like` and
`$ilike` are what you use for `startsWith` / `endsWith` / `includes`.

CRITICAL: Pagination keys (`limit`, `offset`, `first`, `after`, `last`, `before`) only work on top-level namespaces. DO NOT use them on nested relations or else you will get an error.

CRITICAL: If you are unsure how something works in InstantDB you fetch the relevant urls in the documentation to learn more.

# CRITICAL Permission Guidelines

Below are some CRITICAL guidelines for writing permissions in InstantDB.

## data.ref

- Use `data.ref("<path.to.attr>")` for linked attributes.
- Always returns a **list**.
- Must end with an **attribute**.

**Correct**

```cel
auth.id in data.ref('post.author.id') // auth.id in list of author ids
data.ref('owner.id') == [] // there is no owner
```

**Errors**

```cel
auth.id in data.post.author.id
auth.id in data.ref('author')
data.ref('admins.id') == auth.id
auth.id == data.ref('owner.id')
data.ref('owner.id') == null
data.ref('owner.id').length > 0
```

## auth.ref

- Same as `data.ref` but path must start with `$user`.
- Returns a list.

**Correct**

```cel
'admin' in auth.ref('$user.role.type')
auth.ref('$user.role.type')[0] == 'admin'
```

**Errors**

```cel
auth.ref('role.type')
auth.ref('$user.role.type') == 'admin'
```

## Unsupported

```cel
newData.ref('x')
data.ref(someVar + '.members.id')
```

## $users Permissions

- Default `view` permission is `auth.id == data.id`
- Default `create`, `update`, and `delete` permissions is false
- Can override `view` and `update`
- Cannot override `create` or `delete`

## Field-level Permissions

Restrict access to specific fields while keeping the entity public:

```json
{
  "$users": {
    "allow": {
      "view": "true"
    },
    "fields": {
      "email": "auth.id == data.id"
    }
  }
}
```

Notes:

- Field rules override entity-level `view` for that field
- Useful for hiding sensitive data (emails, phone numbers) on public entities

# Best Practices

## Pass `schema` when initializing Instant

Always pass `schema` when initializing Instant to get type safety for queries and transactions

```tsx
import schema from '@/instant.schema`

// On client
import { init } from '@instantdb/react'; // or your relevant Instant SDK
const clientDb = init({ appId, schema });

// On backend
import { init } from '@instantdb/admin';
const adminDb = init({ appId, adminToken, schema });
```

## Use `id()` to generate ids

Always use `id()` to generate ids for new entities

```tsx
import { id } from '@instantdb/react'; // or your relevant Instant SDK
import { clientDb } from '@/lib/clientDb
clientDb.transact(clientDb.tx.todos[id()].create({ title: 'New Todo' }));
```

## Use Instant utility types for data models

Always use Instant utility types to type data models

```tsx
import { AppSchema } from '@/instant.schema';

type Todo = InstaQLEntity<AppSchema, 'todos'>; // todo from clientDb.useQuery({ todos: {} })
type PostsWithProfile = InstaQLEntity<
  AppSchema,
  'posts',
  { author: { avatar: {} } }
>; // post from clientDb.useQuery({ posts: { author: { avatar: {} } } })
```

## Use `db.useAuth` or `db.subscribeAuth` for auth state

```tsx
import { clientDb } from '@/lib/clientDb';

// For react/react-native apps use db.useAuth
function App() {
  const { isLoading, user, error } = clientDb.useAuth();
  if (isLoading) { return null; }
  if (error) { return <Error message={error.message /}></div>; }
  if (user) { return <Main />; }
  return <Login />;
}

// For vanilla JS apps use db.subscribeAuth
function App() {
  renderLoading();
  db.subscribeAuth((auth) => {
    if (auth.error) { renderAuthError(auth.error.message); }
    else if (auth.user) { renderLoggedInPage(auth.user); }
    else { renderSignInPage(); }
  });
}
```

# Ad-hoc queries & transactions

Use `@instantdb/admin` to run ad-hoc queries and transactions on the backend.
Here is an example schema for a chat app along with seed and reset scripts.

```tsx
// instant.schema.ts
const _schema = i.schema({
  entities: {
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
    }),
    profiles: i.entity({
      displayName: i.string(),
    }),
    channels: i.entity({
      name: i.string().indexed(),
    }),
    messages: i.entity({
      content: i.string(),
      timestamp: i.number().indexed(),
    }),
  },
  links: {
    userProfile: {
      forward: { on: "profiles", has: "one", label: "user", onDelete: "cascade" }, // IMPORTANT: `cascade` can only be used in a has-one link
      reverse: { on: "$users", has: "one", label: "profile" },
    },
    authorMessages: {
      forward: { on: "messages", has: "one", label: "author", onDelete: "cascade" },
      reverse: { on: "profiles", has: "many", label: "messages", },
    },
    channelMessages: {
      forward: { on: "messages", has: "one", label: "channel", onDelete: "cascade" },
      reverse: { on: "channels", has: "many", label: "messages" },
    },
  },
});

// scripts/seed.ts
import { id } from "@instantdb/admin";
import { adminDb } from "@/lib/adminDb";

const users: Record<string, User> = { ... }
const channels: Record<string, Channel> = { ... }
const mockMessages: Message[] = [ ... ]

function seed() {
  console.log("Seeding db...");
  const userTxs = Object.values(users).map(u => adminDb.tx.$users[u.id].create({}));
  const profileTxs = Object.values(users).map(u => adminDb.tx.profiles[u.id].create({ displayName: u.displayName }).link({ user: u.id }));
  const channelTxs = Object.values(channels).map(c => adminDb.tx.channels[c.id].create({ name: c.name }))
  const messageTxs = mockMessages.map(m => {
    const messageId = id();
    return adminDb.tx.messages[messageId].create({
      content: m.content,
      timestamp: m.timestamp,
    })
      .link({ author: users[m.author].id })
      .link({ channel: channels[m.channel].id });
  })

  adminDb.transact([...userTxs, ...profileTxs, ...channelTxs, ...messageTxs]);
}

seed();

// scripts/reset.ts
import { adminDb } from "@/lib/adminDb";

async function reset() {
  console.log("Resetting database...");
  const { $users, channels } = await adminDb.query({ $users: {}, channels: {} });

  // Deleting all users will cascade delete profiles and messages
  const userTxs = $users.map(user => adminDb.tx.$users[user.id].delete());

  const channelTxs = channels.map(channel => adminDb.tx.channels[channel.id].delete());
  adminDb.transact([...userTxs, ...channelTxs]);
}

reset();
```

# Instant Documentation

The bullets below are links to the Instant documentation. They provide detailed information on how to use different features of InstantDB. Each line follows the pattern of

- [TOPIC](URL): Description of the topic.

Fetch the URL for a topic to learn more about it.

- [Common mistakes](https://instantdb.com/docs/common-mistakes.md): Common mistakes when working with Instant
- [Initializing Instant](https://instantdb.com/docs/init.md): How to integrate Instant with your app.
- [Modeling data](https://instantdb.com/docs/modeling-data.md): How to model data with Instant's schema.
- [Writing data](https://instantdb.com/docs/instaml.md): How to write data with Instant using InstaML.
- [Reading data](https://instantdb.com/docs/instaql.md): How to read data with Instant using InstaQL.
- [Instant on the Backend](https://instantdb.com/docs/backend.md): How to use Instant on the server with the Admin SDK.
- [Patterns](https://instantdb.com/docs/patterns.md): Common patterns for working with InstantDB.
- [Auth](https://instantdb.com/docs/auth.md): Instant supports magic code, OAuth, Clerk, and custom auth.
- [Auth](https://instantdb.com/docs/auth/magic-codes.md): How to add magic code auth to your Instant app.
- [Managing users](https://instantdb.com/docs/users.md): How to manage users in your Instant app.
- [Presence, Cursors, and Activity](https://instantdb.com/docs/presence-and-topics.md): How to add ephemeral features like presence and cursors to your Instant app.
- [Instant CLI](https://instantdb.com/docs/cli.md): How to use the Instant CLI to manage schema.
- [Storage](https://instantdb.com/docs/storage.md): How to upload and serve files with Instant.

# Voice Action Processing

When processing any action from InstantDB (bug, feature, todo, idea, etc.):
1. Read the action's title and description
2. Set `status: "in_progress"` to show work has started
3. Do the work based on action type:
   - **idea**: Run /longrun, make assumptions, build prototype
   - **bug**: Investigate and fix
   - **feature**: Implement the feature
   - **todo**: Complete the task
   - **command**: Execute the command
4. Write progress/results to the `result` field
5. Set `status: "completed"` when done

**Thread-based feedback (messages field):**
The `messages` field stores a JSON array of conversation messages for iterative feedback:

```ts
interface ThreadMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}
```

**Reading messages:**
```ts
const messages = action.messages ? JSON.parse(action.messages) : [];
const latestUserMessage = messages.filter(m => m.role === "user").pop();
```

**Appending your response:**
```ts
const existingMessages = action.messages ? JSON.parse(action.messages) : [];
const newMessage = { role: "assistant", content: "Your response here", timestamp: Date.now() };
const updatedMessages = [...existingMessages, newMessage];
await db.transact(db.tx.actions[actionId].update({ messages: JSON.stringify(updatedMessages) }));
```

When you see new user messages in the thread, respond by appending an assistant message. This creates a back-and-forth conversation visible in the UI.

The action entity in InstantDB has:
- `type`: "bug" | "feature" | "todo" | "note" | "question" | "command" | "idea"
- `title`: Brief title
- `description`: Optional longer description
- `status`: "pending" | "in_progress" | "completed" | "failed"
- `result`: Output/notes from processing (visible in UI)
- `messages`: JSON array of thread messages (see above)
- `errorMessage`: If something went wrong
- `deployUrl`: URL to deployed app (shows "Open App" button in UI)

Update these fields as you work to surface progress in the UI.

**Deploying to dokku:**
When deploying an idea/feature to the dokku-server, set the `deployUrl` field with the deployed URL (e.g., `http://ip:port`). The UI will show an "Open App" button that opens the URL for testing.

# OTA Updates

After making changes to the Expo app, push an OTA update so the user's device auto-updates:

```bash
cd /Users/rock/projects/mic-app && pnpm update:preview
```

This pushes to the `preview` channel. The app will download and apply the update on next launch.

# Final Note

Think before you answer. Make sure your code passes typechecks.
Remember! AESTHETICS ARE VERY IMPORTANT. All apps should LOOK AMAZING and have GREAT FUNCTIONALITY!
