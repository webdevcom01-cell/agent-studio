/**
 * code-review-handler.ts
 *
 * Node type: `code_review`
 *
 * Performs an AI-powered code review on generated files using the CodeReviewOutput
 * schema. Designed to sit between process_runner (tests) and human_approval in the
 * Autonomous Pipeline flow.
 *
 * Node data fields:
 *   model           — AI model ID (default: deepseek-chat)
 *   filesVariable   — variable name holding CodeGenOutput or file list (default: "generatedCode")
 *   testResultVar   — variable name holding test results string (default: "testResults")
 *   outputVariable  — where to store CodeReviewOutput (default: "reviewResult")
 *   maxIssues       — max issues to return (default: 20)
 *   nextNodeId      — next node on APPROVE / APPROVE_WITH_NOTES
 *   blockNodeId     — next node on BLOCK (routes into fix loop)
 *
 * Flat output variables (for condition node compatibility — no dot-path support):
 *   reviewDecision       — "APPROVE" | "APPROVE_WITH_NOTES" | "BLOCK"
 *   reviewBlocking       — true when decision == "BLOCK"
 *   reviewCompositeScore — 0–100 numeric score
 *   reviewSummary        — short summary string
 *   reviewFixInstructions — fix instructions when BLOCK, empty string otherwise
 */

import { generateObject } from "ai";
import { getModel } from "@/lib/ai";
import { logger } from "@/lib/logger";
import { CodeReviewOutputSchema } from "@/lib/sdlc/schemas";
import type { NodeHandler } from "../types";
import type { CodeGenOutput } from "@/lib/sdlc/schemas";

// System prompt for the code reviewer
const REVIEW_SYSTEM_PROMPT = `You are a senior software engineer performing a code review.
Your role is to ensure that generated code is:
1. Secure — no injection vulnerabilities, no hardcoded secrets, no unsafe operations
2. Correct — follows TypeScript strict mode, no 'any', proper null handling
3. Conventional — follows project rules (Tailwind only, no inline styles, Radix UI, Sonner toasts, SWR for data fetching)
4. Performant — no N+1 queries, no unnecessary re-renders, no unbounded operations

Project-specific rules to enforce:
- Import from '@/generated/prisma', never from '@prisma/client'
- Use logger from '@/lib/logger', never console.log
- API routes must return { success: true, data: T } or { success: false, error: string }
- Use requireAuth() / requireAgentOwner() from '@/lib/api/auth-guard', never raw auth()
- No 'any' type anywhere
- All node handlers must have try/catch and return graceful fallback, never throw
- Next.js 15: params must be awaited (Promise<{ id: string }>)

Be precise, actionable, and concise. Only flag real issues — do not invent problems.
For BLOCK decisions, always provide fixInstructions that the fix loop can act on directly.`;

