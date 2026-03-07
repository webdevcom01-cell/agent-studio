import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeFlow } from "../engine";
import type { RuntimeContext } from "../types";
import type { NodeType } from "@/types";

vi.mock("../handlers", () => ({
  getHandler: vi.fn(),
}));

vi.mock("../context", () => ({
  saveContext: vi.fn(),
  saveMessages: vi.fn(),
}));

import { getHandler } from "../handlers";

const mockedGetHandler = vi.mocked(getHandler);

function createContext(overrides?: Partial<RuntimeContext>): RuntimeContext {
  return {
    agentId: "agent-1",
    conversationId: "conv-1",
    flowContent: {
      nodes: [],
      edges: [],
      variables: [],
    },
    variables: {},
    currentNodeId: null,
    messageHistory: [],
    isNewConversation: false,
    ...overrides,
  };
}

describe("executeFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty message when flow has no nodes", async () => {
    const ctx = createContext();
    const result = await executeFlow(ctx);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toContain("empty");
    expect(result.waitingForInput).toBe(false);
  });

  it("executes a single node and returns messages", async () => {
    const ctx = createContext({
      flowContent: {
        nodes: [
          {
            id: "n1",
            type: "message",
            position: { x: 0, y: 0 },
            data: { message: "Hello!" },
          },
        ],
        edges: [],
        variables: [],
      },
    });

    mockedGetHandler.mockReturnValue(async () => ({
      messages: [{ role: "assistant" as const, content: "Hello!" }],
      nextNodeId: null,
      waitForInput: false,
    }));

    const result = await executeFlow(ctx);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toBe("Hello!");
    expect(result.waitingForInput).toBe(false);
  });

  it("follows edges between nodes", async () => {
    const ctx = createContext({
      flowContent: {
        nodes: [
          {
            id: "n1",
            type: "message",
            position: { x: 0, y: 0 },
            data: { message: "First" },
          },
          {
            id: "n2",
            type: "message",
            position: { x: 0, y: 100 },
            data: { message: "Second" },
          },
        ],
        edges: [{ id: "e1", source: "n1", target: "n2" }],
        variables: [],
      },
    });

    let callCount = 0;
    mockedGetHandler.mockReturnValue(async () => {
      callCount++;
      return {
        messages: [
          {
            role: "assistant" as const,
            content: callCount === 1 ? "First" : "Second",
          },
        ],
        nextNodeId: null,
        waitForInput: false,
      };
    });

    const result = await executeFlow(ctx);

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].content).toBe("First");
    expect(result.messages[1].content).toBe("Second");
  });

  it("stops when waitForInput is true", async () => {
    const ctx = createContext({
      flowContent: {
        nodes: [
          {
            id: "n1",
            type: "capture",
            position: { x: 0, y: 0 },
            data: {},
          },
        ],
        edges: [],
        variables: [],
      },
    });

    mockedGetHandler.mockReturnValue(async () => ({
      messages: [{ role: "assistant" as const, content: "What is your name?" }],
      nextNodeId: null,
      waitForInput: true,
    }));

    const result = await executeFlow(ctx);

    expect(result.waitingForInput).toBe(true);
    expect(result.messages).toHaveLength(1);
  });

  it("handles missing handler gracefully", async () => {
    const ctx = createContext({
      flowContent: {
        nodes: [
          {
            id: "n1",
            type: "message" as NodeType,
            position: { x: 0, y: 0 },
            data: {},
          },
        ],
        edges: [],
        variables: [],
      },
    });

    mockedGetHandler.mockReturnValue(null);

    const result = await executeFlow(ctx);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toContain("Unsupported node type");
    expect(result.waitingForInput).toBe(false);
  });

  it("breaks when MAX_ITERATIONS is reached", async () => {
    const nodes = Array.from({ length: 2 }, (_, i) => ({
      id: `n${i}`,
      type: "message" as NodeType,
      position: { x: 0, y: i * 100 },
      data: {},
    }));
    const edges = [
      { id: "e1", source: "n0", target: "n1" },
      { id: "e2", source: "n1", target: "n0" },
    ];

    const ctx = createContext({
      flowContent: { nodes, edges, variables: [] },
    });

    mockedGetHandler.mockReturnValue(async () => ({
      messages: [],
      nextNodeId: null,
      waitForInput: false,
    }));

    const result = await executeFlow(ctx);
    expect(result.waitingForInput).toBe(false);
  });

  it("detects circular flow and breaks loop after visiting node >5 times", async () => {
    const ctx = createContext({
      flowContent: {
        nodes: [
          { id: "n1", type: "message" as NodeType, position: { x: 0, y: 0 }, data: {} },
        ],
        edges: [{ id: "e1", source: "n1", target: "n1" }],
        variables: [],
      },
    });

    mockedGetHandler.mockReturnValue(async () => ({
      messages: [],
      nextNodeId: null,
      waitForInput: false,
    }));

    const result = await executeFlow(ctx);
    expect(result.messages.some((m) => m.content.includes("stuck in a loop"))).toBe(true);
    expect(result.waitingForInput).toBe(false);
  });

  it("handles node not found in flow", async () => {
    const ctx = createContext({
      currentNodeId: "nonexistent",
      flowContent: {
        nodes: [
          { id: "n1", type: "message" as NodeType, position: { x: 0, y: 0 }, data: {} },
        ],
        edges: [],
        variables: [],
      },
    });

    const result = await executeFlow(ctx);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toContain("error in the flow");
    expect(result.waitingForInput).toBe(false);
  });

  it("catches handler errors and continues", async () => {
    const ctx = createContext({
      flowContent: {
        nodes: [
          { id: "n1", type: "message" as NodeType, position: { x: 0, y: 0 }, data: {} },
          { id: "n2", type: "message" as NodeType, position: { x: 0, y: 100 }, data: {} },
        ],
        edges: [{ id: "e1", source: "n1", target: "n2" }],
        variables: [],
      },
    });

    let callCount = 0;
    mockedGetHandler.mockReturnValue(async () => {
      callCount++;
      if (callCount === 1) throw new Error("handler failed");
      return {
        messages: [{ role: "assistant" as const, content: "Recovered" }],
        nextNodeId: null,
        waitForInput: false,
      };
    });

    const result = await executeFlow(ctx);
    expect(result.messages.some((m) => m.content.includes("went wrong"))).toBe(true);
    expect(result.messages.some((m) => m.content === "Recovered")).toBe(true);
  });

  it("resumes flow with currentNodeId and userMessage", async () => {
    const ctx = createContext({
      currentNodeId: "n1",
      flowContent: {
        nodes: [
          { id: "n1", type: "capture" as NodeType, position: { x: 0, y: 0 }, data: {} },
        ],
        edges: [],
        variables: [],
      },
    });

    mockedGetHandler.mockReturnValue(async (_node, runtimeCtx) => {
      expect(runtimeCtx.isResuming).toBe(true);
      return {
        messages: [{ role: "assistant" as const, content: "Got it" }],
        nextNodeId: null,
        waitForInput: false,
      };
    });

    const result = await executeFlow(ctx, "user input");
    expect(result.messages).toHaveLength(1);
    expect(ctx.messageHistory.some((m) => m.role === "user" && m.content === "user input")).toBe(true);
    expect(ctx.isResuming).toBe(false);
  });

  it("trims messageHistory when exceeding MAX_HISTORY", async () => {
    const history = Array.from({ length: 110 }, (_, i) => ({
      role: "user" as const,
      content: `msg-${i}`,
    }));

    const ctx = createContext({
      messageHistory: history,
      flowContent: {
        nodes: [
          { id: "n1", type: "message" as NodeType, position: { x: 0, y: 0 }, data: {} },
        ],
        edges: [],
        variables: [],
      },
    });

    mockedGetHandler.mockReturnValue(async () => ({
      messages: [],
      nextNodeId: null,
      waitForInput: false,
    }));

    await executeFlow(ctx);
    expect(ctx.messageHistory.length).toBeLessThanOrEqual(100);
  });

  it("sets nextNodeId from handler result on waitForInput", async () => {
    const ctx = createContext({
      flowContent: {
        nodes: [
          { id: "n1", type: "capture" as NodeType, position: { x: 0, y: 0 }, data: {} },
          { id: "n2", type: "message" as NodeType, position: { x: 0, y: 100 }, data: {} },
        ],
        edges: [],
        variables: [],
      },
    });

    mockedGetHandler.mockReturnValue(async () => ({
      messages: [{ role: "assistant" as const, content: "Enter name" }],
      nextNodeId: "n2",
      waitForInput: true,
    }));

    const result = await executeFlow(ctx);
    expect(result.waitingForInput).toBe(true);
    expect(ctx.currentNodeId).toBe("n2");
  });

  it("merges updatedVariables into context", async () => {
    const ctx = createContext({
      variables: { existing: "value" },
      flowContent: {
        nodes: [
          { id: "n1", type: "set_variable" as NodeType, position: { x: 0, y: 0 }, data: {} },
        ],
        edges: [],
        variables: [],
      },
    });

    mockedGetHandler.mockReturnValue(async () => ({
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: { newVar: "hello" },
    }));

    await executeFlow(ctx);
    expect(ctx.variables).toEqual({ existing: "value", newVar: "hello" });
  });

  it("finds start node as node with no incoming edges", async () => {
    const ctx = createContext({
      flowContent: {
        nodes: [
          { id: "n2", type: "message" as NodeType, position: { x: 0, y: 100 }, data: {} },
          { id: "n1", type: "message" as NodeType, position: { x: 0, y: 0 }, data: {} },
        ],
        edges: [{ id: "e1", source: "n1", target: "n2" }],
        variables: [],
      },
    });

    mockedGetHandler.mockReturnValue(async () => ({
      messages: [{ role: "assistant" as const, content: "ok" }],
      nextNodeId: null,
      waitForInput: false,
    }));

    await executeFlow(ctx);
    expect(mockedGetHandler).toHaveBeenCalled();
  });

  it("falls back to first node when all nodes have incoming edges", async () => {
    const ctx = createContext({
      flowContent: {
        nodes: [
          { id: "n1", type: "message" as NodeType, position: { x: 0, y: 0 }, data: {} },
          { id: "n2", type: "message" as NodeType, position: { x: 0, y: 100 }, data: {} },
        ],
        edges: [
          { id: "e1", source: "n1", target: "n2" },
          { id: "e2", source: "n2", target: "n1" },
        ],
        variables: [],
      },
    });

    mockedGetHandler.mockReturnValue(async () => ({
      messages: [],
      nextNodeId: null,
      waitForInput: false,
    }));

    await executeFlow(ctx);
    expect(mockedGetHandler).toHaveBeenCalled();
  });

  it("adds handler messages to messageHistory", async () => {
    const ctx = createContext({
      flowContent: {
        nodes: [
          { id: "n1", type: "message" as NodeType, position: { x: 0, y: 0 }, data: {} },
        ],
        edges: [],
        variables: [],
      },
    });

    mockedGetHandler.mockReturnValue(async () => ({
      messages: [{ role: "assistant" as const, content: "Hello!" }],
      nextNodeId: null,
      waitForInput: false,
    }));

    await executeFlow(ctx);
    expect(ctx.messageHistory).toContainEqual({ role: "assistant", content: "Hello!" });
  });
});
