/**
 * STREAMING INTEGRATION TEST — Customer Support Agent via NDJSON stream
 *
 * Tests the same multi-node flow through executeFlowStreaming(),
 * verifying that:
 *   - NDJSON chunks are emitted correctly
 *   - Messages appear in real-time as stream chunks
 *   - The "done" chunk is emitted at the end
 *   - Variables propagate through the streaming engine
 *   - sourceHandle routing works (condition, switch, evaluator, loop)
 *   - Parallel streaming handler emits branch messages
 *   - Heartbeats are emitted for long-running nodes
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeFlowStreaming } from "../engine-streaming";
import { parseChunk } from "../stream-protocol";
import type { RuntimeContext, ExecutionResult, StreamChunk } from "../types";
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

// Mock AI streaming handler — won't be called since no ai_response nodes
vi.mock("../handlers/ai-response-streaming-handler", () => ({
  aiResponseStreamingHandler: vi.fn(),
}));

// Mock parallel streaming handler — simulate real-time output
vi.mock("../handlers/parallel-streaming-handler", () => ({
  parallelStreamingHandler: vi.fn(),
}));

import { getHandler } from "../handlers";
import { parallelStreamingHandler } from "../handlers/parallel-streaming-handler";

const mockedGetHandler = vi.mocked(getHandler);
const mockedParallelStreaming = vi.mocked(parallelStreamingHandler);

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
): RuntimeContext {
  return {
    agentId: "agent-stream-test",
    conversationId: "conv-stream-test",
    flowContent: { nodes, edges, variables: [] },
    variables: {},
    currentNodeId: null,
    messageHistory: [],
    isNewConversation: true,
  };
}

/**
 * Consume a ReadableStream and collect all parsed NDJSON chunks.
 */
async function collectStreamChunks(stream: ReadableStream<Uint8Array>): Promise<StreamChunk[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const chunks: StreamChunk[] = [];
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const chunk = parseChunk(line);
      if (chunk) chunks.push(chunk);
    }
  }

  // Process remaining buffer
  if (buffer.trim()) {
    const chunk = parseChunk(buffer);
    if (chunk) chunks.push(chunk);
  }

  return chunks;
}

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

// ─── FLOW DEFINITION (same structure, subset for streaming test) ───

const STREAM_NODES: FlowNode[] = [
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
  makeNode("notif_done",     "notification",      0,  900),
  makeNode("final_msg",      "message",           0, 1000),
  makeNode("end_node",       "end",               0, 1100),
  // Side branch
  makeNode("msg_basic",      "message",         300,  400),
  makeNode("end_basic",      "end",             300,  500),
  makeNode("retry_msg",      "message",         300,  900),
];

const STREAM_EDGES: FlowEdge[] = [
  makeEdge("e01", "trigger",       "set_vars"),
  makeEdge("e02", "set_vars",      "fmt_greeting"),
  makeEdge("e03", "fmt_greeting",  "cond_premium"),
  makeEdge("e04", "cond_premium",  "sw_request",    "true"),
  makeEdge("e05", "cond_premium",  "msg_basic",     "false"),
  makeEdge("e06", "sw_request",    "mem_write",     "case_0"),
  makeEdge("e07", "mem_write",     "loop_check"),
  makeEdge("e08", "loop_check",    "loop_body",     "loop_body"),
  makeEdge("e09", "loop_check",    "parallel_exec", "loop_done"),
  makeEdge("e10", "parallel_exec", "eval_quality"),
  makeEdge("e11", "eval_quality",  "notif_done",    "passed"),
  makeEdge("e12", "eval_quality",  "retry_msg",     "failed"),
  makeEdge("e13", "notif_done",    "final_msg"),
  makeEdge("e14", "final_msg",     "end_node"),
  makeEdge("e15", "msg_basic",     "end_basic"),
];

