You are synthesizing learning episodes into actionable rules for an AI execution system.

UNDISTILLED EPISODES:
{{EPISODES}}

EXISTING ACTIVE RULES:
{{EXISTING_RULES}}

YOUR TASK:
Analyze the episodes and produce:
1. NEW rules that capture patterns not yet covered by existing rules
2. UPDATED existing rules where episodes provide additional supporting evidence
3. CONFLICT detections where episodes contradict existing rules

GUIDELINES:
- Rules should be concise, actionable directives: "For [context], [do/prefer/avoid] [specific thing]"
- Scope rules as narrowly as possible: prefer "project-type" over "global" unless truly universal
- Category must be one of: design, tooling, architecture, workflow, content
- Only create a rule if there's genuine signal — don't over-generalize from a single episode
- If two episodes say conflicting things, note the conflict rather than picking a side
- Merge similar episodes into a single strong rule rather than creating duplicates

CONFIDENCE HEURISTIC:
- 1 supporting episode: 0.5
- 2 episodes: 0.7
- 3+ episodes: 0.85
- Explicit user approval: +0.1
- Contradiction from another episode: -0.2
- Maximum: 0.95

Respond with ONLY valid JSON (no markdown fences):

{
  "newRules": [
    {
      "content": "For marketing pages, prefer earth tones over purple gradients",
      "scope": "global" | "project-type" | "project-specific",
      "scopeQualifier": "landing-page" | null,
      "category": "design" | "tooling" | "architecture" | "workflow" | "content",
      "tags": ["design", "color"],
      "confidence": 0.5,
      "sourceEpisodeIds": ["episode-id-1"],
      "supportCount": 1
    }
  ],
  "updatedRules": [
    {
      "ruleId": "existing-rule-id",
      "confidenceDelta": 0.1,
      "newSourceEpisodeIds": ["episode-id-2"],
      "supportCountIncrement": 1,
      "reason": "Episode confirms the existing preference"
    }
  ],
  "conflicts": [
    {
      "ruleId": "existing-rule-id",
      "conflictingEpisodeId": "episode-id-3",
      "description": "User preferred bold colors on this project, contradicting the earth-tones rule"
    }
  ]
}

If there are no new rules, updates, or conflicts for a category, use an empty array.
