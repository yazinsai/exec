# Willy — Autonomous AI Harness

An AI execution system that takes high-level directions, does the work autonomously, and gets better at understanding your preferences over time. Evolves from the existing voice-to-action system (Expo mobile app + InstantDB + Mac Mini executor).

---

## Core Philosophy

- **No categories**: The system figures out what type of work something is. No "CodeChange" vs "Project" vs "Research" — just describe what you want.
- **Voice-in, visual-out**: Push-to-talk voice input on the phone. Responses and progress shown visually in the app. No voice output.
- **Best guess + flag**: When the system can't reach you, it makes reasonable assumptions, marks them, and continues. You review in-context later.
- **Faceless tool**: No name, no personality, no anthropomorphization. It's a system, not a colleague.

---

## 1. Input & Interaction

### Voice Input
- **Push-to-talk** on the mobile app. Tap-hold to speak, release to send.
- **Transcription only** — speech to text, processed as text. No emotion/tone analysis.
- **Either outcome or intent**: "Build me a URL shortener" and "I need to share links that expire" are both valid. System asks clarifying questions if the direction is ambiguous.
- **Context from app state**: Whatever project is currently open in the app is the implied context. Voice input routes to that project. No project open = new work.

### Clarification Protocol
- System asks crucial questions **early** — before significant work begins.
- Questions surface in the app's project timeline as inline cards.
- If the user doesn't respond and the question is blocking: best guess + flag.

---

## 2. Execution Model

### Dynamic Agent Architecture
- **Simple tasks** (quick fix, lookup, single-file change): One agent handles everything end-to-end.
- **Complex projects** (multi-step, research + build + deploy): A lead agent owns the project and spawns specialist sub-agents on demand. Lead maintains context and coordinates.
- The system decides complexity based on scope analysis. No manual configuration.

### Error Handling
- **Deep self-diagnosis first**: Before escalating to the user, the agent invests significant effort in debugging — reading docs, searching for solutions, trying alternative approaches.
- Escalation only after genuine effort has been exhausted.
- For truly stuck situations: notify user with full context (what was tried, what failed, what it thinks the issue is).

