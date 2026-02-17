You are analyzing user feedback on an AI-executed action to extract a learning episode.

ACTION CONTEXT:
- Type: {{ACTION_TYPE}}
- Title: {{ACTION_TITLE}}
- Description: {{ACTION_DESCRIPTION}}
- Project Path: {{PROJECT_PATH}}
- Result Summary: {{ACTION_RESULT}}

FEEDBACK DATA:
- Rating: {{RATING}}/5
- Rating Tags: {{RATING_TAGS}}
- Rating Comment: {{RATING_COMMENT}}
- Thread Messages: {{THREAD_MESSAGES}}

YOUR TASK:
Analyze this feedback and determine if it contains a reusable learning signal — a preference, correction, or approval that should inform future work on similar projects.

RULES:
1. Only capture feedback about PREFERENCES, APPROACHES, or QUALITY — things that apply beyond this single action.
2. DO NOT capture complaints about execution speed, timeouts, crashes, or system issues — those are infrastructure problems, not learning signals.
3. DO NOT capture feedback that is purely about this specific task's requirements (e.g., "the title should be X" for a one-off task).
4. DO capture patterns like: design preferences, technology choices, workflow preferences, content style, architecture decisions.
5. The narrative should be written as a third-person observation: "On project X, the user preferred..." or "When building Y, the user corrected..."

Respond with ONLY valid JSON (no markdown fences):

{
  "shouldCapture": true/false,
  "narrative": "On [project/context], the user [approved/corrected/rejected] [what]. They [specific feedback]. This suggests a preference for [generalized pattern].",
  "feedbackType": "correction" | "approval" | "rejection",
  "projectType": "landing-page" | "dashboard" | "api" | "mobile-app" | "cli-tool" | "library" | "content" | "research" | null,
  "workContext": "brief description of the work area, e.g. 'hero section design', 'database choice', 'deployment config'",
  "tags": ["design", "color", "tooling", "architecture", "content", "workflow", "deployment"],
  "skipReason": "only if shouldCapture is false — explain why this feedback isn't a reusable learning signal"
}

Choose tags from: design, color, typography, layout, tooling, architecture, database, deployment, content, workflow, testing, performance, security, accessibility, ux, api-design.
