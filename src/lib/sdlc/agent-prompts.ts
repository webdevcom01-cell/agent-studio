/**
 * Agent system prompt loader for SDLC pipeline steps.
 *
 * Reads system prompts from the ECC agent templates JSON file.
 * Returns a sensible fallback if the agent ID is not found.
 *
 * This module is intentionally kept lightweight — it only does a JSON
 * lookup, no async I/O, so it can be called synchronously per step.
 */

import eccTemplates from "@/data/ecc-agent-templates.json";

interface EccTemplate {
  id: string;
  name: string;
  systemPrompt?: string;
}

interface EccTemplatesFile {
  templates: EccTemplate[];
}

const templates = (eccTemplates as EccTemplatesFile).templates;

// Build a lookup map on first import
const PROMPT_MAP = new Map<string, string>(
  templates
    .filter((t) => typeof t.systemPrompt === "string" && t.systemPrompt.length > 0)
    .map((t) => [t.id, t.systemPrompt as string]),
);

const FALLBACK_PROMPT =
  "You are an expert software engineering agent. Analyze the task and provide a thorough, actionable response based on the context provided. Be specific, reference file paths where relevant, and prioritize practical recommendations.";

/**
 * Returns the system prompt for a given ECC agent ID.
 * Falls back to a generic engineering prompt if the ID is unknown.
 */
export function getAgentSystemPrompt(agentId: string): string {
  return PROMPT_MAP.get(agentId) ?? FALLBACK_PROMPT;
}

/**
 * Returns all known agent IDs that have system prompts.
 */
export function getKnownAgentIds(): string[] {
  return Array.from(PROMPT_MAP.keys());
}