### Pivots
- When the user changes direction mid-project: **clean restart with memory**.
- All learnings from the abandoned attempt (API choices, data models, what didn't work) are preserved.
- The abandoned code is discarded, not branched.

### Unknown Territory
- When the system encounters something it hasn't done before: **research first, then attempt**.
- Transparent about uncertainty: "I haven't worked with this before. Researching now."
- Invests in learning (reads docs, studies examples) before writing code.

### Completion Criteria
- **Deployed + auto-tested** = done.
- System deploys, runs browser tests against the live app, verifies core functionality.
- Marks complete only if tests pass. No user approval required for "done" status.
- User reviews later at their own pace.

---

## 3. Learning System

This is the core differentiator and the **first milestone** to implement.

### Episode Recording
- **Source**: User feedback moments only.
  - User corrects a decision ("I don't like this font")
  - User approves something ("yes, that's exactly right")
  - User rejects an approach ("don't use Tailwind for this")
- Not recorded: every agent decision, every file edit, every command. Only moments where the user expressed a preference or correction.
- Episodes are timestamped and associated with project context.

### Narrative Memory Store
- Episodes stored as raw narratives: "On project X (a landing page for a SaaS), user said 'I hate purple gradients, use earth tones instead' when reviewing the hero section."
- Includes: project type, what was being worked on, what the user said, what was changed as a result.

### Background Distillation
- Periodically (after project completion), the system synthesizes episodes into rules.
- Rules are scoped: "For marketing pages, prefer earth tones" vs "For dashboards, keep it minimal."
- Distilled rules are **invisible to the user** — they don't see a preferences panel or get asked to confirm rules.
- Rules **only surface when they conflict**: "Last time you wanted minimal for dashboards, but for the marketing site you wanted bold. Which approach for this project?"

### Cross-Project Knowledge Flow
- **Auto-classify with review**: System detects which learnings seem generalizable (e.g., "RapidAPI is good for unofficial APIs") and proposes promoting them to global knowledge.
- User confirms during the distillation process.
- **Scope rules**: Techniques, tool recommendations, design preferences = candidates for global. Credentials, project-specific configs = stay scoped.

### Design Learning (Primary Focus: Visual Design)
- First learning frontier: colors, fonts, spacing, component style.
- The stuff you notice immediately and have strong opinions about.
- Interaction design, information architecture, and brand voice come later.

---

## 4. Progress & Visibility

### Live Stream (Narrated)
- Real-time feed of what the agent is doing, shown in the mobile app.
- **Agent emits structured events**: `{ type: "milestone", label: "Installing dependencies" }`, `{ type: "file_write", path: "src/login.tsx" }`, `{ type: "deploy_start" }`.
- App renders these events as a formatted, readable stream. No second AI call for narration.
- Events are the protocol — the app's rendering logic determines how they look.

### Assumption Review
- Assumptions made during async work (best guess + flag) appear **inline in the project timeline**.
- Each assumption shows: what was decided, why, and what the alternatives were.
- User can approve (no action needed) or override (triggers a correction episode for learning).

### Activity Feed
- Main screen: most recently active projects float to top.
- Like a phone's recent apps. Temporal ordering, no manual categorization.
- Tap a project to see its timeline (stream of events, assumptions, decisions, completions).

---

## 5. Credential Vault

### Architecture
- **Shared pool with scoping**: Central credential store. One account per service, many projects within that account.
- When an agent needs Supabase: check if we already have an account. If yes, create a new project within it. If no, sign up.
- **Personal-only for v1**: Hardcoded to the user's payment method and email pattern. No multi-user abstraction.

### Service Reuse
- **One account, many projects**: For services that support multi-project (Supabase, Vercel, etc.), maintain a single account.
- Creates new projects/instances within the account as needed.
- Reduces signup friction and consolidates billing.

### Security
- **Global spending cap** ($250/month) is the only guardrail.
- No per-project budgets.
- No approval required before signing up for services (paid or free).
- Credential storage: encrypted at rest, scoped access (agents only see credentials relevant to their project + global services).

---

## 6. Browser Automation

**Robust browser automation is a core capability**, not a fallback.

- Agents can sign up for services, test deployed apps, interact with any web UI.
- Invest in reliability: handle CAPTCHAs, selector changes, bot detection.
- Use browser for: service signup, app testing, form submission, data extraction.
- Prefer APIs/CLIs when available, but browser is always available as the universal fallback.

---

## 7. Context-Aware Routing

When the user speaks while agents are working:

- **Spatial/visual context**: Whatever project is open in the app = implied context.
- If no project is open, treat as a new directive.
- System doesn't need to parse the voice input for project references — the app state is the routing signal.
- Multiple agents can be working concurrently on different projects. Voice input goes to the one currently in view.

---

## 8. Architecture

### Current System (What Exists)
- **Mobile app**: Expo/React Native, shows action cards, status updates
- **Data layer**: InstantDB for real-time sync
- **Executor**: Mac Mini, polls InstantDB for actions, runs Claude Code
- **Memory**: CLAUDE.md files, manual updates

### Evolution (What Changes)

Both the mobile app and the executor need significant rework.

#### Mobile App Changes
- Add push-to-talk voice input (audio capture → transcription service → text)
- Replace action cards with activity feed + live stream view
- Add in-project timeline with inline assumptions and events
- Add structured event rendering for the live stream
- Remove explicit action type selection (categories dissolved)

#### Executor Changes
- Replace single-agent execution with dynamic orchestration (lead + specialist sub-agents)
- Add the learning engine: episode recording, narrative memory store, background distillation
- Add credential vault with service reuse logic
- Add structured event emission protocol
- Add context-aware routing (receive project context from app, route to correct agent)
- Add robust browser automation layer
- Deep self-diagnosis for error recovery

#### Data Layer
- InstantDB remains as the real-time backbone
- New entities needed:
  - `episodes` — user feedback moments (narrative text, project ref, timestamp, context)
  - `rules` — distilled preferences (scope, content, source episodes, confidence)
  - `credentials` — service accounts (service name, account type, credentials encrypted, projects using it)
  - `events` — structured agent events (project ref, type, data, timestamp)
- Existing `actions` entity evolves: remove `type` field, add `stream` reference for live events

---

## 9. Implementation Roadmap

### Phase 1: Cross-Project Learning (First Milestone) — COMPLETE
The thing that makes this feel genuinely different.

1. ~~Define episode schema and storage in InstantDB~~ — Done. `episodes` and `rules` entities + `episodeAction` link + `episodesGenerated` field on actions. Schema and permissions pushed.
2. ~~Build episode recording~~ — Done. `episode-recorder.ts` polls for rated actions, calls Claude API to synthesize narrative episodes, stores in InstantDB. Runs as 4th worker process.
3. ~~Build the distillation engine~~ — Done. `distillation-engine.ts` batches 3+ undistilled episodes, calls Claude to synthesize scoped rules with confidence scores. Runs on 6h timer inside the episode recorder.
4. ~~Wire rules into the executor~~ — Done. `rule-selector.ts` queries active rules, filters by scope/confidence, `buildExecutionPrompt` (now async) injects "LEARNED PREFERENCES" section into execution prompt.
5. ~~Build conflict detection~~ — Done. Rule selector detects explicit conflicts and surfaces them in the prompt with a note asking Claude to check with the user. Conflicts feed back into the learning loop via the existing `awaiting_feedback` mechanism.

**Success metric**: The system makes a noticeably better decision on project N+1 because it learned from project N.

### Phase 2: Live Stream & Narrated Progress
1. Define the structured event protocol (event types, payload schemas)
2. Modify the executor/Claude Code wrapper to emit events
3. Build the stream renderer in the mobile app
4. Add activity feed as the new home screen
5. Build in-project timeline view with events, assumptions, decisions

### Phase 3: Voice Input
1. Add push-to-talk UI to the mobile app
2. Integrate transcription service (Whisper API or similar)
3. Wire transcription output into the existing action creation pipeline
4. Add context routing: use currently-open project as the target

### Phase 4: Dynamic Agent Orchestration — COMPLETE
1. ~~Build scope analyzer: assess complexity of incoming work~~ — Done. `scope-analyzer.ts` uses heuristic pattern matching (action type, description length, orchestration keywords, multi-phase patterns) to classify as "simple" or "complex". No LLM call.
2. ~~Build lead-agent + sub-agent spawning logic~~ — Done. Leverages Claude Code's built-in Task tool / TeamCreate. `orchestration-complex.md` prompt instructs the lead agent to plan in phases, spawn sub-agents (max 3 concurrent), and review output before proceeding.
3. ~~Implement handoff protocol between agents (context passing, result aggregation)~~ — Done. `orchestration-simple.md` includes self-correction fallback (escalate to sub-agents if complexity discovered mid-task). Complex mode uses 4-phase workflow: Planning → Research → Execution → Integration.
4. ~~Add deep self-diagnosis for error recovery before escalation~~ — Done. `error-recovery.md` defines a 5-level escalation ladder (immediate fix → investigation → research → alternative approach → structured escalation). Injected into ALL action prompts.

### Phase 5: Credential Vault
1. Build encrypted credential store
2. Add service lookup logic (do we already have an account for X?)
3. Integrate with browser automation for autonomous service signup
4. Add per-project credential scoping

### Phase 6: Browser Automation Hardening — COMPLETE
1. ~~Upgrade browser automation reliability (anti-detection, CAPTCHA handling)~~ — Done. Prompt-driven approach: Claude Code uses `/dev-browser` skill during execution. No separate worker needed.
2. ~~Add self-testing: after deploy, agent browses the live app and verifies functionality~~ — Done. `browser-testing.md` prompt injected for Project and CodeChange actions. Full E2E testing: health check, functional testing of all described features, evidence collection via screenshots, fix-retest loop.
3. ~~Integrate with completion criteria (deployed + auto-tested = done)~~ — Done. Actions with deployments only marked complete after browser tests pass. Orchestration complex mode explicitly gates completion on browser testing.

---

## 10. Key Design Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Direction style | Either outcome or intent | AI asks to clarify if ambiguous |
| Voice model | Push-to-talk, transcription only | Explicit activation, no false triggers |
| Voice output | None — visual only | Faster, less annoying, user controls pace |
| Context routing | App state = context | Simple, no NLP needed for routing |
| Action categories | Dissolved | AI figures it out, less friction |
| Agent model | Dynamic (single vs lead+specialists) | Matches complexity to resources |
| Error handling | Deep self-diagnosis first | Reduces unnecessary user interruptions |
| Async decisions | Best guess + flag | Work continues, user reviews later |
| Assumption review | In-project timeline | Context-preserving, not a separate inbox |
| Memory model | Narrative episodes → distilled rules | Rich capture, fast retrieval |
| Episode source | User feedback moments only | High signal, low noise |
| Distillation visibility | Invisible until conflict | Minimal cognitive load |
| Learning scope | Auto-classify with review | Balance between automation and control |
| Design focus | Visual design first | Highest-signal, most opinionated domain |
| Credential model | Shared pool, one account per service | Reduces friction, consolidates billing |
| Security | Global $250/month cap | Trust the system within bounds |
| Progress view | Live stream, structured events | Real-time visibility, no extra AI cost |
| Project organization | Activity feed (recency) | Simple, temporal, no manual categorization |
| Completion | Deployed + auto-tested | Autonomous quality gate |
| Pivots | Clean restart with memory | Preserve learnings, discard code |
| Unknown territory | Research then attempt | Invest in learning before acting |
| Starting point | Evolve existing system | Both app and executor need significant rework |
| Audience | Developers first | They'll tolerate rough edges, validate the concept |
| Naming | Faceless tool | No personality, just capability |
| First milestone | Cross-project learning | The "it's getting smarter" moment |