function createStreamingHandlers() {
  let loopIteration = 0;

  return {
    trigger: async (): Promise<ExecutionResult> => ({
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: { __trigger_type: "cron" },
    }),

    set_vars: async (): Promise<ExecutionResult> => ({
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        user_name: "Marko",
        user_tier: "premium",
        request_type: "support",
        ticket_items: ["issue_1", "issue_2"],
      },
    }),

    fmt_greeting: async (_n: FlowNode, ctx: RuntimeContext): Promise<ExecutionResult> => ({
      messages: [{ role: "assistant", content: `Hello ${ctx.variables.user_name}!` }],
      nextNodeId: null,
      waitForInput: false,
    }),

    cond_premium: async (_n: FlowNode, ctx: RuntimeContext): Promise<ExecutionResult> => ({
      messages: [],
      nextNodeId: ctx.variables.user_tier === "premium" ? "true" : "false",
      waitForInput: false,
    }),

    sw_request: async (): Promise<ExecutionResult> => ({
      messages: [],
      nextNodeId: "case_0",
      waitForInput: false,
    }),

    mem_write: async (): Promise<ExecutionResult> => ({
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: { __last_memory_write: { success: true } },
    }),

    loop_check: async (_n: FlowNode, ctx: RuntimeContext): Promise<ExecutionResult> => {
      const items = ctx.variables.ticket_items as string[];
      if (loopIteration < items.length) {
        loopIteration++;
        return {
          messages: [],
          nextNodeId: "loop_body",
          waitForInput: false,
          updatedVariables: { loop_index: loopIteration - 1, loop_item: items[loopIteration - 1] },
        };
      }
      return {
        messages: [],
        nextNodeId: "loop_done",
        waitForInput: false,
        updatedVariables: { loop_completed: true },
      };
    },

    loop_body: async (_n: FlowNode, ctx: RuntimeContext): Promise<ExecutionResult> => ({
      messages: [{ role: "assistant", content: `Handled: ${ctx.variables.loop_item}` }],
      nextNodeId: "loop_check",
      waitForInput: false,
    }),

    eval_quality: async (): Promise<ExecutionResult> => ({
      messages: [],
      nextNodeId: "passed",
      waitForInput: false,
      updatedVariables: { eval_result: { overallScore: 9.0, passed: true } },
    }),

    notif_done: async (): Promise<ExecutionResult> => ({
      messages: [{ role: "assistant", content: "Ticket resolved successfully" }],
      nextNodeId: null,
      waitForInput: false,
    }),

    final_msg: async (): Promise<ExecutionResult> => ({
      messages: [{ role: "assistant", content: "Thank you! All done." }],
      nextNodeId: null,
      waitForInput: false,
    }),

    end_node: async (): Promise<ExecutionResult> => ({
      messages: [],
      nextNodeId: null,
      waitForInput: false,
    }),

    msg_basic: async (): Promise<ExecutionResult> => ({
      messages: [{ role: "assistant", content: "Basic support only" }],
      nextNodeId: null,
      waitForInput: false,
    }),

    end_basic: async (): Promise<ExecutionResult> => ({
      messages: [],
      nextNodeId: null,
      waitForInput: false,
    }),

    retry_msg: async (): Promise<ExecutionResult> => ({
      messages: [{ role: "assistant", content: "Retrying..." }],
      nextNodeId: null,
      waitForInput: false,
    }),
  };
}

// ═══════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════