export const codeReviewHandler: NodeHandler = async (node, context) => {
  const modelId = (node.data.model as string) || "deepseek-chat";
  const filesVariable = (node.data.filesVariable as string) || "generatedCode";
  const testResultVar = (node.data.testResultVar as string) || "testResults";
  const outputVariable = (node.data.outputVariable as string) || "reviewResult";
  const maxIssues = Number(node.data.maxIssues) || 20;
  const nextNodeId = (node.data.nextNodeId as string) ?? null;
  const blockNodeId = (node.data.blockNodeId as string) ?? null;

  try {
    // ── Extract files to review ───────────────────────────────────────────────
    const rawFiles = context.variables[filesVariable];
    const testResults = String(context.variables[testResultVar] ?? "No test results available.");

    let filesMarkdown = "";

    if (rawFiles && typeof rawFiles === "object") {
      // CodeGenOutput shape: { files: [{ path, content, language }] }
      const codeGenOutput = rawFiles as Partial<CodeGenOutput>;
      if (Array.isArray(codeGenOutput.files)) {
        filesMarkdown = codeGenOutput.files
          .map(
            (f) =>
              `### ${f.path}\n\`\`\`${f.language ?? "typescript"}\n${f.content}\n\`\`\``
          )
          .join("\n\n");
      } else {
        filesMarkdown = `\`\`\`\n${JSON.stringify(rawFiles, null, 2)}\n\`\`\``;
      }
    } else if (typeof rawFiles === "string") {
      filesMarkdown = rawFiles;
    } else {
      logger.warn("code-review-handler: no files found in variable", {
        nodeId: node.id,
        filesVariable,
        type: typeof rawFiles,
      });
      filesMarkdown = "(no files provided)";
    }

    // ── Build review prompt ───────────────────────────────────────────────────
    const userPrompt = `Please review the following generated code.

## Generated Files

${filesMarkdown}

## Test Results

\`\`\`
${testResults}
\`\`\`

Return a CodeReviewOutput with:
- A clear decision (APPROVE / APPROVE_WITH_NOTES / BLOCK)
- Up to ${maxIssues} specific issues with file path, severity, category, and concrete fix
- Separate blockingIssues array (only issues that MUST be fixed)
- If BLOCK: precise fixInstructions for an automated fix loop to resolve all blocking issues`;

    logger.info("code-review-handler: starting review", {
      nodeId: node.id,
      agentId: context.agentId,
      modelId,
      filesVariable,
    });

    // ── Call AI with structured output ────────────────────────────────────────
    const model = getModel(modelId);
    const { object: reviewResult } = await generateObject({
      model,
      schema: CodeReviewOutputSchema,
      system: REVIEW_SYSTEM_PROMPT,
      prompt: userPrompt,
    });

    logger.info("code-review-handler: review completed", {
      nodeId: node.id,
      agentId: context.agentId,
      decision: reviewResult.decision,
      compositeScore: reviewResult.compositeScore,
      issueCount: reviewResult.issues.length,
      blockingCount: reviewResult.blockingIssues.length,
    });

    // ── Route based on decision ───────────────────────────────────────────────
    const isBlocked = reviewResult.decision === "BLOCK";
    const resolvedNextNodeId = isBlocked ? (blockNodeId ?? nextNodeId) : nextNodeId;

    // Build human-readable summary message
    const decisionEmoji =
      reviewResult.decision === "APPROVE"
        ? "✅"
        : reviewResult.decision === "APPROVE_WITH_NOTES"
          ? "⚠️"
          : "🚫";

    const summaryLines = [
      `${decisionEmoji} **Code Review: ${reviewResult.decision}** (score: ${reviewResult.compositeScore}/100)`,
      `Security: ${reviewResult.securityScore}/100 | Quality: ${reviewResult.qualityScore}/100 | Convention: ${reviewResult.conventionScore}/100`,
      "",
      reviewResult.summary,
    ];

    if (reviewResult.issues.length > 0) {
      summaryLines.push("", `**Issues found (${reviewResult.issues.length}):**`);
      for (const issue of reviewResult.issues.slice(0, 5)) {
        summaryLines.push(`- [${issue.severity}] ${issue.file}: ${issue.message}`);
      }
      if (reviewResult.issues.length > 5) {
        summaryLines.push(`  ... and ${reviewResult.issues.length - 5} more`);
      }
    }

    if (isBlocked && reviewResult.fixInstructions) {
      summaryLines.push("", `**Fix instructions:**`, reviewResult.fixInstructions);
    }

    return {
      messages: [{ role: "assistant", content: summaryLines.join("\n") }],
      nextNodeId: resolvedNextNodeId,
      waitForInput: false,
      updatedVariables: {
        // Full structured result for downstream nodes
        [outputVariable]: reviewResult,
        // Flat variables for condition node (no dot-path support)
        reviewDecision: reviewResult.decision,
        reviewBlocking: isBlocked,
        reviewCompositeScore: reviewResult.compositeScore,
        reviewSummary: reviewResult.summary,
        reviewFixInstructions: reviewResult.fixInstructions ?? "",
      },
    };
  } catch (error) {
    logger.error("code-review-handler error", { nodeId: node.id, error });
    return {
      messages: [
        {
          role: "assistant",
          content:
            "Code review encountered an error. Proceeding to human approval for manual review.",
        },
      ],
      nextNodeId,
      waitForInput: false,
      updatedVariables: {
        [outputVariable]: null,
        reviewDecision: "APPROVE_WITH_NOTES",
        reviewBlocking: false,
        reviewCompositeScore: 0,
        reviewSummary: "Automated review failed — manual review required.",
        reviewFixInstructions: "",
      },
    };
  }
};
