/**
 * Canonical list of agent categories used across the marketplace,
 * agent PATCH validation, and discover API.
 *
 * Add new categories here — they propagate to all consumers automatically.
 */
export const AGENT_CATEGORIES = [
  "assistant",
  "research",
  "writing",
  "coding",
  "design",
  "marketing",
  "support",
  "data",
  "education",
  "productivity",
  "specialized",
] as const;

export type AgentCategory = (typeof AGENT_CATEGORIES)[number];
