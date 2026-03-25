/**
 * Unit tests for the AI Eval Suite Generator
 *
 * Coverage:
 *   generator-schemas.ts  — Zod schema validation (GeneratedEvalSuiteSchema,
 *                           GenerateEvalSuiteRequestSchema)
 *   generator-prompts.ts  — buildGeneratorPrompt() content + structure
 */

import { describe, it, expect } from "vitest";
import { GeneratedEvalSuiteSchema, GenerateEvalSuiteRequestSchema } from "../generator-schemas";
import { buildGeneratorPrompt } from "../generator-prompts";

// ─── GeneratedEvalSuiteSchema ──────────────────────────────────────────────────

describe("GeneratedEvalSuiteSchema", () => {
  const validTestCase = {
    label: "Node count — L1 deterministic",
    input: "How many node types does Agent Studio support?",
    assertions: [
      { type: "contains", value: "31" },
      { type: "relevance", threshold: 0.70 },
    ],
    tags: ["happy-path", "l1"],
  };

  const validSuite = {
    suiteName: "Auto-generated — Product FAQ Agent",
    suiteDescription: "Tests factual queries and hallucination resistance.",
    testCases: [
      validTestCase,
      {
        label: "Pricing check — L1 deterministic",
        input: "Is Agent Studio free to use?",
        assertions: [{ type: "icontains", value: "free" }],
        tags: ["happy-path", "l1"],
      },
      {
        label: "Hallucination probe — L3 faithfulness",
        input: "What is the paid plan pricing?",
        assertions: [{ type: "relevance", threshold: 0.70 }],
        tags: ["adversarial", "l3"],
      },
    ],
  };

  it("accepts a valid generated suite", () => {
    const result = GeneratedEvalSuiteSchema.safeParse(validSuite);
    expect(result.success).toBe(true);
  });

  it("rejects suite with no test cases", () => {
    const result = GeneratedEvalSuiteSchema.safeParse({ ...validSuite, testCases: [] });
    expect(result.success).toBe(false);
  });

  it("rejects suite with only 2 test cases (min is 3)", () => {
    const result = GeneratedEvalSuiteSchema.safeParse({
      ...validSuite,
      testCases: [validSuite.testCases[0], validSuite.testCases[0]],
    });
    expect(result.success).toBe(false);
  });

  it("rejects suite with 11 test cases (max is 10)", () => {
    const result = GeneratedEvalSuiteSchema.safeParse({
      ...validSuite,
      testCases: Array(11).fill(validSuite.testCases[0]),
    });
    expect(result.success).toBe(false);
  });

  it("rejects suite missing suiteName", () => {
    const { suiteName: _omit, ...rest } = validSuite;
    const result = GeneratedEvalSuiteSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("accepts all valid assertion types in test cases", () => {
    const allAssertions = [
      { type: "contains",         value: "hello" },
      { type: "icontains",        value: "hello" },
      { type: "not_contains",     value: "error" },
      { type: "regex",            value: "\\d+" },
      { type: "json_valid" },
      { type: "latency",          threshold: 5000 },
      { type: "semantic_similarity", value: "expected answer", threshold: 0.75 },
      { type: "llm_rubric",       rubric: "Is the answer factually correct and helpful?", threshold: 0.70 },
      { type: "kb_faithfulness",  threshold: 0.80 },
      { type: "relevance",        threshold: 0.70 },
    ];

    for (const assertion of allAssertions) {
      const result = GeneratedEvalSuiteSchema.safeParse({
        ...validSuite,
        testCases: [
          {
            ...validSuite.testCases[0],
            input: "What is the answer?",
            assertions: [assertion, ...validSuite.testCases[0].assertions.slice(0, 1)],
          },
          validSuite.testCases[0],
          validSuite.testCases[0],
        ],
      });
      expect(result.success, `assertion type ${assertion.type} failed`).toBe(true);
    }
  });

  it("rejects test case with more than 4 assertions", () => {
    const result = GeneratedEvalSuiteSchema.safeParse({
      ...validSuite,
      testCases: [
        {
          ...validSuite.testCases[0],
          assertions: [
            { type: "contains", value: "a" },
            { type: "contains", value: "b" },
            { type: "relevance", threshold: 0.7 },
            { type: "kb_faithfulness", threshold: 0.8 },
            { type: "json_valid" }, // 5th — exceeds max
          ],
        },
        validSuite.testCases[0],
        validSuite.testCases[0],
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects test case with zero assertions", () => {
    const result = GeneratedEvalSuiteSchema.safeParse({
      ...validSuite,
      testCases: [
        { ...validSuite.testCases[0], assertions: [] },
        validSuite.testCases[0],
        validSuite.testCases[0],
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects semantic_similarity with threshold below 0.5", () => {
    const result = GeneratedEvalSuiteSchema.safeParse({
      ...validSuite,
      testCases: [
        {
          ...validSuite.testCases[0],
          assertions: [
            { type: "semantic_similarity", value: "expected", threshold: 0.2 },
          ],
        },
        validSuite.testCases[0],
        validSuite.testCases[0],
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects llm_rubric with empty rubric string", () => {
    const result = GeneratedEvalSuiteSchema.safeParse({
      ...validSuite,
      testCases: [
        {
          ...validSuite.testCases[0],
          assertions: [
            { type: "llm_rubric", rubric: "", threshold: 0.70 },
          ],
        },
        validSuite.testCases[0],
        validSuite.testCases[0],
      ],
    });
    expect(result.success).toBe(false);
  });

  it("applies default threshold for semantic_similarity when omitted", () => {
    const result = GeneratedEvalSuiteSchema.safeParse({
      ...validSuite,
      testCases: [
        {
          ...validSuite.testCases[0],
          assertions: [
            { type: "semantic_similarity", value: "expected answer" },
          ],
        },
        validSuite.testCases[0],
        validSuite.testCases[0],
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const assertion = result.data.testCases[0].assertions[0];
      if (assertion.type === "semantic_similarity") {
        expect(assertion.threshold).toBe(0.75);
      }
    }
  });

  it("applies default tags [] when omitted", () => {
    const result = GeneratedEvalSuiteSchema.safeParse({
      ...validSuite,
      testCases: [
        { label: "Test", input: "Query", assertions: [{ type: "contains", value: "x" }] },
        validSuite.testCases[0],
        validSuite.testCases[0],
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.testCases[0].tags).toEqual([]);
    }
  });
});

// ─── GenerateEvalSuiteRequestSchema ──────────────────────────────────────────

describe("GenerateEvalSuiteRequestSchema", () => {
  const validRequest = {
    agentName: "Product FAQ Agent",
    targetCount: 5,
    runOnDeploy: true,
  };

  it("accepts a valid minimal request", () => {
    const result = GenerateEvalSuiteRequestSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
  });

  it("accepts a full request with all optional fields", () => {
    const result = GenerateEvalSuiteRequestSchema.safeParse({
      ...validRequest,
      systemPrompt: "You are a helpful FAQ agent...",
      category: "support",
      kbSamples: ["Sample text 1", "Sample text 2"],
      targetCount: 8,
      runOnDeploy: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects targetCount below 3", () => {
    const result = GenerateEvalSuiteRequestSchema.safeParse({
      ...validRequest,
      targetCount: 2,
    });
    expect(result.success).toBe(false);
  });

  it("rejects targetCount above 10", () => {
    const result = GenerateEvalSuiteRequestSchema.safeParse({
      ...validRequest,
      targetCount: 11,
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 3 kbSamples", () => {
    const result = GenerateEvalSuiteRequestSchema.safeParse({
      ...validRequest,
      kbSamples: ["a", "b", "c", "d"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty agentName", () => {
    const result = GenerateEvalSuiteRequestSchema.safeParse({
      ...validRequest,
      agentName: "",
    });
    expect(result.success).toBe(false);
  });

  it("applies default targetCount of 5", () => {
    const result = GenerateEvalSuiteRequestSchema.safeParse({ agentName: "My Agent" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.targetCount).toBe(5);
    }
  });

  it("applies default runOnDeploy of true", () => {
    const result = GenerateEvalSuiteRequestSchema.safeParse({ agentName: "My Agent" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.runOnDeploy).toBe(true);
    }
  });

  it("rejects systemPrompt exceeding 8000 chars", () => {
    const result = GenerateEvalSuiteRequestSchema.safeParse({
      ...validRequest,
      systemPrompt: "x".repeat(8001),
    });
    expect(result.success).toBe(false);
  });
});

// ─── buildGeneratorPrompt() ────────────────────────────────────────────────────

describe("buildGeneratorPrompt()", () => {
  it("returns system and user parts", () => {
    const { system, user } = buildGeneratorPrompt("My Agent", "You are helpful.");
    expect(typeof system).toBe("string");
    expect(typeof user).toBe("string");
    expect(system.length).toBeGreaterThan(100);
    expect(user.length).toBeGreaterThan(50);
  });

  it("includes agent name in user prompt", () => {
    const { user } = buildGeneratorPrompt("Product FAQ Bot", "You answer FAQs.");
    expect(user).toContain("Product FAQ Bot");
  });

  it("includes system prompt content in user prompt", () => {
    const { user } = buildGeneratorPrompt("Bot", "Answer only about cooking.");
    expect(user).toContain("Answer only about cooking.");
  });

  it("includes category guidance when category is provided", () => {
    const { user } = buildGeneratorPrompt("Support Bot", "You help customers.", "support");
    expect(user).toContain("Support");
  });

  it("includes KB samples when provided", () => {
    const { user } = buildGeneratorPrompt(
      "FAQ Bot",
      "You answer questions.",
      "support",
      ["The pricing is $99/month.", "We support GitHub OAuth."],
    );
    expect(user).toContain("KB Sample 1");
    expect(user).toContain("The pricing is $99/month.");
  });

  it("includes kb_faithfulness instruction when KB samples provided", () => {
    const { user } = buildGeneratorPrompt(
      "FAQ Bot",
      "You answer questions.",
      undefined,
      ["KB content here"],
    );
    expect(user).toContain("kb_faithfulness");
  });

  it("instructs NOT to use kb_faithfulness when no KB samples", () => {
    const { user } = buildGeneratorPrompt("Bot", "No KB.");
    expect(user).toContain("Do NOT include kb_faithfulness");
  });

  it("includes targetCount in user prompt", () => {
    const { user } = buildGeneratorPrompt("Bot", "Prompt.", undefined, undefined, 8);
    expect(user).toContain("8");
  });

  it("includes required assertions from category standard", () => {
    const { user } = buildGeneratorPrompt("Agent", "Prompt.", "coding");
    expect(user).toContain("Required Assertions");
  });

  it("includes 3-layer strategy description in system prompt", () => {
    const { system } = buildGeneratorPrompt("Agent", "Prompt.");
    expect(system).toContain("Layer 1");
    expect(system).toContain("Layer 2");
    expect(system).toContain("Layer 3");
  });

  it("includes test case distribution guidance in system prompt", () => {
    const { system } = buildGeneratorPrompt("Agent", "Prompt.");
    expect(system).toContain("happy path");
    expect(system).toContain("edge case");
    expect(system).toContain("adversarial");
  });

  it("works with all undefined optional params", () => {
    expect(() => buildGeneratorPrompt("My Agent")).not.toThrow();
  });

  it("handles null/undefined category gracefully", () => {
    expect(() => buildGeneratorPrompt("Agent", "Prompt.", undefined)).not.toThrow();
    expect(() => buildGeneratorPrompt("Agent", "Prompt.", null as unknown as string)).not.toThrow();
  });
});
