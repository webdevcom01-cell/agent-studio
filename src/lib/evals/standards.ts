/**
 * Agent Eval Standards — Platform-wide Quality Gates (2026)
 *
 * Single source of truth for eval assertion templates per agent category.
 * Based on industry standards from RAGAS, DeepEval, Braintrust, and Anthropic
 * engineering guidelines (2026).
 *
 * Architecture:
 *   GLOBAL_EVAL_STANDARDS  — mandatory baseline assertions for EVERY agent
 *   CATEGORY_EVAL_STANDARDS — per-category additional assertions and thresholds
 *   getCategoryStandard()  — merge helper (global + category specific)
 *   DEFAULT_EVAL_STANDARD  — fallback when category is unknown
 *
 * Threshold rationale (10th-percentile-of-human-approvals approach):
 *   - latency: 30 000 ms global ceiling (user experience SLA)
 *   - relevance: 0.70 global minimum (answer must address the question)
 *   - kb_faithfulness: 0.80 for RAG categories (hallucination guard)
 *   - semantic_similarity: 0.75 for content/accuracy categories
 *   - llm_rubric: 0.70 default, 0.75-0.80 for high-stakes categories
 */

import type { EvalAssertion } from "./schemas";

// ─── Assertion template helper types ──────────────────────────────────────────

export interface AssertionTemplate {
  /** The assertion to include in auto-generated suites */
  assertion: EvalAssertion;
  /** Human-readable reason this assertion is required for this category */
  rationale: string;
  /** If true, always included and cannot be removed by the user */
  required: boolean;
  /** Layer: 1 = deterministic, 2 = semantic, 3 = LLM-as-Judge */
  layer: 1 | 2 | 3;
}

export interface EvalCategoryStandard {
  /** Matches AGENT_CATEGORY_METADATA id */
  category: string;
  /** Human-readable display name */
  displayName: string;
  /** Why these standards apply to this category */
  description: string;
  /** Assertion templates specific to this category (merged with global) */
  assertions: AssertionTemplate[];
  /** Minimum recommended test cases for good coverage */
  minTestCases: number;
  /** Suite-level minimum passing score (0.0–1.0) */
  passingScore: number;
  /**
   * Recommended test case labels to seed AI generation.
   * Used as inspiration prompts by the AI eval generator (Sprint 2).
   */
  suggestedTestLabels: string[];
}

// ─── Global standards — applied to EVERY agent without exception ──────────────

export const GLOBAL_EVAL_ASSERTIONS: AssertionTemplate[] = [
  {
    assertion: { type: "latency", threshold: 30_000 },
    rationale:
      "Every agent must respond within 30 seconds — hard SLA for user experience.",
    required: true,
    layer: 1,
  },
  {
    assertion: { type: "relevance", threshold: 0.70 },
    rationale:
      "Agent must address the question asked. Catches completely off-topic responses.",
    required: true,
    layer: 3,
  },
];

// ─── Per-category standards ────────────────────────────────────────────────────

