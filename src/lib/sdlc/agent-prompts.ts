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
 * Appended to every IMPLEMENTATION_STEP system prompt to enforce test file standards.
 *
 * This prevents the most common pipeline failure: generated test files that use
 * `vi.fn()` / `vi.mock()` without importing `vi` from 'vitest', causing a
 * ReferenceError before any test runs.
 */
const IMPLEMENTATION_PROMPT_SUFFIX = `

---

## MANDATORY TEST FILE RULES (non-negotiable)

Every test file you generate MUST begin with this exact import line:
\`\`\`typescript
import { describe, it, expect, vi } from 'vitest';
\`\`\`

Additional rules:
- **Never** use \`jest.*\` — this project uses **Vitest only**
- **Never** rely on globally-available \`vi\`, \`describe\`, \`it\`, \`expect\` without importing them
- **Always** import every Vitest utility you use: \`vi\`, \`beforeEach\`, \`afterEach\`, \`beforeAll\`, \`afterAll\`, \`Mock\`, \`MockedFunction\`
- Mock modules with \`vi.mock('module-path')\` — NOT \`jest.mock()\`
- Use \`vi.fn()\` for mock functions — NOT \`jest.fn()\`
- Place all test imports at the very TOP of the file, before any other code

Failure to follow these rules causes ReferenceError at runtime and wastes all retry budget.`;

/**
 * Returns the system prompt for a given ECC agent ID.
 * Falls back to a generic engineering prompt if the ID is unknown.
 */
export function getAgentSystemPrompt(agentId: string): string {
  return PROMPT_MAP.get(agentId) ?? FALLBACK_PROMPT;
}

/**
 * Returns the system prompt for an IMPLEMENTATION_STEP (codegen, developer, etc.).
 * Appends mandatory test file rules to prevent missing vitest imports.
 */
export function getImplementationSystemPrompt(agentId: string): string {
  return getAgentSystemPrompt(agentId) + IMPLEMENTATION_PROMPT_SUFFIX;
}

/**
 * Returns all known agent IDs that have system prompts.
 */
export function getKnownAgentIds(): string[] {
  return Array.from(PROMPT_MAP.keys());
}