describe("Streaming Integration: Customer Support Agent Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits all message chunks through the stream", async () => {
    const ctx = createContext(STREAM_NODES, STREAM_EDGES);
    const handlers = createStreamingHandlers();
    setupHandlers(handlers);

    // Mock parallel streaming handler to emit messages via writer
    mockedParallelStreaming.mockImplementation(async (_node, _ctx, writer) => {
      writer.write({ type: "message", role: "assistant", content: "Branch A done" });
      writer.write({ type: "message", role: "assistant", content: "Branch B done" });
      return {
        messages: [
          { role: "assistant", content: "Branch A done" },
          { role: "assistant", content: "Branch B done" },
        ],
        nextNodeId: null,
        waitForInput: false,
        updatedVariables: { __parallel_result: { allSucceeded: true } },
      };
    });

    const stream = executeFlowStreaming(ctx);
    const chunks = await collectStreamChunks(stream);

    // Extract message chunks
    const messageChunks = chunks.filter((c): c is Extract<StreamChunk, { type: "message" }> => c.type === "message");
    const messageContents = messageChunks.map((c) => c.content);

    // Greeting
    expect(messageContents.some((c) => c.includes("Hello Marko"))).toBe(true);
    // Loop body x2
    expect(messageContents.filter((c) => c.startsWith("Handled:")).length).toBe(2);
    // Parallel branches
    expect(messageContents.some((c) => c === "Branch A done")).toBe(true);
    expect(messageContents.some((c) => c === "Branch B done")).toBe(true);
    // Notification
    expect(messageContents.some((c) => c.includes("Ticket resolved"))).toBe(true);
    // Final
    expect(messageContents.some((c) => c.includes("All done"))).toBe(true);
  });

  it("emits a done chunk at the end of the stream", async () => {
    const ctx = createContext(STREAM_NODES, STREAM_EDGES);
    setupHandlers(createStreamingHandlers());
    mockedParallelStreaming.mockImplementation(async () => ({
      messages: [],
      nextNodeId: null,
      waitForInput: false,
    }));

    const stream = executeFlowStreaming(ctx);
    const chunks = await collectStreamChunks(stream);

    const doneChunks = chunks.filter((c): c is Extract<StreamChunk, { type: "done" }> => c.type === "done");
    expect(doneChunks.length).toBe(1);
    expect(doneChunks[0].conversationId).toBe("conv-stream-test");
    expect(doneChunks[0].waitForInput).toBe(false);
  });

  it("emits heartbeat before parallel execution", async () => {
    const ctx = createContext(STREAM_NODES, STREAM_EDGES);
    setupHandlers(createStreamingHandlers());
    mockedParallelStreaming.mockImplementation(async () => ({
      messages: [{ role: "assistant", content: "Parallel done" }],
      nextNodeId: null,
      waitForInput: false,
    }));

    const stream = executeFlowStreaming(ctx);
    const chunks = await collectStreamChunks(stream);

    const heartbeats = chunks.filter((c) => c.type === "heartbeat");
    // At least one heartbeat before parallel
    expect(heartbeats.length).toBeGreaterThanOrEqual(1);
  });

  it("streams correct chunk ordering: messages before done", async () => {
    const ctx = createContext(STREAM_NODES, STREAM_EDGES);
    setupHandlers(createStreamingHandlers());
    mockedParallelStreaming.mockImplementation(async () => ({
      messages: [],
      nextNodeId: null,
      waitForInput: false,
    }));

    const stream = executeFlowStreaming(ctx);
    const chunks = await collectStreamChunks(stream);

    const doneIdx = chunks.findIndex((c) => c.type === "done");
    const lastMessageIdx = chunks.reduce(
      (max, c, idx) => (c.type === "message" ? idx : max),
      -1
    );

    // All messages should come before done
    expect(lastMessageIdx).toBeLessThan(doneIdx);
  });

  it("handles non-premium path through streaming engine", async () => {
    const ctx = createContext(STREAM_NODES, STREAM_EDGES);

    const handlers = createStreamingHandlers();
    handlers.set_vars = async (): Promise<ExecutionResult> => ({
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: { user_name: "Ana", user_tier: "free", request_type: "general" },
    });
    handlers.fmt_greeting = async (_n: FlowNode, ctx2: RuntimeContext): Promise<ExecutionResult> => ({
      messages: [{ role: "assistant", content: `Hello ${ctx2.variables.user_name}!` }],
      nextNodeId: null,
      waitForInput: false,
    });
    setupHandlers(handlers);

    const stream = executeFlowStreaming(ctx);
    const chunks = await collectStreamChunks(stream);

    const messageChunks = chunks.filter((c): c is Extract<StreamChunk, { type: "message" }> => c.type === "message");
    const contents = messageChunks.map((c) => c.content);

    expect(contents.some((c) => c.includes("Hello Ana"))).toBe(true);
    expect(contents.some((c) => c.includes("Basic support"))).toBe(true);
    // Should NOT have premium path messages
    expect(contents.some((c) => c.includes("Handled:"))).toBe(false);
  });

  it("parallel streaming handler receives the writer", async () => {
    const ctx = createContext(STREAM_NODES, STREAM_EDGES);
    setupHandlers(createStreamingHandlers());
    mockedParallelStreaming.mockImplementation(async (_node, _ctx, writer) => {
      // Verify writer is passed and functional
      writer.write({ type: "message", role: "assistant", content: "from parallel" });
      return {
        messages: [{ role: "assistant", content: "from parallel" }],
        nextNodeId: null,
        waitForInput: false,
      };
    });

    const stream = executeFlowStreaming(ctx);
    const chunks = await collectStreamChunks(stream);

    // Verify parallelStreamingHandler was called
    expect(mockedParallelStreaming).toHaveBeenCalledTimes(1);

    // Verify the writer argument (3rd parameter)
    const writerArg = mockedParallelStreaming.mock.calls[0][2];
    expect(writerArg).toBeDefined();
    expect(typeof writerArg.write).toBe("function");
    expect(typeof writerArg.close).toBe("function");

    // Verify the message came through
    const msgs = chunks.filter((c): c is Extract<StreamChunk, { type: "message" }> => c.type === "message");
    expect(msgs.some((c) => c.content === "from parallel")).toBe(true);
  });

  it("evaluator failure routes correctly in streaming mode", async () => {
    const ctx = createContext(STREAM_NODES, STREAM_EDGES);

    const handlers = createStreamingHandlers();
    handlers.eval_quality = async (): Promise<ExecutionResult> => ({
      messages: [],
      nextNodeId: "failed",
      waitForInput: false,
      updatedVariables: { eval_result: { overallScore: 2.0, passed: false } },
    });
    setupHandlers(handlers);
    mockedParallelStreaming.mockImplementation(async () => ({
      messages: [],
      nextNodeId: null,
      waitForInput: false,
    }));

    const stream = executeFlowStreaming(ctx);
    const chunks = await collectStreamChunks(stream);

    const msgs = chunks.filter((c): c is Extract<StreamChunk, { type: "message" }> => c.type === "message");
    const contents = msgs.map((c) => c.content);

    expect(contents.some((c) => c.includes("Retrying"))).toBe(true);
    expect(contents.some((c) => c.includes("Ticket resolved"))).toBe(false);
  });
});
