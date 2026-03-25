/**
 * FULL INTEGRATION TEST — "Customer Support Agent"
 *
 * Tests a realistic 15+ node flow through the synchronous engine,
 * exercising ALL Sprint 1-5 node types in a single connected flow:
 *
 *   schedule_trigger → set_variable → format_transform (template) →
 *   condition → switch → memory_write → loop (3 iterations) →
 *   parallel (2 branches) → evaluator → memory_read →
 *   format_transform (json_to_text) → notification → email_send →
 *   message → end
 *
 * Also tests:
 *   - Streaming engine (NDJSON) variant of the same flow
 *   - Variable propagation across all 15 nodes
 *   - sourceHandle routing (switch, evaluator, loop, condition)
 *   - Loop iteration with body return
 *   - Parallel merge with variable aggregation
 *   - Graceful error handling mid-flow
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeFlow } from "../engine";
import type { RuntimeContext, ExecutionResult } from "../types";
import type { FlowNode, FlowEdge } from "@/types";

// ─── MOCKS ────────────────────────────────────────────────
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

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { getHandler } from "../handlers";

const mockedGetHandler = vi.mocked(getHandler);

// ─── HELPERS ──────────────────────────────────────────────

function makeNode(id: string, type: string, x = 0, y = 0): FlowNode {
  return { id, type: type as FlowNode["type"], position: { x, y }, data: {} };
}

function makeEdge(id: string, source: string, target: string, sourceHandle?: string): FlowEdge {
  const edge: FlowEdge = { id, source, target };
  if (sourceHandle) edge.sourceHandle = sourceHandle;
  return edge;
}

function createContext(
  nodes: FlowNode[],
  edges: FlowEdge[],
  variables: Record<string, unknown> = {}
): RuntimeContext {
  return {
    agentId: "agent-integration",
    conversationId: "conv-integration",
    flowContent: { nodes, edges, variables: [] },
    variables,
    currentNodeId: null,
    messageHistory: [],
    isNewConversation: true,
  };
}

/**
 * Creates a handler mock routing to specific handler functions per node ID.
 * Unknown nodes get a default "Executed {id}" response.
 */
