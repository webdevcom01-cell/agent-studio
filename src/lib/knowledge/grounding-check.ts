/**
 * Check Grounding — post-generation factual verification
 *
 * Inspired by Google's "Check Grounding API" from Vertex AI RAG stack.
 * After the agent generates a response, this module verifies each claim
 * against the retrieved KB chunks to detect hallucination.
 *
 * Usage:
 *   Fire-and-forget in streaming handler (never blocks the response stream):
 *   ```ts
 *   checkGrounding(agentResponse, retrievedChunks)
 *     .then(result => logGroundingScore(result))
 *     .catch(() => {}); // graceful — never fail the user response
 *   ```
 *
 * Score interpretation:
 *   ≥ 0.8  → well-grounded (safe to show to user)
 *   0.5–0.8 → partial grounding (some claims may be unsupported)
 *   < 0.5  → low grounding (potential hallucination — log for review)
 */

import { generateObject } from "ai";
import { z } from "zod";
import { getModel, DEFAULT_MODEL } from "@/lib/ai";
import { logger } from "@/lib/logger";
import type { SearchResult } from "./search";

// ─── Schemas ─────────────────────────────────────────────────────────────────

const GroundingClaimSchema = z.object({
  claim: z.string().describe("A single factual assertion extracted from the response"),
  supported: z.boolean().describe("Whether this claim is supported by the provided sources"),
  sourceIndex: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("1-based index of the source that supports this claim, if any"),
});

const GroundingResultSchema = z.object({
  overallScore: z
    .number()
    .min(0)
    .max(1)
    .describe("Fraction of claims supported by sources (0.0 = none, 1.0 = all)"),
  claims: z.array(GroundingClaimSchema),
});

export type GroundingResult = z.infer<typeof GroundingResultSchema>;

// ─── System prompt ────────────────────────────────────────────────────────────

const GROUNDING_SYSTEM = `You are a factual grounding verifier. Given an AI-generated response and a set of source documents, identify each factual claim in the response and verify whether it is supported by the sources.

Rules:
- Extract ONLY factual claims (not opinions, greetings, or hedges).
- A claim is "supported" only if it is directly stated or can be logically inferred from the sources.
- Do NOT use your training knowledge — judge only based on the provided sources.
- overallScore = (number of supported claims) / (total claims). If no claims, score = 1.0.`;

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Verifies whether an agent's response is grounded in the retrieved KB chunks.
 *
 * @param agentResponse  - The full text of the agent's response
 * @param retrievedChunks - KB chunks that were injected as context
 * @returns GroundingResult with overallScore and per-claim analysis
 */
export async function checkGrounding(
  agentResponse: string,
  retrievedChunks: SearchResult[],
): Promise<GroundingResult> {
  // No context → nothing to check; score 1 (not 0 — we simply can't verify)
  if (retrievedChunks.length === 0) {
    return { overallScore: 1, claims: [] };
  }

  if (!agentResponse.trim()) {
    return { overallScore: 1, claims: [] };
  }

  const sources = retrievedChunks
    .slice(0, 5) // top 5 most relevant chunks
    .map((c, i) => `[${i + 1}] ${c.content.slice(0, 300)}`)
    .join("\n\n");

  const userPrompt = `## Agent Response
${agentResponse.slice(0, 1000)}

## Sources
${sources}

Verify the grounding of the agent's response against the sources above.`;

  try {
    const { object } = await generateObject({
      model: getModel(DEFAULT_MODEL),
      schema: GroundingResultSchema,
      system: GROUNDING_SYSTEM,
      prompt: userPrompt,
      maxOutputTokens: 400,
    });

    return object;
  } catch (err) {
    logger.warn("Grounding check failed, skipping", {
      error: err instanceof Error ? err.message : String(err),
    });
    // Graceful fallback — never block the user response
    return { overallScore: 1, claims: [] };
  }
}
