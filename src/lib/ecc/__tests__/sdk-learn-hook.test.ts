import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const mockGenerateText = vi.hoisted(() => vi.fn());
const mockGetModel     = vi.hoisted(() => vi.fn());
const mockRecordMetric = vi.hoisted(() => vi.fn());
const mockIsECCEnabled = vi.hoisted(() => vi.fn());

const mockPrisma = vi.hoisted(() => ({
  agentExecution: {
    create: vi.fn(),
  },
  agent: {
    findUnique: vi.fn(),
  },
  instinct: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  // $transaction passes `tx` (which is mockPrisma itself) to the callback
  $transaction: vi.fn(),
}));

vi.mock("ai",                            () => ({ generateText: mockGenerateText }));
vi.mock("@/lib/ai",                      () => ({ getModel: mockGetModel }));
vi.mock("@/lib/prisma",                  () => ({ prisma: mockPrisma }));
vi.mock("@/lib/observability/metrics",   () => ({ recordMetric: mockRecordMetric }));
vi.mock("@/lib/logger",                  () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../feature-flag", () => ({ isECCEnabled: mockIsECCEnabled }));

// ── Import after mocks ─────────────────────────────────────────────────────

import { fireSdkLearnHook, type SdkExecutionRecord } from "../sdk-learn-hook";

// ── Helpers ────────────────────────────────────────────────────────────────

const AGENT_ID = "agent-ecc-001";
const EXEC_ID  = "exec-cuid-aabbcc";

function record(overrides?: Partial<SdkExecutionRecord>): SdkExecutionRecord {
  return {
    agentId:      AGENT_ID,
    userId:       "user-42",
    task:         "Research the European EV market trends in 2024",
    response:     "The EV market in Europe grew by 35% year-over-year in 2024.",
    modelId:      "claude-sonnet-4-6",
    durationMs:   1200,
    inputTokens:  200,
    outputTokens: 80,
    sessionId:    "sess-abc",
    traceId:      "trace-xyz",
    ...overrides,
  };
}

// ── beforeEach ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: ECC globally disabled
  mockIsECCEnabled.mockReturnValue(false);
  mockGetModel.mockReturnValue({ modelId: "claude-haiku-4-5-20251001" });

  // Default: AgentExecution created successfully
  mockPrisma.agentExecution.create.mockResolvedValue({ id: EXEC_ID });

  // $transaction: execute callback with mockPrisma as tx
  mockPrisma.$transaction.mockImplementation(
    async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma)
  );

  // Default: no existing instinct
  mockPrisma.instinct.findFirst.mockResolvedValue(null);
  mockPrisma.instinct.create.mockResolvedValue({ id: "instinct-new" });
  mockPrisma.instinct.update.mockResolvedValue({ id: "instinct-existing" });

  // Default: agent with eccEnabled = false
  mockPrisma.agent.findUnique.mockResolvedValue({ eccEnabled: false });

  // Default: Haiku returns a valid JSON pattern
  mockGenerateText.mockResolvedValue({
    text: '{"name":"ev-market-research","description":"Research and analysis of electric vehicle market trends"}',
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 1 — AgentExecution recording (always fires, ECC-independent)
// ══════════════════════════════════════════════════════════════════════════════

describe("AgentExecution recording", () => {
  it("always creates an AgentExecution record regardless of ECC flag", async () => {
    mockIsECCEnabled.mockReturnValue(false);
    await fireSdkLearnHook(record());

    expect(mockPrisma.agentExecution.create).toHaveBeenCalledOnce();
  });

  it("records correct fields in AgentExecution", async () => {
    await fireSdkLearnHook(record());

    const call = mockPrisma.agentExecution.create.mock.calls[0][0] as {
      data: {
        agentId: string;
        status: string;
        durationMs: number;
        tokenUsage: { input: number; output: number; total: number };
        traceId: string;
        inputParams: { model: string; sessionId: string };
        outputResult: { response: string };
      };
    };
    expect(call.data.agentId).toBe(AGENT_ID);
    expect(call.data.status).toBe("SUCCESS");
    expect(call.data.durationMs).toBe(1200);
    expect(call.data.tokenUsage).toMatchObject({ input: 200, output: 80, total: 280 });
    expect(call.data.traceId).toBe("trace-xyz");
    expect(call.data.inputParams).toMatchObject({ model: "claude-sonnet-4-6", sessionId: "sess-abc" });
    expect(call.data.outputResult.response).toContain("EV market");
  });

  it("records metric after execution is created", async () => {
    await fireSdkLearnHook(record());
    expect(mockRecordMetric).toHaveBeenCalledWith(
      "sdk.execution.recorded", 1, "count", { agentId: AGENT_ID }
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 2 — ECC gating: hook skips pattern learning when ECC is off
// ══════════════════════════════════════════════════════════════════════════════

describe("ECC feature flag gating", () => {
  it("does NOT call generateText when ECC is globally disabled", async () => {
    mockIsECCEnabled.mockReturnValue(false);
    await fireSdkLearnHook(record());
    expect(mockGenerateText).not.toHaveBeenCalled();
    expect(mockPrisma.agent.findUnique).not.toHaveBeenCalled();
  });

  it("does NOT create an Instinct when ECC is globally disabled", async () => {
    mockIsECCEnabled.mockReturnValue(false);
    await fireSdkLearnHook(record());
    expect(mockPrisma.instinct.create).not.toHaveBeenCalled();
  });

  it("does NOT create an Instinct when ECC is enabled globally but eccEnabled=false on agent", async () => {
    mockIsECCEnabled.mockReturnValue(true);
    mockPrisma.agent.findUnique.mockResolvedValue({ eccEnabled: false });

    await fireSdkLearnHook(record());

    expect(mockGenerateText).not.toHaveBeenCalled();
    expect(mockPrisma.instinct.create).not.toHaveBeenCalled();
  });

  it("proceeds to pattern extraction when ECC is enabled and agent.eccEnabled=true", async () => {
    mockIsECCEnabled.mockReturnValue(true);
    mockPrisma.agent.findUnique.mockResolvedValue({ eccEnabled: true });

    await fireSdkLearnHook(record());

    expect(mockGenerateText).toHaveBeenCalledOnce();
    expect(mockPrisma.instinct.create).toHaveBeenCalledOnce();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 3 — Pattern extraction and Instinct creation
// ══════════════════════════════════════════════════════════════════════════════

describe("Pattern extraction and Instinct creation", () => {
  beforeEach(() => {
    mockIsECCEnabled.mockReturnValue(true);
    mockPrisma.agent.findUnique.mockResolvedValue({ eccEnabled: true });
  });

  it("creates a new Instinct with correct fields when none exists", async () => {
    mockPrisma.instinct.findFirst.mockResolvedValue(null);
    mockGenerateText.mockResolvedValue({
      text: '{"name":"ev-market-research","description":"Research and analysis of EV market trends"}',
    });

    await fireSdkLearnHook(record());

    const createCall = mockPrisma.instinct.create.mock.calls[0][0] as {
      data: {
        agentId: string;
        name: string;
        description: string;
        confidence: number;
        frequency: number;
        origin: string;
        examples: { executionIds: string[] };
      };
    };
    expect(createCall.data.agentId).toBe(AGENT_ID);
    expect(createCall.data.name).toBe("ev-market-research");
    expect(createCall.data.description).toContain("EV market");
    expect(createCall.data.confidence).toBe(0.05);
    expect(createCall.data.frequency).toBe(1);
    expect(createCall.data.origin).toBe("sdk_hook");
    expect(createCall.data.examples.executionIds).toContain(EXEC_ID);
  });

  it("reinforces an existing Instinct — boosts confidence by 0.05 and increments frequency", async () => {
    mockPrisma.instinct.findFirst.mockResolvedValue({
      id: "instinct-existing",
      confidence: 0.4,
      frequency: 5,
      examples: { executionIds: ["exec-old-1", "exec-old-2"] },
    });

    await fireSdkLearnHook(record());

    expect(mockPrisma.instinct.create).not.toHaveBeenCalled();
    const updateCall = mockPrisma.instinct.update.mock.calls[0][0] as {
      where: { id: string };
      data: { confidence: number; frequency: number; examples: { executionIds: string[] } };
    };
    expect(updateCall.where.id).toBe("instinct-existing");
    expect(updateCall.data.confidence).toBeCloseTo(0.45);
    expect(updateCall.data.frequency).toBe(6);
    expect(updateCall.data.examples.executionIds).toContain(EXEC_ID);
    expect(updateCall.data.examples.executionIds).toContain("exec-old-1");
  });

  it("caps confidence at 1.0 when boosting a high-confidence instinct", async () => {
    mockPrisma.instinct.findFirst.mockResolvedValue({
      id: "instinct-high",
      confidence: 0.98,
      frequency: 100,
      examples: {},
    });

    await fireSdkLearnHook(record());

    const updateCall = mockPrisma.instinct.update.mock.calls[0][0] as {
      data: { confidence: number };
    };
    expect(updateCall.data.confidence).toBe(1.0);
  });

  it("normalises pattern name to kebab-case and strips special chars", async () => {
    mockGenerateText.mockResolvedValue({
      text: '{"name":"Market Research & Analysis!","description":"Some description"}',
    });

    await fireSdkLearnHook(record());

    const createCall = mockPrisma.instinct.create.mock.calls[0][0] as {
      data: { name: string };
    };
    expect(createCall.data.name).toMatch(/^[a-z0-9-]+$/);
    expect(createCall.data.name).not.toContain("&");
    expect(createCall.data.name).not.toContain("!");
  });

  it("uses Haiku model for extraction (speed over power)", async () => {
    await fireSdkLearnHook(record());
    expect(mockGetModel).toHaveBeenCalledWith("claude-haiku-4-5-20251001");
  });

  it("records metrics after creating a new Instinct", async () => {
    await fireSdkLearnHook(record());
    expect(mockRecordMetric).toHaveBeenCalledWith(
      "sdk.instinct.created", 1, "count", { agentId: AGENT_ID }
    );
  });

  it("records metrics after reinforcing an existing Instinct", async () => {
    mockPrisma.instinct.findFirst.mockResolvedValue({
      id: "instinct-existing",
      confidence: 0.3,
      frequency: 3,
      examples: {},
    });

    await fireSdkLearnHook(record());

    expect(mockRecordMetric).toHaveBeenCalledWith(
      "sdk.instinct.reinforced", 1, "count", { agentId: AGENT_ID }
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 4 — Fallback behaviour when AI extraction fails
// ══════════════════════════════════════════════════════════════════════════════

describe("Extraction fallback when Haiku call fails or returns invalid JSON", () => {
  beforeEach(() => {
    mockIsECCEnabled.mockReturnValue(true);
    mockPrisma.agent.findUnique.mockResolvedValue({ eccEnabled: true });
  });

  it("falls back to task-derived name when Haiku returns invalid JSON", async () => {
    mockGenerateText.mockResolvedValue({ text: "not valid json at all" });

    await fireSdkLearnHook(record({ task: "Analyze competitor pricing strategy" }));

    const createCall = mockPrisma.instinct.create.mock.calls[0][0] as {
      data: { name: string; description: string };
    };
    expect(createCall.data.name).toBeTruthy();
    expect(createCall.data.name).toMatch(/^[a-z0-9-]+$/);
    expect(createCall.data.description).toContain("Auto-extracted");
  });

  it("falls back to task-derived name when generateText throws", async () => {
    mockGenerateText.mockRejectedValue(new Error("Rate limit"));

    await fireSdkLearnHook(record({ task: "Write technical documentation" }));

    // Should still create an instinct (with fallback name)
    expect(mockPrisma.instinct.create).toHaveBeenCalledOnce();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 5 — Resilience: hook never crashes the caller
// ══════════════════════════════════════════════════════════════════════════════

describe("Resilience — hook never throws", () => {
  it("does NOT throw when AgentExecution.create fails", async () => {
    mockPrisma.agentExecution.create.mockRejectedValue(new Error("DB down"));
    await expect(fireSdkLearnHook(record())).resolves.toBeUndefined();
  });

  it("does NOT throw when instinct.create fails", async () => {
    mockIsECCEnabled.mockReturnValue(true);
    mockPrisma.agent.findUnique.mockResolvedValue({ eccEnabled: true });
    mockPrisma.instinct.create.mockRejectedValue(new Error("Write failed"));
    await expect(fireSdkLearnHook(record())).resolves.toBeUndefined();
  });

  it("does NOT throw when agent lookup fails", async () => {
    mockIsECCEnabled.mockReturnValue(true);
    mockPrisma.agent.findUnique.mockRejectedValue(new Error("DB timeout"));
    await expect(fireSdkLearnHook(record())).resolves.toBeUndefined();
  });

  it("returns undefined (void) in all cases", async () => {
    const result = await fireSdkLearnHook(record());
    expect(result).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 6 — Example ID retention (max 10)
// ══════════════════════════════════════════════════════════════════════════════

describe("Example ID list bounded at MAX_EXAMPLE_IDS (10)", () => {
  it("keeps only the last 10 execution IDs in the examples list", async () => {
    mockIsECCEnabled.mockReturnValue(true);
    mockPrisma.agent.findUnique.mockResolvedValue({ eccEnabled: true });

    const existingIds = Array.from({ length: 10 }, (_, i) => `exec-old-${i}`);
    mockPrisma.instinct.findFirst.mockResolvedValue({
      id: "instinct-full",
      confidence: 0.5,
      frequency: 10,
      examples: { executionIds: existingIds },
    });

    await fireSdkLearnHook(record());

    const updateCall = mockPrisma.instinct.update.mock.calls[0][0] as {
      data: { examples: { executionIds: string[] } };
    };
    // Should drop the oldest and add the new one — still 10 total
    expect(updateCall.data.examples.executionIds).toHaveLength(10);
    expect(updateCall.data.examples.executionIds.at(-1)).toBe(EXEC_ID);
    expect(updateCall.data.examples.executionIds).not.toContain("exec-old-0");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 7 — P3 Upgrades: transaction safety, JSON logging, empty name guard
// ══════════════════════════════════════════════════════════════════════════════

describe("P3 Upgrade: $transaction used for instinct upsert (race-safe)", () => {
  beforeEach(() => {
    mockIsECCEnabled.mockReturnValue(true);
    mockPrisma.agent.findUnique.mockResolvedValue({ eccEnabled: true });
  });

  it("calls $transaction for instinct create", async () => {
    mockPrisma.instinct.findFirst.mockResolvedValue(null);

    await fireSdkLearnHook(record());

    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });

  it("calls $transaction for instinct reinforcement", async () => {
    mockPrisma.instinct.findFirst.mockResolvedValue({
      id: "inst-1",
      confidence: 0.2,
      frequency: 3,
      examples: {},
    });

    await fireSdkLearnHook(record());

    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });
});

describe("P3 Upgrade: empty pattern name generates timestamped fallback", () => {
  beforeEach(() => {
    mockIsECCEnabled.mockReturnValue(true);
    mockPrisma.agent.findUnique.mockResolvedValue({ eccEnabled: true });
  });

  it("generates auto-pattern-<timestamp> when LLM name normalizes to empty", async () => {
    mockGenerateText.mockResolvedValue({
      text: '{"name":"!!!","description":"All special chars"}',
    });

    await fireSdkLearnHook(record());

    const createCall = mockPrisma.instinct.create.mock.calls[0][0] as {
      data: { name: string };
    };
    expect(createCall.data.name).toMatch(/^auto-pattern-\d+$/);
  });

  it("handles LLM returning empty name string", async () => {
    mockGenerateText.mockResolvedValue({
      text: '{"name":"","description":"Empty name"}',
    });

    await fireSdkLearnHook(record());

    // Should throw from the "empty name" check and use task-derived fallback
    const createCall = mockPrisma.instinct.create.mock.calls[0][0] as {
      data: { name: string };
    };
    expect(createCall.data.name.length).toBeGreaterThan(0);
  });
});