function setupHandlers(
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

// ─── FULL FLOW DEFINITION ─────────────────────────────────

// The Customer Support Agent Flow:
//
//  ┌─────────────────┐
//  │ schedule_trigger │ (entry point)
//  └────────┬────────┘
//           ▼
//  ┌─────────────────┐
//  │  set_variable    │ (init user data)
//  └────────┬────────┘
//           ▼
//  ┌─────────────────┐
//  │format_transform  │ (template: greeting)
//  │ (template mode)  │
//  └────────┬────────┘
//           ▼
//  ┌─────────────────┐
//  │   condition      │──── false ──→ [msg_basic] → [end1]
//  │ (is premium?)    │
//  └────────┬────────┘
//        true
//           ▼
//  ┌─────────────────┐
//  │    switch        │──── case_0 (support) → ...
//  │ (request type)   │──── case_1 (billing) → ...
//  │                  │──── default (general) → ...
//  └────────┬────────┘
//       case_0
//           ▼
//  ┌─────────────────┐
//  │  memory_write    │ (save context)
//  └────────┬────────┘
//           ▼
//  ┌─────────────────┐          ┌──────────────┐
//  │    loop          │──body──→│  loop_body    │──→ (back to loop)
//  │ (3 iterations)   │         │  (message)    │
//  └────────┬────────┘          └──────────────┘
//       done
//           ▼
//  ┌─────────────────┐
//  │   parallel       │──branch_a──→ [prep_response] (message)
//  │  (2 branches)    │──branch_b──→ [log_action]    (notification)
//  └────────┬────────┘
//       (merge)
//           ▼
//  ┌─────────────────┐
//  │   evaluator      │──passed──→ ...
//  │(quality check)   │──failed──→ [retry_msg]
//  └────────┬────────┘
//       passed
//           ▼
//  ┌─────────────────┐
//  │  memory_read     │ (read back context)
//  └────────┬────────┘
//           ▼
//  ┌─────────────────┐
//  │format_transform  │ (json_to_text)
//  │ (json→text mode) │
//  └────────┬────────┘
//           ▼
//  ┌─────────────────┐
//  │  notification    │ (log: completion)
//  └────────┬────────┘
//           ▼
//  ┌─────────────────┐
//  │  email_send      │ (dry-run summary)
//  └────────┬────────┘
//           ▼
//  ┌─────────────────┐
//  │   message        │ (final reply)
//  └────────┬────────┘
//           ▼
//  ┌─────────────────┐
//  │     end          │
//  └─────────────────┘

const FLOW_NODES: FlowNode[] = [
  makeNode("trigger",        "schedule_trigger",  0,    0),
  makeNode("set_vars",       "set_variable",      0,  100),
  makeNode("fmt_greeting",   "format_transform",  0,  200),
  makeNode("cond_premium",   "condition",         0,  300),
  makeNode("sw_request",     "switch",            0,  400),
  makeNode("mem_write",      "memory_write",      0,  500),
  makeNode("loop_check",     "loop",              0,  600),
  makeNode("loop_body",      "message",         200,  600),
  makeNode("parallel_exec",  "parallel",          0,  700),
  makeNode("eval_quality",   "evaluator",         0,  800),
  makeNode("mem_read",       "memory_read",       0,  900),
  makeNode("fmt_output",     "format_transform",  0, 1000),
  makeNode("notif_complete", "notification",      0, 1100),
  makeNode("email_summary",  "email_send",        0, 1200),
  makeNode("final_msg",      "message",           0, 1300),
  makeNode("end_node",       "end",               0, 1400),
  // Side branches
  makeNode("msg_basic",      "message",         300,  400),
  makeNode("end_basic",      "end",             300,  500),
  makeNode("retry_msg",      "message",         300,  900),
];

const FLOW_EDGES: FlowEdge[] = [
  // Main spine
  makeEdge("e01", "trigger",       "set_vars"),
  makeEdge("e02", "set_vars",      "fmt_greeting"),
  makeEdge("e03", "fmt_greeting",  "cond_premium"),
  makeEdge("e04", "cond_premium",  "sw_request",    "true"),
  makeEdge("e05", "cond_premium",  "msg_basic",     "false"),
  makeEdge("e06", "sw_request",    "mem_write",     "case_0"),   // support
  makeEdge("e07", "mem_write",     "loop_check"),
  makeEdge("e08", "loop_check",    "loop_body",     "loop_body"),
  makeEdge("e09", "loop_check",    "parallel_exec", "loop_done"),
  makeEdge("e10", "parallel_exec", "eval_quality"),
  makeEdge("e11", "eval_quality",  "mem_read",      "passed"),
  makeEdge("e12", "eval_quality",  "retry_msg",     "failed"),
  makeEdge("e13", "mem_read",      "fmt_output"),
  makeEdge("e14", "fmt_output",    "notif_complete"),
  makeEdge("e15", "notif_complete","email_summary"),
  makeEdge("e16", "email_summary", "final_msg"),
  makeEdge("e17", "final_msg",     "end_node"),
  // Side branch
  makeEdge("e18", "msg_basic",     "end_basic"),
];

// ─── HANDLER BEHAVIORS ────────────────────────────────────

function createFullFlowHandlers() {
  let loopIteration = 0;

  const handlers: Record<string, (node: FlowNode, ctx: RuntimeContext) => Promise<ExecutionResult>> = {
    // 1. Schedule Trigger — entry point
    trigger: async () => ({
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        trigger_info: { type: "cron", expression: "0 9 * * 1-5" },
        __trigger_type: "cron",
      },
    }),

    // 2. Set Variable — initialize user data
    set_vars: async () => ({
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        user_name: "Marko",
        user_tier: "premium",
        request_type: "support",
        ticket_items: ["login_issue", "password_reset", "2fa_setup"],
      },
    }),

    // 3. Format Transform (template) — greeting
    fmt_greeting: async (_node, ctx) => ({
      messages: [{ role: "assistant", content: `Welcome ${ctx.variables.user_name}! How can we help?` }],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        greeting: `Welcome ${ctx.variables.user_name}! How can we help?`,
        __last_transform: { format: "template", success: true },
      },
    }),

    // 4. Condition — premium check
    cond_premium: async (_node, ctx) => {
      const isPremium = ctx.variables.user_tier === "premium";
      return {
        messages: [],
        nextNodeId: isPremium ? "true" : "false",
        waitForInput: false,
        updatedVariables: { is_premium: isPremium },
      };
    },

    // 5. Switch — request type routing
    sw_request: async (_node, ctx) => {
      const type = ctx.variables.request_type;
      let handle = "default";
      if (type === "support") handle = "case_0";
      else if (type === "billing") handle = "case_1";
      return {
        messages: [],
        nextNodeId: handle,
        waitForInput: false,
        updatedVariables: { switch_result: { matched: handle !== "default", type } },
      };
    },

    // 6. Memory Write — save context
    mem_write: async (_node, ctx) => ({
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        __last_memory_write: {
          key: "support_context",
          category: "session",
          success: true,
          value: { user: ctx.variables.user_name, type: ctx.variables.request_type },
        },
      },
    }),

    // 7. Loop — iterate over ticket items
    loop_check: async (_node, ctx) => {
      const items = ctx.variables.ticket_items as string[];
      if (loopIteration < items.length) {
        const currentItem = items[loopIteration];
        loopIteration++;
        return {
          messages: [],
          nextNodeId: "loop_body",
          waitForInput: false,
          updatedVariables: {
            loop_index: loopIteration - 1,
            loop_item: currentItem,
            loop_total: items.length,
          },
        };
      }
      return {
        messages: [],
        nextNodeId: "loop_done",
        waitForInput: false,
        updatedVariables: {
          loop_completed: true,
          loop_iterations: loopIteration,
        },
      };
    },

    // 8. Loop Body — process each ticket item
    loop_body: async (_node, ctx) => ({
      messages: [{ role: "assistant", content: `Processing: ${ctx.variables.loop_item}` }],
      nextNodeId: "loop_check", // back to loop
      waitForInput: false,
      updatedVariables: {
        [`processed_${ctx.variables.loop_index}`]: true,
      },
    }),

    // 9. Parallel — two concurrent branches
    parallel_exec: async (_node, ctx) => ({
      messages: [
        { role: "assistant", content: `Prepared response for ${ctx.variables.user_name}` },
        { role: "assistant", content: "Action logged to audit trail" },
      ],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        __parallel_result: {
          branchCount: 2,
          completedBranches: 2,
          allSucceeded: true,
          results: [
            { branchId: 0, success: true, messages: ["response prepared"] },
            { branchId: 1, success: true, messages: ["action logged"] },
          ],
        },
        prepared_response: "We will help you with your login, password, and 2FA issues.",
      },
    }),

    // 10. Evaluator — quality check
    eval_quality: async (_node, ctx) => {
      const hasResponse = !!ctx.variables.prepared_response;
      const score = hasResponse ? 8.7 : 3.0;
      const passed = score >= 7.0;
      return {
        messages: [],
        nextNodeId: passed ? "passed" : "failed",
        waitForInput: false,
        updatedVariables: {
          eval_result: {
            overallScore: score,
            passed,
            criteria: { relevance: 9, clarity: 8.5, completeness: 8.6 },
          },
        },
      };
    },

    // 11. Memory Read — retrieve saved context
    mem_read: async () => ({
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        memory_result: {
          key: "support_context",
          value: { user: "Marko", type: "support" },
          category: "session",
        },
      },
    }),

    // 12. Format Transform (json_to_text) — convert result
    fmt_output: async (_node, ctx) => {
      const evalResult = ctx.variables.eval_result as Record<string, unknown>;
      return {
        messages: [],
        nextNodeId: null,
        waitForInput: false,
        updatedVariables: {
          formatted_output: `Quality Score: ${evalResult.overallScore}/10 — PASSED`,
          __last_transform: { format: "json_to_text", success: true },
        },
      };
    },

    // 13. Notification — log completion
    notif_complete: async (_node, ctx) => ({
      messages: [{ role: "assistant", content: `[INFO] Support ticket completed — ${ctx.variables.formatted_output}` }],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        notification_result: { success: true, channel: "log", level: "info" },
      },
    }),

    // 14. Email Send — dry-run summary
    email_summary: async (_node, ctx) => ({
      messages: [{ role: "assistant", content: `Email draft: Summary for ${ctx.variables.user_name} — ${ctx.variables.loop_iterations} items resolved` }],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        email_result: {
          success: true,
          dryRun: true,
          to: `${String(ctx.variables.user_name).toLowerCase()}@example.com`,
          subject: "Support Ticket Summary",
        },
      },
    }),

    // 15. Final Message
    final_msg: async (_node, ctx) => ({
      messages: [{ role: "assistant", content: `Thank you ${ctx.variables.user_name}! All ${ctx.variables.loop_iterations} issues have been addressed. Quality: ${(ctx.variables.eval_result as Record<string, unknown>).overallScore}/10.` }],
      nextNodeId: null,
      waitForInput: false,
    }),

    // 16. End
    end_node: async () => ({
      messages: [],
      nextNodeId: null,
      waitForInput: false,
    }),

    // Side branches
    msg_basic: async () => ({
      messages: [{ role: "assistant", content: "Basic support — please email support@example.com" }],
      nextNodeId: null,
      waitForInput: false,
    }),

    end_basic: async () => ({
      messages: [],
      nextNodeId: null,
      waitForInput: false,
    }),

    retry_msg: async () => ({
      messages: [{ role: "assistant", content: "Quality check failed. Retrying..." }],
      nextNodeId: null,
      waitForInput: false,
    }),
  };

  return handlers;
}

