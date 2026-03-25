/**
 * Prompt builders for the AI Eval Suite Generator.
 *
 * Follows the system/user split pattern from the CLI Generator (Phase 3):
 *   system — stable expert persona + eval theory + JSON schema (cacheable)
 *   user   — dynamic: agent name, system prompt, category, KB samples
 *
 * This separation enables ~90% prompt caching cost reduction on repeated
 * calls with the same category/expert context.
 */

import { getCategoryStandard, getRequiredAssertions } from "./standards";

export interface GeneratorPromptParts {
  system: string;
  user: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatKBSamples(samples?: string[]): string {
  if (!samples || samples.length === 0) return "No KB content provided.";
  return samples
    .map((s, i) => `[KB Sample ${i + 1}]\n${s.trim()}`)
    .join("\n\n");
}

function formatRequiredAssertions(category?: string): string {
  const required = getRequiredAssertions(category);
  if (required.length === 0) return "- relevance (threshold: 0.70)\n- latency (threshold: 30000ms)";
  return required
    .map((a) => {
      const parts = [`- type: ${a.assertion.type}`];
      const details = a.assertion as Record<string, unknown>;
      if (typeof details["threshold"] === "number") {
        parts.push(`threshold: ${details["threshold"]}`);
      }
      if (typeof details["rubric"] === "string") {
        parts.push(`rubric: "${details["rubric"].slice(0, 80)}..."`);
      }
      parts.push(`(${a.rationale.slice(0, 60)}...)`);
      return parts.join(", ");
    })
    .join("\n");
}

function formatCategoryGuidance(category?: string): string {
  const standard = getCategoryStandard(category);
  const lines: string[] = [
    `Category: ${standard.displayName}`,
    `Description: ${standard.description}`,
    `Minimum test cases: ${standard.minTestCases}`,
    `Passing score threshold: ${standard.passingScore}`,
    "",
    "Suggested test labels for inspiration (do not copy verbatim — adapt to the agent):",
    ...standard.suggestedTestLabels.map((l) => `  - ${l}`),
  ];
  return lines.join("\n");
}

// ─── Main prompt builder ──────────────────────────────────────────────────────

/**
 * Build the system/user prompt pair for eval suite generation.
 *
 * @param agentName     - Name of the agent (for suite naming)
 * @param systemPrompt  - Agent's system prompt (main context source)
 * @param category      - Agent category (drives standard selection)
 * @param kbSamples     - Optional KB content snippets for RAG agents
 * @param targetCount   - Desired number of test cases (3–10)
 */
export function buildGeneratorPrompt(
  agentName: string,
  systemPrompt?: string,
  category?: string,
  kbSamples?: string[],
  targetCount: number = 5,
): GeneratorPromptParts {
  const hasKB = kbSamples && kbSamples.length > 0;
  const categoryStandard = getCategoryStandard(category);

  // ── System prompt (stable, cacheable) ──────────────────────────────────────
  const system = `You are an expert AI eval engineer specializing in LLM agent evaluation.
Your task is to generate comprehensive, high-quality eval test suites for AI agents.

## Eval Framework
You follow a 3-layer evaluation strategy:
  Layer 1 — Deterministic (contains, not_contains, regex, json_valid, latency)
  Layer 2 — Semantic similarity (semantic_similarity with embedding cosine distance)
  Layer 3 — LLM-as-Judge (llm_rubric, kb_faithfulness, relevance)

## Test Case Distribution
For ${targetCount} test cases, distribute as follows:
  - ~50% happy path: normal, expected usage patterns
  - ~30% edge cases: boundary conditions, ambiguous inputs, empty/missing data
  - ~20% adversarial: out-of-scope requests, hallucination probes, off-topic queries

## Assertion Quality Rules
1. Each test case MUST have at least 1 assertion
2. Each test case SHOULD have at most 4 assertions (prevent over-specification)
3. Layer 1 assertions (contains/not_contains) must use specific, unique strings — not generic words
4. Layer 3 rubrics must be specific evaluation criteria, not generic descriptions
5. semantic_similarity value must be the EXPECTED ideal response (not the input)
6. kb_faithfulness should only be used when the agent has a knowledge base
7. latency thresholds must be in milliseconds (e.g. 30000 for 30 seconds)
8. Always include a relevance assertion for at least one test case

## Output Format
You MUST output valid JSON matching this exact schema:
{
  "suiteName": "string (e.g. 'Auto-generated — [Agent Name]')",
  "suiteDescription": "string (1-2 sentences describing what this suite tests)",
  "testCases": [
    {
      "label": "string (format: 'Topic — LayerX type', e.g. 'FAQ query — L1 deterministic')",
      "input": "string (the exact user message to send to the agent)",
      "assertions": [...],
      "tags": ["happy-path"|"edge-case"|"adversarial", "l1"|"l2"|"l3", ...]
    }
  ]
}

## Label Format Convention
Labels MUST follow this format for clarity:
  "[Short description] — [Layer abbreviation]"
  Examples:
    "Product pricing query — L1 deterministic"
    "Feature comparison — L2 semantic"
    "Hallucination probe — L3 faithfulness"
    "Out-of-scope request — L3 rubric"`;

  // ── User prompt (dynamic per agent) ────────────────────────────────────────
  const user = `Generate an eval suite for the following AI agent.

## Agent Information
Name: ${agentName}
Category: ${categoryStandard.displayName}

## Agent System Prompt
${systemPrompt?.trim() || "(No system prompt provided — infer agent purpose from name and category)"}

## Category-Specific Standards
Apply these standards for the ${categoryStandard.displayName} category:
${formatCategoryGuidance(category)}

## Required Assertions (must appear in at least one test case each)
${formatRequiredAssertions(category)}

${hasKB ? `## Knowledge Base Content (for factual test cases)
Use these KB snippets to generate grounded factual test cases.
For test cases using this content, include a kb_faithfulness assertion (threshold: 0.80).

${formatKBSamples(kbSamples)}

` : ""}## Generation Instructions
1. Generate exactly ${targetCount} test cases
2. Make inputs realistic — they should look like real user messages to this agent
3. Make assertions specific to this agent's content, NOT generic placeholders
4. For contains/not_contains, use specific strings the agent's response should/should not include
5. For llm_rubric, write evaluation criteria specific to this agent's role
6. Suite name should be: "Auto-generated — ${agentName}"
7. Ensure at least one test case tests a happy path with a L1 contains assertion
8. Ensure at least one test case tests adversarial/edge behavior
${hasKB ? "9. Include at least one test case using KB content with kb_faithfulness assertion" : "9. Do NOT include kb_faithfulness assertions (this agent has no knowledge base)"}`;

  return { system, user };
}