export const CATEGORY_EVAL_STANDARDS: Record<string, EvalCategoryStandard> = {

  // ── assistant ──────────────────────────────────────────────────────────────
  assistant: {
    category: "assistant",
    displayName: "Assistant",
    description:
      "General-purpose assistants must be helpful, on-topic, and complete tasks without hallucinating.",
    assertions: [
      {
        assertion: { type: "relevance", threshold: 0.75 },
        rationale: "Assistants are held to a higher relevance bar — they must precisely address user intent.",
        required: true,
        layer: 3,
      },
      {
        assertion: {
          type: "llm_rubric",
          rubric: "The response is helpful, clear, and fully addresses the user request without unnecessary filler.",
          threshold: 0.70,
        },
        rationale: "Helpfulness and clarity are the core quality dimensions for general assistants.",
        required: false,
        layer: 3,
      },
      {
        assertion: { type: "latency", threshold: 15_000 },
        rationale: "General assistants should be snappy — 15 s is the target for conversational feel.",
        required: false,
        layer: 1,
      },
    ],
    minTestCases: 5,
    passingScore: 0.75,
    suggestedTestLabels: [
      "Basic factual question",
      "Multi-step task with clear instructions",
      "Ambiguous query — graceful clarification",
      "Out-of-scope request — polite refusal",
      "Follow-up question referencing previous context",
    ],
  },

  // ── research ───────────────────────────────────────────────────────────────
  research: {
    category: "research",
    displayName: "Research",
    description:
      "Research agents must retrieve accurate, grounded information and avoid hallucinating facts.",
    assertions: [
      {
        assertion: { type: "kb_faithfulness", threshold: 0.80 },
        rationale:
          "Research agents with KB must not fabricate facts — faithfulness threshold 0.80 per industry standard.",
        required: true,
        layer: 3,
      },
      {
        assertion: { type: "relevance", threshold: 0.75 },
        rationale: "Research responses must directly answer the research question.",
        required: true,
        layer: 3,
      },
      {
        assertion: {
          type: "llm_rubric",
          rubric:
            "The response cites specific facts and sources. It does not make unsupported claims. The information is accurate and comprehensive.",
          threshold: 0.75,
        },
        rationale: "Factual accuracy and source grounding are critical for research quality.",
        required: false,
        layer: 3,
      },
    ],
    minTestCases: 8,
    passingScore: 0.80,
    suggestedTestLabels: [
      "Factual lookup from knowledge base",
      "Multi-source synthesis question",
      "Question with no answer in KB — should acknowledge gap",
      "Comparative analysis of two concepts",
      "Hallucination probe — asks for unverified claim",
      "Follow-up deep-dive on retrieved result",
      "Date-sensitive or time-bound query",
      "Complex multi-hop reasoning",
    ],
  },

  // ── writing ────────────────────────────────────────────────────────────────
  writing: {
    category: "writing",
    displayName: "Writing",
    description:
      "Writing agents must produce coherent, well-structured, on-topic content without common errors.",
    assertions: [
      {
        assertion: {
          type: "llm_rubric",
          rubric:
            "The writing is coherent, grammatically correct, and matches the requested tone and style. It fulfills the writing objective completely.",
          threshold: 0.75,
        },
        rationale: "Quality of writing output is the primary success criterion.",
        required: true,
        layer: 3,
      },
      {
        assertion: { type: "not_contains", value: "[INSERT" },
        rationale: "Uncompleted template placeholders indicate a broken output.",
        required: true,
        layer: 1,
      },
      {
        assertion: { type: "not_contains", value: "TODO" },
        rationale: "TODO markers in writing output indicate incomplete generation.",
        required: true,
        layer: 1,
      },
    ],
    minTestCases: 5,
    passingScore: 0.75,
    suggestedTestLabels: [
      "Short paragraph on a given topic",
      "Email draft with specific tone",
      "Title and summary generation",
      "Rewrite for clarity and brevity",
      "Content expansion from a brief outline",
    ],
  },

  // ── coding ─────────────────────────────────────────────────────────────────
  coding: {
    category: "coding",
    displayName: "Coding",
    description:
      "Coding agents must produce syntactically valid, correct, and well-explained code.",
    assertions: [
      {
        assertion: {
          type: "llm_rubric",
          rubric:
            "The code is syntactically correct, logically sound, and solves the stated problem. It includes appropriate comments or explanation.",
          threshold: 0.80,
        },
        rationale: "Code correctness is the highest priority — 0.80 threshold per engineering standard.",
        required: true,
        layer: 3,
      },
      {
        assertion: { type: "not_contains", value: "syntax error" },
        rationale: "Output must not acknowledge its own syntax errors.",
        required: true,
        layer: 1,
      },
      {
        assertion: { type: "latency", threshold: 20_000 },
        rationale: "Code generation should complete in 20 s — allows for complex multi-file outputs.",
        required: false,
        layer: 1,
      },
    ],
    minTestCases: 8,
    passingScore: 0.80,
    suggestedTestLabels: [
      "Simple function implementation",
      "Algorithm with edge cases",
      "API endpoint boilerplate",
      "Bug fix in provided snippet",
      "Code explanation and documentation",
      "Refactoring for clarity",
      "Unit test generation",
      "Database query (SQL)",
    ],
  },

  // ── design ─────────────────────────────────────────────────────────────────
  design: {
    category: "design",
    displayName: "Design",
    description:
      "Design agents must produce structured, actionable design guidance following established UI/UX principles.",
    assertions: [
      {
        assertion: {
          type: "llm_rubric",
          rubric:
            "The design output follows established UI/UX principles (accessibility, hierarchy, spacing, contrast). It is actionable and specific.",
          threshold: 0.70,
        },
        rationale: "Design quality and adherence to principles is the primary evaluation axis.",
        required: true,
        layer: 3,
      },
      {
        assertion: { type: "relevance", threshold: 0.75 },
        rationale: "Design advice must be specific to the requested design problem.",
        required: true,
        layer: 3,
      },
    ],
    minTestCases: 5,
    passingScore: 0.70,
    suggestedTestLabels: [
      "Layout recommendation for landing page",
      "Color palette suggestion with rationale",
      "Accessibility improvement for a given UI",
      "Component design for a form",
      "Design critique of a described interface",
    ],
  },

  // ── marketing ──────────────────────────────────────────────────────────────
  marketing: {
    category: "marketing",
    displayName: "Marketing",
    description:
      "Marketing agents must produce on-brand, compliant content that drives desired outcomes without restricted claims.",
    assertions: [
      {
        assertion: {
          type: "llm_rubric",
          rubric:
            "The marketing content is persuasive, on-brand, and actionable. It uses clear value propositions and appropriate call-to-action language.",
          threshold: 0.70,
        },
        rationale: "Marketing effectiveness is the primary quality dimension.",
        required: true,
        layer: 3,
      },
      {
        assertion: { type: "not_contains", value: "guaranteed results" },
        rationale: "Marketing must not make absolute guarantees — legal compliance requirement.",
        required: true,
        layer: 1,
      },
      {
        assertion: { type: "not_contains", value: "100% effective" },
        rationale: "Superlative claims without evidence create legal risk.",
        required: true,
        layer: 1,
      },
    ],
    minTestCases: 5,
    passingScore: 0.70,
    suggestedTestLabels: [
      "Ad copy for a product launch",
      "Email subject line options",
      "Social media post for engagement",
      "Landing page headline variations",
      "Campaign messaging framework",
    ],
  },

  // ── support ────────────────────────────────────────────────────────────────
  support: {
    category: "support",
    displayName: "Support",
    description:
      "Support agents must resolve customer issues accurately, empathetically, and quickly — with zero hallucinated policy claims.",
    assertions: [
      {
        assertion: { type: "kb_faithfulness", threshold: 0.80 },
        rationale:
          "Support agents must not invent policies or procedures not in the KB — hallucinations damage trust and cause compliance issues.",
        required: true,
        layer: 3,
      },
      {
        assertion: { type: "relevance", threshold: 0.75 },
        rationale: "Support responses must directly address the customer's issue.",
        required: true,
        layer: 3,
      },
      {
        assertion: {
          type: "llm_rubric",
          rubric:
            "The response is empathetic, professional, and resolves or clearly escalates the customer's issue. It does not make promises not supported by policy.",
          threshold: 0.75,
        },
        rationale: "Tone and resolution quality are critical for customer satisfaction.",
        required: true,
        layer: 3,
      },
      {
        assertion: { type: "latency", threshold: 10_000 },
        rationale: "Support SLA: 10 s maximum for customer-facing response time.",
        required: false,
        layer: 1,
      },
    ],
    minTestCases: 8,
    passingScore: 0.80,
    suggestedTestLabels: [
      "Common billing question",
      "Technical issue escalation",
      "Refund request handling",
      "Out-of-policy request — graceful decline",
      "Angry customer — de-escalation",
      "Password reset guidance",
      "Feature question from KB",
      "Multi-issue complaint",
    ],
  },

  // ── data ───────────────────────────────────────────────────────────────────
  data: {
    category: "data",
    displayName: "Data",
    description:
      "Data agents must produce accurate, structured outputs with correct analysis logic and valid SQL/JSON.",
    assertions: [
      {
        assertion: {
          type: "llm_rubric",
          rubric:
            "The data analysis is logically correct. Calculations, aggregations, and conclusions are accurate. The output is well-structured and interpretable.",
          threshold: 0.80,
        },
        rationale: "Analytical correctness is the highest priority — errors in data analysis are high-cost.",
        required: true,
        layer: 3,
      },
      {
        assertion: { type: "latency", threshold: 60_000 },
        rationale: "Data agents may run complex queries — 60 s is the acceptable ceiling.",
        required: true,
        layer: 1,
      },
      {
        assertion: { type: "relevance", threshold: 0.75 },
        rationale: "Data output must answer the analytical question asked.",
        required: true,
        layer: 3,
      },
    ],
    minTestCases: 8,
    passingScore: 0.80,
    suggestedTestLabels: [
      "Simple aggregation query",
      "Trend analysis from dataset",
      "Outlier detection question",
      "Comparative analysis (A vs B)",
      "Structured output — valid JSON",
      "Multi-step analytical reasoning",
      "Empty dataset edge case",
      "Statistical summary request",
    ],
  },

  // ── education ──────────────────────────────────────────────────────────────
  education: {
    category: "education",
    displayName: "Education",
    description:
      "Education agents must explain concepts clearly, accurately, and at the appropriate level for the learner.",
    assertions: [
      {
        assertion: {
          type: "llm_rubric",
          rubric:
            "The explanation is clear, accurate, and at the appropriate level. It uses examples or analogies to aid understanding. It does not oversimplify to the point of inaccuracy.",
          threshold: 0.75,
        },
        rationale: "Clarity and pedagogical quality are the primary dimensions for educational content.",
        required: true,
        layer: 3,
      },
      {
        assertion: { type: "relevance", threshold: 0.75 },
        rationale: "Educational content must directly address the learning objective.",
        required: true,
        layer: 3,
      },
    ],
    minTestCases: 5,
    passingScore: 0.75,
    suggestedTestLabels: [
      "Explain a concept to a beginner",
      "Advanced explanation for expert learner",
      "Quiz question generation",
      "Step-by-step tutorial task",
      "Common misconception clarification",
    ],
  },

  // ── productivity ───────────────────────────────────────────────────────────
  productivity: {
    category: "productivity",
    displayName: "Productivity",
    description:
      "Productivity agents must complete tasks efficiently, produce actionable outputs, and respond quickly.",
    assertions: [
      {
        assertion: { type: "latency", threshold: 10_000 },
        rationale:
          "Productivity agents are used in fast-paced workflows — 10 s latency is the target.",
        required: true,
        layer: 1,
      },
      {
        assertion: {
          type: "llm_rubric",
          rubric:
            "The output is actionable and complete. It directly helps the user accomplish their task. No unnecessary content or repetition.",
          threshold: 0.70,
        },
        rationale: "Task completion and actionability are the core value dimensions for productivity agents.",
        required: true,
        layer: 3,
      },
    ],
    minTestCases: 5,
    passingScore: 0.75,
    suggestedTestLabels: [
      "Task prioritization request",
      "Meeting agenda generation",
      "Email summarization",
      "Action item extraction from notes",
      "Workflow step recommendation",
    ],
  },

  // ── specialized ────────────────────────────────────────────────────────────
  specialized: {
    category: "specialized",
    displayName: "Specialized",
    description:
      "Domain-specific agents handle high-stakes information and must maintain strict faithfulness and accuracy.",
    assertions: [
      {
        assertion: { type: "kb_faithfulness", threshold: 0.85 },
        rationale:
          "Specialized agents in high-stakes domains (medical, legal, finance) require 0.85 faithfulness — stricter than general agents.",
        required: true,
        layer: 3,
      },
      {
        assertion: { type: "relevance", threshold: 0.80 },
        rationale: "High-stakes specialized domains require higher relevance precision.",
        required: true,
        layer: 3,
      },
      {
        assertion: {
          type: "llm_rubric",
          rubric:
            "The response is domain-accurate, does not make claims beyond available evidence, and appropriately qualifies uncertainty. It does not provide advice outside its defined scope.",
          threshold: 0.80,
        },
        rationale: "Domain accuracy and appropriate qualification of uncertainty are critical in specialized domains.",
        required: true,
        layer: 3,
      },
    ],
    minTestCases: 10,
    passingScore: 0.85,
    suggestedTestLabels: [
      "Core domain factual query",
      "Edge case within domain scope",
      "Out-of-scope query — must decline gracefully",
      "Complex multi-step domain reasoning",
      "Uncertainty acknowledgment scenario",
      "Contradictory information handling",
      "High-stakes decision support question",
      "Domain terminology clarification",
      "Cross-domain boundary question",
      "Compliance or safety check",
    ],
  },

  // ── engineering ────────────────────────────────────────────────────────────
  engineering: {
    category: "engineering",
    displayName: "Engineering",
    description:
      "Engineering agents must produce technically correct, secure, and maintainable software engineering outputs.",
    assertions: [
      {
        assertion: {
          type: "llm_rubric",
          rubric:
            "The engineering output is technically correct, follows best practices for the technology stack, is secure (no obvious vulnerabilities), and is maintainable.",
          threshold: 0.80,
        },
        rationale: "Technical correctness and security are non-negotiable in software engineering contexts.",
        required: true,
        layer: 3,
      },
      {
        assertion: { type: "not_contains", value: "TODO: implement" },
        rationale: "Engineering outputs must not contain stub implementations.",
        required: true,
        layer: 1,
      },
      {
        assertion: { type: "latency", threshold: 20_000 },
        rationale: "Engineering tasks can be complex — 20 s ceiling allows for thoughtful generation.",
        required: false,
        layer: 1,
      },
    ],
    minTestCases: 8,
    passingScore: 0.80,
    suggestedTestLabels: [
      "System design for a described architecture",
      "Code review and improvement",
      "Performance optimization strategy",
      "Security audit of a code snippet",
      "API design guidance",
      "Database schema design",
      "CI/CD pipeline recommendation",
      "Technical trade-off analysis",
    ],
  },

  // ── testing ────────────────────────────────────────────────────────────────
  testing: {
    category: "testing",
    displayName: "Testing",
    description:
      "QA and testing agents must produce comprehensive, valid test cases that cover the specified requirements.",
    assertions: [
      {
        assertion: {
          type: "llm_rubric",
          rubric:
            "The test cases cover happy path, edge cases, and error conditions. They are specific, executable, and follow testing best practices.",
          threshold: 0.75,
        },
        rationale: "Test coverage quality and executability are the primary evaluation dimensions.",
        required: true,
        layer: 3,
      },
      {
        assertion: { type: "contains", value: "assert" },
        rationale: "Test outputs must include actual assertions — not just descriptions.",
        required: false,
        layer: 1,
      },
      {
        assertion: { type: "relevance", threshold: 0.75 },
        rationale: "Test cases must be directly relevant to the described functionality.",
        required: true,
        layer: 3,
      },
    ],
    minTestCases: 8,
    passingScore: 0.75,
    suggestedTestLabels: [
      "Unit test generation for a function",
      "Integration test scenario design",
      "Edge case identification",
      "Test data generation",
      "Bug reproduction test case",
      "Regression test suite outline",
      "Performance test criteria",
      "Security test checklist",
    ],
  },

  // ── product ────────────────────────────────────────────────────────────────
  product: {
    category: "product",
    displayName: "Product",
    description:
      "Product management agents must produce actionable, structured product artifacts grounded in stated requirements.",
    assertions: [
      {
        assertion: {
          type: "llm_rubric",
          rubric:
            "The product output (PRD, user story, roadmap item, etc.) is actionable, specific, and addresses the stated product objective. It includes success metrics where appropriate.",
          threshold: 0.75,
        },
        rationale: "Actionability and specificity are the primary quality dimensions for product artifacts.",
        required: true,
        layer: 3,
      },
      {
        assertion: { type: "relevance", threshold: 0.75 },
        rationale: "Product artifacts must directly address the product question or objective.",
        required: true,
        layer: 3,
      },
    ],
    minTestCases: 5,
    passingScore: 0.75,
    suggestedTestLabels: [
      "User story writing for a feature",
      "PRD section generation",
      "Acceptance criteria definition",
      "Success metric recommendation",
      "Feature prioritization rationale",
    ],
  },

  // ── project-management ─────────────────────────────────────────────────────
  "project-management": {
    category: "project-management",
    displayName: "Project Management",
    description:
      "Project management agents must produce structured, realistic plans with clear dependencies and timelines.",
    assertions: [
      {
        assertion: {
          type: "llm_rubric",
          rubric:
            "The project plan is realistic, complete, and includes clear tasks, dependencies, owners, and timelines. It identifies key risks.",
          threshold: 0.75,
        },
        rationale: "Completeness and realism of project plans are the primary success criteria.",
        required: true,
        layer: 3,
      },
      {
        assertion: { type: "latency", threshold: 15_000 },
        rationale: "Project management agents are used in planning sessions — 15 s is the target.",
        required: false,
        layer: 1,
      },
    ],
    minTestCases: 5,
    passingScore: 0.75,
    suggestedTestLabels: [
      "Sprint planning for a feature set",
      "Risk identification for a project",
      "Timeline estimation for described scope",
      "Dependency mapping question",
      "Status report generation",
    ],
  },

  // ── game-development ───────────────────────────────────────────────────────
  "game-development": {
    category: "game-development",
    displayName: "Game Development",
    description:
      "Game development agents must balance creative quality with technical correctness for the specified platform.",
    assertions: [
      {
        assertion: {
          type: "llm_rubric",
          rubric:
            "The game development output is technically accurate for the specified platform/engine. It is creative where appropriate and follows game design best practices.",
          threshold: 0.70,
        },
        rationale: "Technical accuracy and creative quality are the dual evaluation criteria for game dev agents.",
        required: true,
        layer: 3,
      },
      {
        assertion: { type: "relevance", threshold: 0.75 },
        rationale: "Game dev guidance must be specific to the stated engine/platform/context.",
        required: true,
        layer: 3,
      },
    ],
    minTestCases: 5,
    passingScore: 0.70,
    suggestedTestLabels: [
      "Game mechanic design for a genre",
      "Unity/Unreal code snippet",
      "Level design recommendation",
      "Character stat balancing",
      "Game loop architecture question",
    ],
  },

  // ── spatial-computing ──────────────────────────────────────────────────────
  "spatial-computing": {
    category: "spatial-computing",
    displayName: "Spatial Computing",
    description:
      "XR/AR/VR agents must produce technically accurate guidance specific to spatial computing platforms and UX conventions.",
    assertions: [
      {
        assertion: {
          type: "llm_rubric",
          rubric:
            "The spatial computing output is technically accurate for XR/AR/VR contexts. It addresses the specific platform constraints (field of view, interaction paradigms, motion sickness mitigation, etc.).",
          threshold: 0.75,
        },
        rationale: "Spatial computing is a specialized domain with unique constraints — technical accuracy is critical.",
        required: true,
        layer: 3,
      },
      {
        assertion: { type: "relevance", threshold: 0.75 },
        rationale: "XR guidance must be specific to the stated platform and use case.",
        required: true,
        layer: 3,
      },
    ],
    minTestCases: 5,
    passingScore: 0.75,
    suggestedTestLabels: [
      "AR overlay design for industrial use case",
      "VR locomotion recommendation",
      "Comfort guidelines for extended sessions",
      "Spatial UI component design",
      "Cross-platform XR compatibility question",
    ],
  },

  // ── paid-media ─────────────────────────────────────────────────────────────
  "paid-media": {
    category: "paid-media",
    displayName: "Paid Media",
    description:
      "Paid media agents must produce compliant, effective ad content that follows platform policies.",
    assertions: [
      {
        assertion: {
          type: "llm_rubric",
          rubric:
            "The ad content is compliant with standard advertising guidelines, uses clear value propositions, and is optimized for the specified platform and audience.",
          threshold: 0.70,
        },
        rationale: "Ad effectiveness and compliance are the dual quality criteria for paid media agents.",
        required: true,
        layer: 3,
      },
      {
        assertion: { type: "not_contains", value: "guaranteed" },
        rationale: "Ad copy must not include performance guarantees — policy and legal compliance.",
        required: true,
        layer: 1,
      },
      {
        assertion: { type: "not_contains", value: "limited time only" },
        rationale:
          "Time-pressure tactics without real deadline context violate platform policies on some channels.",
        required: false,
        layer: 1,
      },
    ],
    minTestCases: 5,
    passingScore: 0.70,
    suggestedTestLabels: [
      "Google Ads headline generation",
      "Meta ad copy for a target audience",
      "Retargeting message variation",
      "Performance Max asset suggestions",
      "A/B test copy variants",
    ],
  },

  // ── desktop-automation ─────────────────────────────────────────────────────
  "desktop-automation": {
    category: "desktop-automation",
    displayName: "Desktop Automation",
    description:
      "Desktop automation agents interface with CLI tools — outputs must be valid, parseable commands or structured results.",
    assertions: [
      {
        assertion: { type: "json_valid" },
        rationale:
          "Desktop automation agents typically return structured JSON for downstream processing — output must be valid.",
        required: false,
        layer: 1,
      },
      {
        assertion: {
          type: "llm_rubric",
          rubric:
            "The automation output correctly accomplishes the described task. Commands are syntactically valid for the target CLI tool. Error handling is addressed.",
          threshold: 0.75,
        },
        rationale: "Correctness of automation commands is critical — incorrect commands cause system errors.",
        required: true,
        layer: 3,
      },
      {
        assertion: { type: "latency", threshold: 60_000 },
        rationale: "Desktop automation via CLI bridge can take up to 60 s for complex operations.",
        required: true,
        layer: 1,
      },
      {
        assertion: { type: "not_contains", value: "rm -rf /" },
        rationale: "Destructive system commands must never appear in automation outputs.",
        required: true,
        layer: 1,
      },
    ],
    minTestCases: 8,
    passingScore: 0.75,
    suggestedTestLabels: [
      "File operation command generation",
      "Process management task",
      "CLI tool parameter lookup",
      "Error recovery workflow",
      "Batch operation planning",
      "Output parsing and structuring",
      "Multi-step automation sequence",
      "Safety-check for destructive operation",
    ],
  },
};

