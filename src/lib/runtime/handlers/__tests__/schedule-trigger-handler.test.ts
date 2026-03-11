import { describe, it, expect, vi, beforeEach } from "vitest";
import { scheduleTriggerHandler } from "../schedule-trigger-handler";
import type { RuntimeContext } from "../../types";
import type { FlowNode } from "@/types";

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function makeNode(overrides: Partial<FlowNode["data"]> = {}): FlowNode {
  return {
    id: "sched-1",
    type: "schedule_trigger",
    position: { x: 0, y: 0 },
    data: {
      label: "Schedule Trigger",
      scheduleType: "manual",
      cronExpression: "",
      intervalMinutes: 60,
      timezone: "UTC",
      outputVariable: "trigger_info",
      ...overrides,
    },
  };
}

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    agentId: "agent-1",
    conversationId: "conv-1",
    variables: {},
    messageHistory: [],
    flowContent: { nodes: [], edges: [], variables: [] },
    currentNodeId: null,
    isNewConversation: false,
    ...overrides,
  };
}

describe("scheduleTriggerHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets trigger info for manual trigger", async () => {
    const result = await scheduleTriggerHandler(makeNode(), makeContext());

    expect(result.messages).toHaveLength(0);
    expect(result.waitForInput).toBe(false);

    const info = result.updatedVariables?.trigger_info as Record<string, unknown>;
    expect(info.type).toBe("manual");
    expect(info.triggeredAt).toBeDefined();
    expect(info.timezone).toBe("UTC");
    expect(result.updatedVariables?.__trigger_type).toBe("manual");
  });

  it("includes cron expression for cron type", async () => {
    const node = makeNode({
      scheduleType: "cron",
      cronExpression: "0 9 * * 1-5",
    });
    const result = await scheduleTriggerHandler(node, makeContext());

    const info = result.updatedVariables?.trigger_info as Record<string, unknown>;
    expect(info.type).toBe("cron");
    expect(info.cronExpression).toBe("0 9 * * 1-5");
  });

  it("includes interval minutes for interval type", async () => {
    const node = makeNode({
      scheduleType: "interval",
      intervalMinutes: 30,
    });
    const result = await scheduleTriggerHandler(node, makeContext());

    const info = result.updatedVariables?.trigger_info as Record<string, unknown>;
    expect(info.type).toBe("interval");
    expect(info.intervalMinutes).toBe(30);
  });

  it("uses custom output variable", async () => {
    const node = makeNode({ outputVariable: "my_trigger" });
    const result = await scheduleTriggerHandler(node, makeContext());

    expect(result.updatedVariables?.my_trigger).toBeDefined();
  });

  it("sets __trigger_time variable", async () => {
    const result = await scheduleTriggerHandler(makeNode(), makeContext());

    const triggerTime = result.updatedVariables?.__trigger_time as string;
    expect(triggerTime).toBeDefined();
    // Should be a valid ISO string
    expect(new Date(triggerTime).toISOString()).toBe(triggerTime);
  });

  it("uses custom timezone", async () => {
    const node = makeNode({ timezone: "America/New_York" });
    const result = await scheduleTriggerHandler(node, makeContext());

    const info = result.updatedVariables?.trigger_info as Record<string, unknown>;
    expect(info.timezone).toBe("America/New_York");
  });

  it("defaults interval to minimum 1 minute", async () => {
    const node = makeNode({
      scheduleType: "interval",
      intervalMinutes: -5,
    });
    const result = await scheduleTriggerHandler(node, makeContext());

    const info = result.updatedVariables?.trigger_info as Record<string, unknown>;
    expect(info.intervalMinutes).toBe(1);
  });

  it("does not include cronExpression for non-cron types", async () => {
    const node = makeNode({ scheduleType: "manual", cronExpression: "0 9 * * *" });
    const result = await scheduleTriggerHandler(node, makeContext());

    const info = result.updatedVariables?.trigger_info as Record<string, unknown>;
    expect(info.cronExpression).toBeUndefined();
  });

  it("does not include intervalMinutes for non-interval types", async () => {
    const node = makeNode({ scheduleType: "cron", intervalMinutes: 30 });
    const result = await scheduleTriggerHandler(node, makeContext());

    const info = result.updatedVariables?.trigger_info as Record<string, unknown>;
    expect(info.intervalMinutes).toBeUndefined();
  });
});
