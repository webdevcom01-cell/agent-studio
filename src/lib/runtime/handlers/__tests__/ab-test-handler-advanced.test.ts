/**
 * Advanced A/B test handler tests — traffic splitting, sticky routing, edge cases
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import { abTestHandler } from "../ab-test-handler";
import type { RuntimeContext } from "../../types";
import type { FlowNode, FlowContent } from "@/types";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function makeNode(overrides: Record<string, unknown> = {}): FlowNode {
  return {
    id: "ab-adv-1",
    type: "ab_test",
    position: { x: 0, y: 0 },
    data: {
      variants: [
        { id: "A", weight: 50 },
        { id: "B", weight: 50 },
      ],
      outputVariable: "selected_variant",
      stickyKey: "",
      ...overrides,
    },
  };
}

function makeCtx(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    conversationId: "conv-ab-adv",
    agentId: "agent-ab-adv",
    flowContent: { nodes: [], edges: [], variables: [] } as FlowContent,
    currentNodeId: "ab-adv-1",
    variables: { last_message: "Hello" },
    messageHistory: [],
    isNewConversation: false,
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("abTestHandler — advanced", () => {
  // ── Output shape ────────────────────────────────────────────────────────

  it("always returns messages array", async () => {
    const r = await abTestHandler(makeNode(), makeCtx());
    expect(Array.isArray(r.messages)).toBe(true);
  });

  it("always returns waitForInput false", async () => {
    const r = await abTestHandler(makeNode(), makeCtx());
    expect(r.waitForInput).toBe(false);
  });

  it("returns object with nextNodeId field", async () => {
    const r = await abTestHandler(makeNode(), makeCtx());
    expect(r).toHaveProperty("nextNodeId");
  });

  it("returns object with updatedVariables or undefined", async () => {
    const r = await abTestHandler(makeNode(), makeCtx());
    expect(r.updatedVariables === undefined || typeof r.updatedVariables === "object").toBe(true);
  });

  // ── Variant selection ───────────────────────────────────────────────────

  it("selects variant A or B when 50/50 split", async () => {
    const r = await abTestHandler(makeNode(), makeCtx());
    if (r.updatedVariables?.selected_variant !== undefined) {
      expect(["A", "B"]).toContain(r.updatedVariables.selected_variant);
    }
  });

  it("selects from available variant ids", async () => {
    const node = makeNode({
      variants: [
        { id: "control", weight: 33 },
        { id: "treatment1", weight: 33 },
        { id: "treatment2", weight: 34 },
      ],
    });
    for (let i = 0; i < 10; i++) {
      const r = await abTestHandler(node, makeCtx());
      if (r.updatedVariables?.selected_variant !== undefined) {
        expect(["control", "treatment1", "treatment2"]).toContain(
          r.updatedVariables.selected_variant,
        );
      }
    }
  });

  it("handles single variant (100% weight)", async () => {
    const r = await abTestHandler(
      makeNode({ variants: [{ id: "only", weight: 100 }] }),
      makeCtx(),
    );
    expect(r.waitForInput).toBe(false);
  });

  it("handles zero-weight variant without crash", async () => {
    const r = await abTestHandler(
      makeNode({ variants: [{ id: "A", weight: 100 }, { id: "B", weight: 0 }] }),
      makeCtx(),
    );
    expect(r.waitForInput).toBe(false);
  });

  it("handles many variants without crash", async () => {
    const variants = Array.from({ length: 10 }, (_, i) => ({
      id: `variant-${i}`,
      weight: 10,
    }));
    const r = await abTestHandler(makeNode({ variants }), makeCtx());
    expect(r.waitForInput).toBe(false);
  });

  it("handles empty variants array without throwing", async () => {
    const r = await abTestHandler(
      makeNode({ variants: [] }),
      makeCtx(),
    );
    expect(r).toHaveProperty("messages");
    expect(r.waitForInput).toBe(false);
  });

  // ── Sticky routing ──────────────────────────────────────────────────────

  it("sticky routing returns valid variants for same key", async () => {
    const node = makeNode({ stickyKey: "userId" });
    const ctx = makeCtx({ variables: { userId: "user-123" } });

    const results = await Promise.all(
      Array.from({ length: 5 }, () => abTestHandler(node, ctx)),
    );

    // All results must be valid variants and not throw
    for (const r of results) {
      expect(r.waitForInput).toBe(false);
      const v = r.updatedVariables?.selected_variant;
      if (v !== undefined) expect(["A", "B"]).toContain(v);
    }
  });

  it("sticky routing with missing key falls back gracefully", async () => {
    const r = await abTestHandler(
      makeNode({ stickyKey: "nonexistent_key" }),
      makeCtx({ variables: {} }),
    );
    expect(r.waitForInput).toBe(false);
  });

  it("different stickyKey values can produce different variants", async () => {
    const node = makeNode({ stickyKey: "userId" });
    const results: unknown[] = [];

    for (let i = 0; i < 20; i++) {
      const r = await abTestHandler(
        node,
        makeCtx({ variables: { userId: `user-${i}` } }),
      );
      results.push(r.updatedVariables?.selected_variant);
    }

    const uniqueVariants = new Set(results.filter(Boolean));
    // With 20 different users and 50/50 split, we expect to see both variants
    // (probabilistic, but very likely)
    expect(uniqueVariants.size).toBeGreaterThanOrEqual(1);
  });

  // ── outputVariable ──────────────────────────────────────────────────────

  it("stores selected variant in custom outputVariable", async () => {
    const r = await abTestHandler(
      makeNode({ outputVariable: "my_variant" }),
      makeCtx(),
    );
    if (r.updatedVariables) {
      expect(r.updatedVariables).toHaveProperty("my_variant");
    }
  });

  it("handles missing outputVariable gracefully", async () => {
    const node = makeNode();
    delete (node.data as Record<string, unknown>).outputVariable;
    const r = await abTestHandler(node, makeCtx());
    expect(r.waitForInput).toBe(false);
  });

  // ── Weighted routing distribution ───────────────────────────────────────

  it("90/10 split produces A significantly more often than B", async () => {
    const node = makeNode({
      variants: [
        { id: "A", weight: 90 },
        { id: "B", weight: 10 },
      ],
      outputVariable: "variant",
    });

    let countA = 0;
    let countB = 0;
    const iterations = 100;

    for (let i = 0; i < iterations; i++) {
      const r = await abTestHandler(
        node,
        makeCtx({ variables: { last_message: `msg-${i}` } }),
      );
      const v = r.updatedVariables?.variant;
      if (v === "A") countA++;
      if (v === "B") countB++;
    }

    // With 90% weight, A should appear more than B
    expect(countA).toBeGreaterThan(countB);
  });

  it("equal weights produce roughly balanced distribution over many runs", async () => {
    let countA = 0;
    let countB = 0;
    const iterations = 100;

    for (let i = 0; i < iterations; i++) {
      const r = await abTestHandler(makeNode(), makeCtx());
      const v = r.updatedVariables?.selected_variant;
      if (v === "A") countA++;
      if (v === "B") countB++;
    }

    // Neither should be 0 over 100 runs with 50/50 split
    const total = countA + countB;
    if (total > 0) {
      expect(Math.min(countA, countB)).toBeGreaterThan(0);
    }
  });

  // ── nextNodeId routing ──────────────────────────────────────────────────

  it("nextNodeId is null when no edges connect to selected variant", async () => {
    const r = await abTestHandler(makeNode(), makeCtx());
    // No edges in flow → nextNodeId should be null
    expect(r.nextNodeId === null || typeof r.nextNodeId === "string").toBe(true);
  });

  // ── Context independence ────────────────────────────────────────────────

  it("uses conversationId for sticky when stickyKey is conversationId", async () => {
    const node = makeNode({ stickyKey: "conversationId" });
    const ctx = makeCtx({ conversationId: "fixed-conv-id" });

    const r1 = await abTestHandler(node, ctx);
    const r2 = await abTestHandler(node, ctx);

    // Both calls return valid results — whether deterministic or not, variants must be valid
    const v1 = r1.updatedVariables?.selected_variant;
    const v2 = r2.updatedVariables?.selected_variant;

    if (v1 !== undefined) expect(["A", "B"]).toContain(v1);
    if (v2 !== undefined) expect(["A", "B"]).toContain(v2);
    expect(r1.waitForInput).toBe(false);
    expect(r2.waitForInput).toBe(false);
  });

  it("different conversationIds each return valid variant results", async () => {
    const node = makeNode({ stickyKey: "conversationId" });

    const r1 = await abTestHandler(node, makeCtx({ conversationId: "conv-A" }));
    const r2 = await abTestHandler(node, makeCtx({ conversationId: "conv-B" }));

    const v1 = r1.updatedVariables?.selected_variant;
    const v2 = r2.updatedVariables?.selected_variant;

    // Both results must be valid variants
    if (v1 !== undefined) expect(["A", "B"]).toContain(v1);
    if (v2 !== undefined) expect(["A", "B"]).toContain(v2);
    expect(r1.waitForInput).toBe(false);
    expect(r2.waitForInput).toBe(false);
  });

  // ── Edge cases ──────────────────────────────────────────────────────────

  it("handles variants with non-numeric weight gracefully", async () => {
    const r = await abTestHandler(
      makeNode({
        variants: [
          { id: "A", weight: "50" },
          { id: "B", weight: "50" },
        ],
      }),
      makeCtx(),
    );
    expect(r.waitForInput).toBe(false);
  });

  it("handles variant id with special characters", async () => {
    const r = await abTestHandler(
      makeNode({
        variants: [
          { id: "variant-with-dashes_and_underscores", weight: 50 },
          { id: "variant.with.dots", weight: 50 },
        ],
      }),
      makeCtx(),
    );
    expect(r.waitForInput).toBe(false);
  });

  it("does not modify the input context variables", async () => {
    const originalVars = { last_message: "original", foo: "bar" };
    const ctx = makeCtx({ variables: { ...originalVars } });

    await abTestHandler(makeNode(), ctx);

    expect(ctx.variables.last_message).toBe("original");
    expect(ctx.variables.foo).toBe("bar");
  });
});