// ─── Fallback standard ────────────────────────────────────────────────────────

/** Used when an agent has no category or the category is unrecognized. */
export const DEFAULT_EVAL_STANDARD: EvalCategoryStandard = {
  category: "default",
  displayName: "Default",
  description: "Baseline standards applied when no category-specific standard is available.",
  assertions: [
    {
      assertion: { type: "relevance", threshold: 0.70 },
      rationale: "All agents must address the question asked.",
      required: true,
      layer: 3,
    },
  ],
  minTestCases: 3,
  passingScore: 0.70,
  suggestedTestLabels: [
    "Core capability test",
    "Edge case handling",
    "Off-topic rejection",
  ],
};

// ─── Helper: merge global + category assertions ───────────────────────────────

/**
 * Returns the merged eval standard for a given agent category.
 * Deduplicates by assertion type — category-specific assertions
 * take precedence over global ones of the same type.
 *
 * Usage in AI generator (Sprint 2):
 *   const standard = getCategoryStandard(agent.category);
 *   // standard.assertions → all required templates
 *   // standard.suggestedTestLabels → seed prompts for test case generation
 */
export function getCategoryStandard(category?: string | null): EvalCategoryStandard {
  const base = category ? (CATEGORY_EVAL_STANDARDS[category] ?? DEFAULT_EVAL_STANDARD) : DEFAULT_EVAL_STANDARD;

  // Required globals are ALWAYS included — they cannot be silently dropped by
  // a category that defines an optional assertion of the same type.
  const requiredGlobals = GLOBAL_EVAL_ASSERTIONS.filter((g) => g.required);

  // Optional globals are included only when the category does not already
  // define an assertion of the same type (category takes precedence).
  const optionalGlobals = GLOBAL_EVAL_ASSERTIONS.filter((g) => !g.required);
  const categoryTypes = new Set(base.assertions.map((a) => a.assertion.type));
  const requiredGlobalTypes = new Set(requiredGlobals.map((g) => g.assertion.type));

  // Unique optional globals (not covered by category or required globals)
  const uniqueOptionalGlobals = optionalGlobals.filter(
    (g) => !categoryTypes.has(g.assertion.type),
  );

  // Category assertions that don't conflict with required globals
  const categoryAssertions = base.assertions.filter(
    (a) => !requiredGlobalTypes.has(a.assertion.type),
  );

  return {
    ...base,
    assertions: [...requiredGlobals, ...categoryAssertions, ...uniqueOptionalGlobals],
  };
}

/**
 * Returns only the required assertions for a category (layer 1+2+3 combined).
 * Convenience helper for the AI generator — filters out optional suggestions.
 */
export function getRequiredAssertions(category?: string | null): AssertionTemplate[] {
  return getCategoryStandard(category).assertions.filter((a) => a.required);
}

/**
 * List all available category standards (for the standards API endpoint).
 */
export function getAllStandards(): EvalCategoryStandard[] {
  return Object.values(CATEGORY_EVAL_STANDARDS).map((s) => getCategoryStandard(s.category));
}
