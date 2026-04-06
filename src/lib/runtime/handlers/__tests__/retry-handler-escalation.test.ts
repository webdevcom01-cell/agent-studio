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
    type: "ai_response",
    position: { x: 0, y: 0 },
    data: { prompt: "Generate code. {{__retry_escalation}}" },
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
      baseDelayMs: 0,
      outputVariable: "result",
      enableEscalation: true,
      prGateVariable: "gateResult",
      sandboxErrorsVariable: "sandboxErrors",
      projectContextVariable: "projectContext",
      codeExamplesVariable: "codeExamples",
      failureVariable: "sandboxResult",
      failureValues: ["FAIL", "BLOCK"],
      ...overrides,
    },
  };
}

function makeContext(variables: Record<string, unknown> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: {
      nodes: [makeTargetNode()],
      edges: [],
      variables: [],
    } as FlowContent,
    currentNodeId: "retry-1",
    variables,
    messageHistory: [],
    isNewConversation: true,
  } as unknown as RuntimeContext;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("retryHandler — escalation feedback loop", () => {
  it("first attempt receives no escalation context (attempt 0)", async () => {
    let capturedVariables: Record<string, unknown> | undefined;

    const handler: NodeHandler = vi.fn().mockImplementation((_node, ctx) => {
      capturedVariables = ctx.variables;
      return Promise.resolve({
        messages: [],
        nextNodeId: null,
        waitForInput: false,
        updatedVariables: { data: "ok" },
      });
    });
    mockGetHandler.mockReturnValue(handler);

    await retryHandler(makeNode(), makeContext({ projectContext: "rules" }));

    expect(capturedVariables?.__retry_escalation).toBeUndefined();
    expect(capturedVariables?.__retry_attempt).toBeUndefined();
  });

  it("retry 1 prompt contains PR Gate fixes", async () => {
    const prGateResult = {
      decision: "BLOCK",
      compositeScore: 43,
      issues: [
        {
          severity: "HIGH",
          category: "convention",
          file: "src/route.ts",
          line: 5,
          message: "Import from @prisma/client",
          fix: "Change to import from '@/generated/prisma'",
        },
      ],
    };

    let attempt1Variables: Record<string, unknown> | undefined;
    const handler: NodeHandler = vi.fn()
      .mockImplementationOnce((_node, ctx) => {
        return Promise.resolve({
          messages: [],
          nextNodeId: null,
          waitForInput: false,
          updatedVariables: { sandboxResult: "FAIL" },
        });
      })
      .mockImplementationOnce((_node, ctx) => {
        attempt1Variables = ctx.variables;
        return Promise.resolve({
          messages: [],
          nextNodeId: null,
          waitForInput: false,
          updatedVariables: { data: "ok" },
        });
      });
    mockGetHandler.mockReturnValue(handler);

    await retryHandler(
      makeNode(),
      makeContext({ gateResult: prGateResult, projectContext: "Use logger." }),
    );

    expect(attempt1Variables?.__retry_attempt).toBe(1);
    const escalation = attempt1Variables?.__retry_escalation as string;
    expect(escalation).toContain("PR Gate Issues");
    expect(escalation).toContain("Change to import from '@/generated/prisma'");
    expect(escalation).toContain("src/route.ts:5");
  });

  it("retry 1 prompt contains project context", async () => {
    let attempt1Variables: Record<string, unknown> | undefined;
    const handler: NodeHandler = vi.fn()
      .mockImplementationOnce(() =>
        Promise.resolve({
          messages: [],
          nextNodeId: null,
          waitForInput: false,
          updatedVariables: { sandboxResult: "FAIL" },
        })
      )
      .mockImplementationOnce((_node, ctx) => {
        attempt1Variables = ctx.variables;
        return Promise.resolve({
          messages: [],
          nextNodeId: null,
          waitForInput: false,
          updatedVariables: { data: "ok" },
        });
      });
    mockGetHandler.mockReturnValue(handler);

    await retryHandler(
      makeNode(),
      makeContext({ projectContext: "No any types. Use logger." }),
    );

    const escalation = attempt1Variables?.__retry_escalation as string;
    expect(escalation).toContain("Project Conventions");
    expect(escalation).toContain("No any types. Use logger.");
  });

  it("retry 2 contains sandbox errors", async () => {
    let attempt2Variables: Record<string, unknown> | undefined;
    const handler: NodeHandler = vi.fn()
      .mockImplementation((_node, ctx) => {
        if ((ctx.variables.__retry_attempt as number) >= 2) {
          attempt2Variables = ctx.variables;
          return Promise.resolve({
            messages: [],
            nextNodeId: null,
            waitForInput: false,
            updatedVariables: { data: "ok" },
          });
        }
        return Promise.resolve({
          messages: [],
          nextNodeId: null,
          waitForInput: false,
          updatedVariables: { sandboxResult: "FAIL" },
        });
      });
    mockGetHandler.mockReturnValue(handler);

    await retryHandler(
      makeNode(),
      makeContext({
        sandboxErrors: ["src/route.ts:3 — No any types", "src/route.ts:7 — Use logger"],
      }),
    );

    const escalation = attempt2Variables?.__retry_escalation as string;
    expect(escalation).toContain("Sandbox Verification Errors");
    expect(escalation).toContain("src/route.ts:3 — No any types");
    expect(escalation).toContain("src/route.ts:7 — Use logger");
  });

  it("retry 2 contains code examples", async () => {
    let attempt2Variables: Record<string, unknown> | undefined;
    const handler: NodeHandler = vi.fn()
      .mockImplementation((_node, ctx) => {
        if ((ctx.variables.__retry_attempt as number) >= 2) {
          attempt2Variables = ctx.variables;
          return Promise.resolve({
            messages: [],
            nextNodeId: null,
            waitForInput: false,
            updatedVariables: { data: "ok" },
          });
        }
        return Promise.resolve({
          messages: [],
          nextNodeId: null,
          waitForInput: false,
          updatedVariables: { sandboxResult: "FAIL" },
        });
      });
    mockGetHandler.mockReturnValue(handler);

    await retryHandler(
      makeNode(),
      makeContext({ codeExamples: "// Example route\nexport async function GET() {}" }),
    );

    const escalation = attempt2Variables?.__retry_escalation as string;
    expect(escalation).toContain("Reference Code Examples");
    expect(escalation).toContain("// Example route");
  });

  it("detects failure via failureVariable (structured failure)", async () => {
    const handler: NodeHandler = vi.fn().mockResolvedValue({
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: { sandboxResult: "FAIL" },
    });
    mockGetHandler.mockReturnValue(handler);

    const result = await retryHandler(makeNode(), makeContext());

    expect(result.updatedVariables?.result).toContain("[Error:");
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it("detects BLOCK as failure via failureValues", async () => {
    const handler: NodeHandler = vi.fn().mockResolvedValue({
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: { sandboxResult: "BLOCK" },
    });
    mockGetHandler.mockReturnValue(handler);

    const result = await retryHandler(makeNode(), makeContext());
    expect(result.updatedVariables?.result).toContain("[Error:");
  });

  it("succeeds when failureVariable has non-failure value", async () => {
    const handler: NodeHandler = vi.fn().mockResolvedValue({
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: { sandboxResult: "PASS" },
    });
    mockGetHandler.mockReturnValue(handler);

    const result = await retryHandler(makeNode(), makeContext());
    expect(result.updatedVariables?.sandboxResult).toBe("PASS");
    expect(handler).toHaveBeenCalledOnce();
  });

  it("escalation disabled: no __retry_escalation injected", async () => {
    let capturedVariables: Record<string, unknown> | undefined;
    const handler: NodeHandler = vi.fn()
      .mockImplementationOnce(() =>
        Promise.resolve({
          messages: [],
          nextNodeId: null,
          waitForInput: false,
          updatedVariables: { sandboxResult: "FAIL" },
        })
      )
      .mockImplementationOnce((_node, ctx) => {
        capturedVariables = ctx.variables;
        return Promise.resolve({
          messages: [],
          nextNodeId: null,
          waitForInput: false,
          updatedVariables: { data: "ok" },
        });
      });
    mockGetHandler.mockReturnValue(handler);

    await retryHandler(
      makeNode({ enableEscalation: false }),
      makeContext({ gateResult: { issues: [{ severity: "HIGH", file: "a.ts", message: "x", fix: "y" }] } }),
    );

    expect(capturedVariables?.__retry_escalation).toBeUndefined();
  });

  it("retry without errors: standard retry, no extra context", async () => {
    const handler: NodeHandler = vi.fn()
      .mockImplementationOnce(() =>
        Promise.resolve({
          messages: [],
          nextNodeId: null,
          waitForInput: false,
          updatedVariables: { result_data: "[Error: timeout]" },
        })
      )
      .mockResolvedValueOnce({
        messages: [],
        nextNodeId: null,
        waitForInput: false,
        updatedVariables: { result_data: "success" },
      });
    mockGetHandler.mockReturnValue(handler);

    const result = await retryHandler(
      makeNode({ failureVariable: "" }),
      makeContext(),
    );
    expect(result.updatedVariables?.result_data).toBe("success");
  });
});
