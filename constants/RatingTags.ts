/**
 * Quick issue tags for rating actions
 * These help categorize common problems for analysis
 */

export interface RatingTag {
  id: string;
  label: string;
  description: string;
}

export const RATING_TAGS: RatingTag[] = [
  {
    id: "wrong-approach",
    label: "Wrong Approach",
    description: "Took the wrong technical approach to solve the problem",
  },
  {
    id: "incomplete",
    label: "Incomplete",
    description: "Solution is partially done but missing key parts",
  },
  {
    id: "over-engineered",
    label: "Over-Engineered",
    description: "Solution is more complex than necessary",
  },
  {
    id: "missing-context",
    label: "Missing Context",
    description: "Didn't understand the codebase or requirements",
  },
  {
    id: "wrong-files",
    label: "Wrong Files",
    description: "Modified the wrong files or missed important ones",
  },
  {
    id: "syntax-errors",
    label: "Syntax Errors",
    description: "Code has syntax errors or doesn't compile",
  },
  {
    id: "test-failures",
    label: "Test Failures",
    description: "Tests fail or weren't run",
  },
  {
    id: "perfect",
    label: "Perfect",
    description: "Exactly what was needed",
  },
];

export const RATING_TAG_MAP = RATING_TAGS.reduce(
  (acc, tag) => {
    acc[tag.id] = tag;
    return acc;
  },
  {} as Record<string, RatingTag>
);
