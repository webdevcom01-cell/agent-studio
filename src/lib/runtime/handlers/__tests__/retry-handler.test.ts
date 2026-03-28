import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../index", () => ({
  getHandler: vi.fn(),
}));

import { retryHandler } from "../retry-handler";
import { getHandler } from "../index";
import type { RuntimeContext, NodeHandler } from "../../types";
import type { FlowNode, FlowContent } from "@/types";

const mockGetHandler = vi.mocked(getHandler);

function makeTargetNode(): FlowNode {
  return {
    id: "target-1",
    type: "api_call",
    position: { x: 0, y: 0 },
    data: { url: "https://api.example.com" },
  };
}

function makeNode(overrides: Record<string, unknown> = {}): FlowNode {
  return {
    id: "retry-1",
    type: "retry",
    position: { x: 0, y: 0 },
    data: {
      targetNodeId: "target-1",
      maxRetries: 2,
      baseDelayMs: 10,
      outputVariable: "result",
      ...overrides,
    },
  };
}

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: {
      nodes: [makeTargetNode()],
      edges: [],
      variables: [],
    } as FlowContent,
    currentNodeId: "retry-1",
    variables: {},
    messageHistory: [],
    isNewConversation: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("retryHandler", () => {
  it("returns error when no target node configured", async () => {
    const result = await retryHandler(
      makeNode({ targetNodeId: "" }),
      makeContext(),
    );
    expect(result.messages[0].content).toContain("no target node");
  });

  it("returns error when target node not found in flow", async () => {
    const result = await retryHandler(
      makeNode({ targetNodeId: "nonexistent" }),
      makeContext(),
    );
    expect(result.messages[0].content).toContain("not found");
  });

  it("returns error when no handler for target node type", async () => {
    mockGetHandler.mockReturnValueOnce(null);

    const result = await retryHandler(makeNode(), makeContext());
    expect(result.messages[0].content).toContain("no handler");
  });

  it("succeeds on first attempt without retrying", async () => {
    const handler: NodeHandler = vi.fn().mockResolvedValue({
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: { data: "success" },
    });
    mockGetHandler.mockReturnValueOnce(handler);

    const result = await retryHandler(makeNode(), makeContext());
    expect(result.updatedVariables?.data).toBe("success");
    expect(result.updatedVariables?.result_attempts).toBe(1);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("retries on error and succeeds", async () => {
    const handler: NodeHandler = vi.fn()
      .mockResolvedValueOnce({
        messages: [],
        nextNodeId: null,
        waitForInput: false,
        updatedVariables: { data: "[Error: timeout]" },
      })
      .mockResolvedValueOnce({
        messages: [],
        nextNodeId: null,
        waitForInput: false,
        updatedVariables: { data: "ok" },
      });
    mockGetHandler.mockReturnValue(handler);

    const result = await retryHandler(makeNode(), makeContext());
    expect(result.updatedVariables?.data).toBe("ok");
    expect(result.updatedVariables?.result_attempts).toBe(2);
  });

  it("exhausts retries and returns error", async () => {
    const handler: NodeHandler = vi.fn().mockResolvedValue({
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: { data: "[Error: always fails]" },
    });
    mockGetHandler.mockReturnValue(handler);

    const result = await retryHandler(makeNode(), makeContext());
    expect(result.updatedVariables?.result).toContain("[Error:");
    expect(result.updatedVariables?.result_attempts).toBe(3);
    expect(handler).toHaveBeenCalledTimes(3);
  });
});
