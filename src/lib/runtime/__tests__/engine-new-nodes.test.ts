/**
 * Integration tests for new node types (Sprint 1-5) through the flow engine.
 *
 * These tests verify multi-node flows execute correctly end-to-end,
 * including edge traversal, variable propagation, and sourceHandle routing.
 *
 * All handlers are mocked to simulate their real behavior patterns
 * without external dependencies (DB, AI APIs, network).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeFlow } from "../engine";
import type { RuntimeContext, ExecutionResult } from "../types";
import type { FlowNode } from "@/types";

vi.mock("../handlers", () => ({
  getHandler: vi.fn(),
}));

vi.mock("../context", () => ({
  saveContext: vi.fn(),
  saveMessages: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: {
      create: vi.fn(),
    },
  },
}));

import { getHandler } from "../handlers";

const mockedGetHandler = vi.mocked(getHandler);

function createContext(overrides?: Partial<RuntimeContext>): RuntimeContext {
  return {
    agentId: "agent-1",
    conversationId: "conv-1",
    flowContent: { nodes: [], edges: [], variables: [] },
    variables: {},
    currentNodeId: null,
    messageHistory: [],
    isNewConversation: false,
    ...overrides,
  };
}

/**
 * Creates a handler mock that returns different results based on the node ID.
 * Simulates real handler behavior for multi-node flow testing.
 */
function createHandlerMap(
  handlerMap: Record<string, (node: FlowNode, ctx: RuntimeContext) => Promise<ExecutionResult>>
) {
  mockedGetHandler.mockReturnValue(async (node: FlowNode, ctx: RuntimeContext) => {
    const handler = handlerMap[node.id];
    if (handler) return handler(node, ctx);
    return {
      messages: [{ role: "assistant" as const, content: `Executed ${node.id}` }],
      nextNodeId: null,
      waitForInput: false,
    };
  });
}