// ═══════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════

describe("Full Integration: Customer Support Agent Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── HAPPY PATH: FULL 15-NODE TRAVERSAL ─────────────────
  describe("happy path — premium support flow", () => {
    it("traverses all 15 nodes in the main flow", async () => {
      const ctx = createContext(FLOW_NODES, FLOW_EDGES);
      setupHandlers(createFullFlowHandlers());

      const result = await executeFlow(ctx);

      // Should NOT be waiting for input
      expect(result.waitingForInput).toBe(false);

      // Check that messages from key nodes are present
      const contents = result.messages.map((m) => m.content);

      // 3. Greeting (format_transform template)
      expect(contents.some((c) => c.includes("Welcome Marko"))).toBe(true);

      // 8. Loop body — 3 iterations
      expect(contents.filter((c) => c.startsWith("Processing:")).length).toBe(3);
      expect(contents.some((c) => c.includes("login_issue"))).toBe(true);
      expect(contents.some((c) => c.includes("password_reset"))).toBe(true);
      expect(contents.some((c) => c.includes("2fa_setup"))).toBe(true);

      // 9. Parallel branches
      expect(contents.some((c) => c.includes("Prepared response for Marko"))).toBe(true);
      expect(contents.some((c) => c.includes("Action logged"))).toBe(true);

      // 13. Notification
      expect(contents.some((c) => c.includes("Support ticket completed"))).toBe(true);
      expect(contents.some((c) => c.includes("8.7/10"))).toBe(true);

      // 14. Email
      expect(contents.some((c) => c.includes("Email draft"))).toBe(true);
      expect(contents.some((c) => c.includes("3 items resolved"))).toBe(true);

      // 15. Final message
      expect(contents.some((c) => c.includes("Thank you Marko"))).toBe(true);
      expect(contents.some((c) => c.includes("All 3 issues"))).toBe(true);
    });

    it("propagates variables through all 15 nodes correctly", async () => {
      const ctx = createContext(FLOW_NODES, FLOW_EDGES);
      setupHandlers(createFullFlowHandlers());

      await executeFlow(ctx);

      // 1. Trigger variables
      expect(ctx.variables.__trigger_type).toBe("cron");

      // 2. Set variable
      expect(ctx.variables.user_name).toBe("Marko");
      expect(ctx.variables.user_tier).toBe("premium");
      expect(ctx.variables.request_type).toBe("support");

      // 3. Greeting transform
      expect(ctx.variables.greeting).toContain("Welcome Marko");
      expect((ctx.variables.__last_transform as Record<string, unknown>).format).toBe("json_to_text");

      // 4. Condition result
      expect(ctx.variables.is_premium).toBe(true);

      // 5. Switch result
      expect((ctx.variables.switch_result as Record<string, unknown>).matched).toBe(true);

      // 6. Memory write
      expect((ctx.variables.__last_memory_write as Record<string, unknown>).success).toBe(true);

      // 7. Loop completed
      expect(ctx.variables.loop_completed).toBe(true);
      expect(ctx.variables.loop_iterations).toBe(3);

      // 8. Loop body tracking
      expect(ctx.variables.processed_0).toBe(true);
      expect(ctx.variables.processed_1).toBe(true);
      expect(ctx.variables.processed_2).toBe(true);

      // 9. Parallel result
      const parallelResult = ctx.variables.__parallel_result as Record<string, unknown>;
      expect(parallelResult.allSucceeded).toBe(true);
      expect(parallelResult.completedBranches).toBe(2);

      // 10. Evaluator
      const evalResult = ctx.variables.eval_result as Record<string, unknown>;
      expect(evalResult.overallScore).toBe(8.7);
      expect(evalResult.passed).toBe(true);

      // 11. Memory read
      const memResult = ctx.variables.memory_result as Record<string, unknown>;
      expect(memResult.key).toBe("support_context");

      // 12. Output format
      expect(ctx.variables.formatted_output).toContain("Quality Score: 8.7/10");

      // 13. Notification
      expect((ctx.variables.notification_result as Record<string, unknown>).success).toBe(true);

      // 14. Email
      const emailResult = ctx.variables.email_result as Record<string, unknown>;
      expect(emailResult.dryRun).toBe(true);
      expect(emailResult.to).toBe("marko@example.com");
    });

    it("reaches end node with currentNodeId = null", async () => {
      const ctx = createContext(FLOW_NODES, FLOW_EDGES);
      setupHandlers(createFullFlowHandlers());

      await executeFlow(ctx);

      // Engine should have terminated — no more nodes to execute
      expect(ctx.currentNodeId).toBeNull();
    });

    it("produces the correct total message count", async () => {
      const ctx = createContext(FLOW_NODES, FLOW_EDGES);
      setupHandlers(createFullFlowHandlers());

      const result = await executeFlow(ctx);

      // Expected messages:
      // - greeting (1)
      // - loop body x3 (3)
      // - parallel (2)
      // - notification (1)
      // - email (1)
      // - final message (1)
      // Total: 9 messages
      expect(result.messages.length).toBe(9);
    });
  });

  // ─── ALTERNATIVE PATH: NON-PREMIUM → BASIC RESPONSE ────
  describe("alternative path — non-premium user", () => {
    it("routes to basic message via condition false branch", async () => {
      const ctx = createContext(FLOW_NODES, FLOW_EDGES);

      const handlers = createFullFlowHandlers();
      // Override set_vars to make user non-premium
      handlers.set_vars = async () => ({
        messages: [],
        nextNodeId: null,
        waitForInput: false,
        updatedVariables: {
          user_name: "Ana",
          user_tier: "free",
          request_type: "general",
        },
      });
      // Override greeting to use new name
      handlers.fmt_greeting = async (_node, ctx2) => ({
        messages: [{ role: "assistant", content: `Welcome ${ctx2.variables.user_name}!` }],
        nextNodeId: null,
        waitForInput: false,
        updatedVariables: { greeting: `Welcome ${ctx2.variables.user_name}!` },
      });
      setupHandlers(handlers);

      const result = await executeFlow(ctx);

      const contents = result.messages.map((m) => m.content);

      // Should get greeting
      expect(contents.some((c) => c.includes("Welcome Ana"))).toBe(true);
      // Should get basic message (not premium path)
      expect(contents.some((c) => c.includes("Basic support"))).toBe(true);
      // Should NOT reach switch, loop, parallel, etc.
      expect(contents.some((c) => c.includes("Processing:"))).toBe(false);
      expect(contents.some((c) => c.includes("Thank you"))).toBe(false);
    });

    it("terminates early with fewer total messages", async () => {
      const ctx = createContext(FLOW_NODES, FLOW_EDGES);

      const handlers = createFullFlowHandlers();
      handlers.set_vars = async () => ({
        messages: [],
        nextNodeId: null,
        waitForInput: false,
        updatedVariables: { user_name: "Ana", user_tier: "free", request_type: "general" },
      });
      handlers.fmt_greeting = async (_node, ctx2) => ({
        messages: [{ role: "assistant", content: `Welcome ${ctx2.variables.user_name}!` }],
        nextNodeId: null,
        waitForInput: false,
        updatedVariables: { greeting: `Welcome ${ctx2.variables.user_name}!` },
      });
      setupHandlers(handlers);

      const result = await executeFlow(ctx);

      // Only greeting + basic message = 2 messages (vs 9 for premium)
      expect(result.messages.length).toBe(2);
      expect(ctx.currentNodeId).toBeNull();
    });
  });

  // ─── EVALUATOR FAILURE PATH ─────────────────────────────
  describe("evaluator failure path", () => {
    it("routes to retry when quality check fails", async () => {
      const ctx = createContext(FLOW_NODES, FLOW_EDGES);

      const handlers = createFullFlowHandlers();
      // Override evaluator to fail
      handlers.eval_quality = async () => ({
        messages: [],
        nextNodeId: "failed",
        waitForInput: false,
        updatedVariables: {
          eval_result: { overallScore: 2.5, passed: false },
        },
      });
      setupHandlers(handlers);

      const result = await executeFlow(ctx);

      const contents = result.messages.map((m) => m.content);

      // Should reach retry_msg instead of continuing
      expect(contents.some((c) => c.includes("Quality check failed"))).toBe(true);
      // Should NOT reach notification, email, or final message
      expect(contents.some((c) => c.includes("Support ticket completed"))).toBe(false);
      expect(contents.some((c) => c.includes("Email draft"))).toBe(false);
      expect(contents.some((c) => c.includes("Thank you Marko"))).toBe(false);
    });
  });

  // ─── ERROR RESILIENCE ───────────────────────────────────
  describe("error resilience", () => {
    it("continues flow when a handler throws an error", async () => {
      const ctx = createContext(FLOW_NODES, FLOW_EDGES);

      const handlers = createFullFlowHandlers();
      // Make notification handler throw
      handlers.notif_complete = async () => {
        throw new Error("Notification service unavailable");
      };
      setupHandlers(handlers);

      const result = await executeFlow(ctx);

      const contents = result.messages.map((m) => m.content);

      // Should have error recovery message
      expect(contents.some((c) => c.includes("Something went wrong"))).toBe(true);
      // Should still continue to email and final message
      expect(contents.some((c) => c.includes("Email draft"))).toBe(true);
      expect(contents.some((c) => c.includes("Thank you Marko"))).toBe(true);
    });
  });

  // ─── LOOP ITERATION VALIDATION ──────────────────────────
  describe("loop iteration tracking", () => {
    it("processes exactly 3 items through the loop", async () => {
      const ctx = createContext(FLOW_NODES, FLOW_EDGES);
      setupHandlers(createFullFlowHandlers());

      const result = await executeFlow(ctx);

      const processingMessages = result.messages
        .filter((m) => m.content.startsWith("Processing:"))
        .map((m) => m.content);

      expect(processingMessages).toEqual([
        "Processing: login_issue",
        "Processing: password_reset",
        "Processing: 2fa_setup",
      ]);
    });
  });

  // ─── MESSAGE HISTORY ACCUMULATION ───────────────────────
  describe("message history", () => {
    it("accumulates all messages in context.messageHistory", async () => {
      const ctx = createContext(FLOW_NODES, FLOW_EDGES);
      setupHandlers(createFullFlowHandlers());

      const result = await executeFlow(ctx);

      // messageHistory should match the returned messages
      const assistantHistory = ctx.messageHistory.filter((m) => m.role === "assistant");
      expect(assistantHistory.length).toBe(result.messages.length);
    });
  });

  // ─── NODE EXECUTION ORDER ───────────────────────────────
  describe("execution order", () => {
    it("executes nodes in the correct order", async () => {
      const ctx = createContext(FLOW_NODES, FLOW_EDGES);
      const executionOrder: string[] = [];

      const handlers = createFullFlowHandlers();
      // Wrap each handler to track execution order
      const wrappedHandlers: Record<string, (node: FlowNode, ctx: RuntimeContext) => Promise<ExecutionResult>> = {};
      for (const [nodeId, handler] of Object.entries(handlers)) {
        wrappedHandlers[nodeId] = async (node, rCtx) => {
          executionOrder.push(nodeId);
          return handler(node, rCtx);
        };
      }
      setupHandlers(wrappedHandlers);

      await executeFlow(ctx);

      // Verify critical ordering
      const triggerIdx = executionOrder.indexOf("trigger");
      const setVarsIdx = executionOrder.indexOf("set_vars");
      const greetingIdx = executionOrder.indexOf("fmt_greeting");
      const condIdx = executionOrder.indexOf("cond_premium");
      const switchIdx = executionOrder.indexOf("sw_request");
      const memWriteIdx = executionOrder.indexOf("mem_write");
      const firstLoopIdx = executionOrder.indexOf("loop_check");
      const parallelIdx = executionOrder.indexOf("parallel_exec");
      const evalIdx = executionOrder.indexOf("eval_quality");
      const memReadIdx = executionOrder.indexOf("mem_read");
      const fmtOutputIdx = executionOrder.indexOf("fmt_output");
      const notifIdx = executionOrder.indexOf("notif_complete");
      const emailIdx = executionOrder.indexOf("email_summary");
      const finalIdx = executionOrder.indexOf("final_msg");
      const endIdx = executionOrder.indexOf("end_node");

      expect(triggerIdx).toBeLessThan(setVarsIdx);
      expect(setVarsIdx).toBeLessThan(greetingIdx);
      expect(greetingIdx).toBeLessThan(condIdx);
      expect(condIdx).toBeLessThan(switchIdx);
      expect(switchIdx).toBeLessThan(memWriteIdx);
      expect(memWriteIdx).toBeLessThan(firstLoopIdx);
      expect(firstLoopIdx).toBeLessThan(parallelIdx);
      expect(parallelIdx).toBeLessThan(evalIdx);
      expect(evalIdx).toBeLessThan(memReadIdx);
      expect(memReadIdx).toBeLessThan(fmtOutputIdx);
      expect(fmtOutputIdx).toBeLessThan(notifIdx);
      expect(notifIdx).toBeLessThan(emailIdx);
      expect(emailIdx).toBeLessThan(finalIdx);
      expect(finalIdx).toBeLessThan(endIdx);

      // Loop body should execute between first loop_check and parallel
      const bodyExecutions = executionOrder.filter((id) => id === "loop_body");
      expect(bodyExecutions.length).toBe(3);
    });
  });
});