describe("Integration: New Node Types through Flow Engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── SWITCH NODE ROUTING ─────────────────────────────────────
  describe("switch node routing", () => {
    it("routes to matched case via sourceHandle", async () => {
      const ctx = createContext({
        flowContent: {
          nodes: [
            { id: "sw1", type: "switch" as const, position: { x: 0, y: 0 }, data: {} },
            { id: "opt-a", type: "message" as const, position: { x: -100, y: 100 }, data: {} },
            { id: "opt-b", type: "message" as const, position: { x: 100, y: 100 }, data: {} },
            { id: "fallback", type: "message" as const, position: { x: 200, y: 100 }, data: {} },
          ],
          edges: [
            { id: "e1", source: "sw1", target: "opt-a", sourceHandle: "case_0" },
            { id: "e2", source: "sw1", target: "opt-b", sourceHandle: "case_1" },
            { id: "e3", source: "sw1", target: "fallback", sourceHandle: "default" },
          ],
          variables: [],
        },
      });

      createHandlerMap({
        sw1: async () => ({
          messages: [],
          nextNodeId: "case_1", // matched case_1
          waitForInput: false,
          updatedVariables: { switch_result: { matched: true, caseIndex: 1 } },
        }),
        "opt-b": async () => ({
          messages: [{ role: "assistant", content: "Reached Option B!" }],
          nextNodeId: null,
          waitForInput: false,
        }),
      });

      const result = await executeFlow(ctx);

      expect(result.messages.some((m) => m.content === "Reached Option B!")).toBe(true);
      // Should NOT reach opt-a or fallback
      expect(result.messages.some((m) => m.content.includes("opt-a"))).toBe(false);
    });

    it("routes to default when no case matches", async () => {
      const ctx = createContext({
        flowContent: {
          nodes: [
            { id: "sw1", type: "switch" as const, position: { x: 0, y: 0 }, data: {} },
            { id: "opt-a", type: "message" as const, position: { x: -100, y: 100 }, data: {} },
            { id: "fallback", type: "message" as const, position: { x: 100, y: 100 }, data: {} },
          ],
          edges: [
            { id: "e1", source: "sw1", target: "opt-a", sourceHandle: "case_0" },
            { id: "e2", source: "sw1", target: "fallback", sourceHandle: "default" },
          ],
          variables: [],
        },
      });

      createHandlerMap({
        sw1: async () => ({
          messages: [],
          nextNodeId: "default",
          waitForInput: false,
          updatedVariables: { switch_result: { matched: false } },
        }),
        fallback: async () => ({
          messages: [{ role: "assistant", content: "Default path taken" }],
          nextNodeId: null,
          waitForInput: false,
        }),
      });

      const result = await executeFlow(ctx);

      expect(result.messages.some((m) => m.content === "Default path taken")).toBe(true);
    });
  });

  // ─── FORMAT TRANSFORM → SWITCH CHAIN ─────────────────────────
  describe("format_transform → switch chain", () => {
    it("transforms data then routes based on result", async () => {
      const ctx = createContext({
        flowContent: {
          nodes: [
            { id: "fmt1", type: "format_transform" as const, position: { x: 0, y: 0 }, data: {} },
            { id: "sw1", type: "switch" as const, position: { x: 0, y: 100 }, data: {} },
            { id: "high", type: "message" as const, position: { x: -100, y: 200 }, data: {} },
            { id: "low", type: "message" as const, position: { x: 100, y: 200 }, data: {} },
          ],
          edges: [
            { id: "e1", source: "fmt1", target: "sw1" },
            { id: "e2", source: "sw1", target: "high", sourceHandle: "case_0" },
            { id: "e3", source: "sw1", target: "low", sourceHandle: "default" },
          ],
          variables: [],
        },
      });

      createHandlerMap({
        fmt1: async () => ({
          messages: [],
          nextNodeId: null,
          waitForInput: false,
          updatedVariables: { transform_result: "HIGH_PRIORITY", __last_transform: { format: "uppercase", success: true } },
        }),
        sw1: async (_node, runtimeCtx) => {
          // Simulate switch reading the transformed value
          const value = runtimeCtx.variables.transform_result as string;
          const matched = value === "HIGH_PRIORITY";
          return {
            messages: [],
            nextNodeId: matched ? "case_0" : "default",
            waitForInput: false,
            updatedVariables: { switch_result: { matched, value } },
          };
        },
        high: async () => ({
          messages: [{ role: "assistant", content: "🔴 High priority detected!" }],
          nextNodeId: null,
          waitForInput: false,
        }),
      });

      const result = await executeFlow(ctx);

      expect(result.messages.some((m) => m.content.includes("High priority"))).toBe(true);
    });
  });

  // ─── LOOP → MESSAGE CHAIN ────────────────────────────────────
  describe("loop node execution", () => {
    it("executes loop body multiple iterations via state tracking", async () => {
      const ctx = createContext({
        flowContent: {
          nodes: [
            { id: "loop1", type: "loop" as const, position: { x: 0, y: 0 }, data: {} },
            { id: "body1", type: "message" as const, position: { x: 0, y: 100 }, data: {} },
            { id: "done", type: "message" as const, position: { x: 0, y: 200 }, data: {} },
          ],
          edges: [
            { id: "e1", source: "loop1", target: "body1", sourceHandle: "loop_body" },
            { id: "e2", source: "loop1", target: "done", sourceHandle: "loop_done" },
          ],
          variables: [],
        },
      });

      let loopCall = 0;
      createHandlerMap({
        loop1: async () => {
          loopCall++;
          // First 2 calls: continue loop. Third call: done.
          if (loopCall <= 2) {
            return {
              messages: [],
              nextNodeId: "loop_body",
              waitForInput: false,
              updatedVariables: { loop_index: loopCall - 1 },
            };
          }
          return {
            messages: [],
            nextNodeId: "loop_done",
            waitForInput: false,
            updatedVariables: { loop_index: loopCall - 1 },
          };
        },
        body1: async (_node, runtimeCtx) => ({
          messages: [{ role: "assistant", content: `Iteration ${runtimeCtx.variables.loop_index}` }],
          nextNodeId: "loop1", // go back to loop
          waitForInput: false,
        }),
        done: async () => ({
          messages: [{ role: "assistant", content: "Loop finished!" }],
          nextNodeId: null,
          waitForInput: false,
        }),
      });

      const result = await executeFlow(ctx);

      expect(result.messages.some((m) => m.content === "Iteration 0")).toBe(true);
      expect(result.messages.some((m) => m.content === "Iteration 1")).toBe(true);
      expect(result.messages.some((m) => m.content === "Loop finished!")).toBe(true);
    });
  });

  // ─── EVALUATOR → BRANCHING (PASS/FAIL) ──────────────────────
  describe("evaluator branching", () => {
    it("routes to passed branch on high score", async () => {
      const ctx = createContext({
        flowContent: {
          nodes: [
            { id: "eval1", type: "evaluator" as const, position: { x: 0, y: 0 }, data: {} },
            { id: "pass", type: "message" as const, position: { x: -100, y: 100 }, data: {} },
            { id: "fail", type: "message" as const, position: { x: 100, y: 100 }, data: {} },
          ],
          edges: [
            { id: "e1", source: "eval1", target: "pass", sourceHandle: "passed" },
            { id: "e2", source: "eval1", target: "fail", sourceHandle: "failed" },
          ],
          variables: [],
        },
      });

      createHandlerMap({
        eval1: async () => ({
          messages: [],
          nextNodeId: "passed",
          waitForInput: false,
          updatedVariables: { eval_result: { overallScore: 8.5, passed: true } },
        }),
        pass: async () => ({
          messages: [{ role: "assistant", content: "Content approved! ✅" }],
          nextNodeId: null,
          waitForInput: false,
        }),
      });

      const result = await executeFlow(ctx);

      expect(result.messages.some((m) => m.content.includes("approved"))).toBe(true);
    });

    it("routes to failed branch on low score", async () => {
      const ctx = createContext({
        flowContent: {
          nodes: [
            { id: "eval1", type: "evaluator" as const, position: { x: 0, y: 0 }, data: {} },
            { id: "pass", type: "message" as const, position: { x: -100, y: 100 }, data: {} },
            { id: "fail", type: "message" as const, position: { x: 100, y: 100 }, data: {} },
          ],
          edges: [
            { id: "e1", source: "eval1", target: "pass", sourceHandle: "passed" },
            { id: "e2", source: "eval1", target: "fail", sourceHandle: "failed" },
          ],
          variables: [],
        },
      });

      createHandlerMap({
        eval1: async () => ({
          messages: [],
          nextNodeId: "failed",
          waitForInput: false,
          updatedVariables: { eval_result: { overallScore: 3.2, passed: false } },
        }),
        fail: async () => ({
          messages: [{ role: "assistant", content: "Content needs improvement ❌" }],
          nextNodeId: null,
          waitForInput: false,
        }),
      });

      const result = await executeFlow(ctx);

      expect(result.messages.some((m) => m.content.includes("needs improvement"))).toBe(true);
    });
  });

  // ─── MEMORY WRITE → MEMORY READ CHAIN ───────────────────────
  describe("memory write → read chain", () => {
    it("writes to memory then reads it back", async () => {
      const ctx = createContext({
        flowContent: {
          nodes: [
            { id: "mw1", type: "memory_write" as const, position: { x: 0, y: 0 }, data: {} },
            { id: "mr1", type: "memory_read" as const, position: { x: 0, y: 100 }, data: {} },
            { id: "msg1", type: "message" as const, position: { x: 0, y: 200 }, data: {} },
          ],
          edges: [
            { id: "e1", source: "mw1", target: "mr1" },
            { id: "e2", source: "mr1", target: "msg1" },
          ],
          variables: [],
        },
      });

      createHandlerMap({
        mw1: async () => ({
          messages: [],
          nextNodeId: null,
          waitForInput: false,
          updatedVariables: {
            __last_memory_write: { key: "user_preference", category: "settings", success: true },
          },
        }),
        mr1: async () => ({
          messages: [],
          nextNodeId: null,
          waitForInput: false,
          updatedVariables: {
            memory_result: { key: "user_preference", value: "dark_mode", category: "settings" },
          },
        }),
        msg1: async (_node, runtimeCtx) => {
          const mem = runtimeCtx.variables.memory_result as Record<string, unknown>;
          return {
            messages: [{ role: "assistant", content: `Your preference: ${mem?.value}` }],
            nextNodeId: null,
            waitForInput: false,
          };
        },
      });

      const result = await executeFlow(ctx);

      expect(result.messages.some((m) => m.content.includes("dark_mode"))).toBe(true);
    });
  });

  // ─── SCHEDULE TRIGGER → EMAIL SEND ───────────────────────────
  describe("schedule_trigger → email_send chain", () => {
    it("trigger starts flow then sends email notification", async () => {
      const ctx = createContext({
        flowContent: {
          nodes: [
            { id: "trig1", type: "schedule_trigger" as const, position: { x: 0, y: 0 }, data: {} },
            { id: "email1", type: "email_send" as const, position: { x: 0, y: 100 }, data: {} },
            { id: "end1", type: "end" as const, position: { x: 0, y: 200 }, data: {} },
          ],
          edges: [
            { id: "e1", source: "trig1", target: "email1" },
            { id: "e2", source: "email1", target: "end1" },
          ],
          variables: [],
        },
      });

      createHandlerMap({
        trig1: async () => ({
          messages: [],
          nextNodeId: null,
          waitForInput: false,
          updatedVariables: {
            trigger_info: { type: "cron", time: "2026-03-11T09:00:00Z" },
            __trigger_type: "cron",
          },
        }),
        email1: async () => ({
          messages: [{ role: "assistant", content: "📧 Email sent to team@example.com" }],
          nextNodeId: null,
          waitForInput: false,
          updatedVariables: {
            email_result: { success: true, recipients: ["team@example.com"] },
          },
        }),
        end1: async () => ({
          messages: [{ role: "assistant", content: "Flow complete." }],
          nextNodeId: null,
          waitForInput: false,
        }),
      });

      const result = await executeFlow(ctx);

      expect(result.messages.some((m) => m.content.includes("Email sent"))).toBe(true);
      expect(result.messages.some((m) => m.content.includes("Flow complete"))).toBe(true);
    });
  });

  // ─── NOTIFICATION WITH DIFFERENT CHANNELS ────────────────────
  describe("notification node in flow", () => {
    it("sends notification then continues to next node", async () => {
      const ctx = createContext({
        flowContent: {
          nodes: [
            { id: "notif1", type: "notification" as const, position: { x: 0, y: 0 }, data: {} },
            { id: "msg1", type: "message" as const, position: { x: 0, y: 100 }, data: {} },
          ],
          edges: [{ id: "e1", source: "notif1", target: "msg1" }],
          variables: [],
        },
      });

      createHandlerMap({
        notif1: async () => ({
          messages: [{ role: "assistant", content: "⚠️ [WARNING] Disk space low" }],
          nextNodeId: null,
          waitForInput: false,
          updatedVariables: {
            notification_result: { success: true, channel: "log", level: "warning" },
          },
        }),
        msg1: async () => ({
          messages: [{ role: "assistant", content: "Monitoring continues..." }],
          nextNodeId: null,
          waitForInput: false,
        }),
      });

      const result = await executeFlow(ctx);

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].content).toContain("WARNING");
      expect(result.messages[1].content).toContain("Monitoring continues");
    });
  });

  // ─── COMPLEX: FORMAT → SWITCH → EVALUATOR → NOTIFICATION ────
  describe("complex multi-node pipeline", () => {
    it("transforms → routes → evaluates → notifies", async () => {
      const ctx = createContext({
        flowContent: {
          nodes: [
            { id: "fmt1", type: "format_transform" as const, position: { x: 0, y: 0 }, data: {} },
            { id: "sw1", type: "switch" as const, position: { x: 0, y: 100 }, data: {} },
            { id: "eval1", type: "evaluator" as const, position: { x: 0, y: 200 }, data: {} },
            { id: "notif1", type: "notification" as const, position: { x: 0, y: 300 }, data: {} },
            { id: "skip", type: "message" as const, position: { x: 200, y: 200 }, data: {} },
          ],
          edges: [
            { id: "e1", source: "fmt1", target: "sw1" },
            { id: "e2", source: "sw1", target: "eval1", sourceHandle: "case_0" },
            { id: "e3", source: "sw1", target: "skip", sourceHandle: "default" },
            { id: "e4", source: "eval1", target: "notif1", sourceHandle: "passed" },
          ],
          variables: [],
        },
      });

      createHandlerMap({
        fmt1: async () => ({
          messages: [],
          nextNodeId: null,
          waitForInput: false,
          updatedVariables: { transform_result: '{"type":"report","content":"Q1 results are excellent"}' },
        }),
        sw1: async () => ({
          messages: [],
          nextNodeId: "case_0", // type=report → go to evaluator
          waitForInput: false,
        }),
        eval1: async () => ({
          messages: [],
          nextNodeId: "passed", // score > threshold
          waitForInput: false,
          updatedVariables: { eval_result: { overallScore: 9.0, passed: true } },
        }),
        notif1: async () => ({
          messages: [{ role: "assistant", content: "✅ Report published and team notified!" }],
          nextNodeId: null,
          waitForInput: false,
        }),
      });

      const result = await executeFlow(ctx);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toContain("Report published");
    });
  });

  // ─── VARIABLE PROPAGATION ACROSS NODES ───────────────────────
  describe("variable propagation", () => {
    it("variables set by one node are available to the next", async () => {
      const ctx = createContext({
        flowContent: {
          nodes: [
            { id: "fmt1", type: "format_transform" as const, position: { x: 0, y: 0 }, data: {} },
            { id: "msg1", type: "message" as const, position: { x: 0, y: 100 }, data: {} },
          ],
          edges: [{ id: "e1", source: "fmt1", target: "msg1" }],
          variables: [],
        },
      });

      createHandlerMap({
        fmt1: async () => ({
          messages: [],
          nextNodeId: null,
          waitForInput: false,
          updatedVariables: { formatted_data: "HELLO WORLD", __last_transform: { format: "uppercase" } },
        }),
        msg1: async (_node, runtimeCtx) => ({
          messages: [{ role: "assistant", content: `Result: ${runtimeCtx.variables.formatted_data}` }],
          nextNodeId: null,
          waitForInput: false,
        }),
      });

      const result = await executeFlow(ctx);

      expect(result.messages.some((m) => m.content === "Result: HELLO WORLD")).toBe(true);
    });
  });
});
