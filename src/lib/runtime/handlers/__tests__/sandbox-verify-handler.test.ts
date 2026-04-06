import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RuntimeContext } from "../../types";
import type { FlowContent } from "@/types";

vi.mock("../../verification-commands", () => ({
  runVerificationCommands: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("fs", () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  rmSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
}));

import { sandboxVerifyHandler } from "../sandbox-verify-handler";
import { runVerificationCommands } from "../../verification-commands";

const mockRunCommands = vi.mocked(runVerificationCommands);

function makeContext(variables: Record<string, unknown> = {}): RuntimeContext {
  return {
    agentId: "test-agent",
    conversationId: "test-conv",
    flowContent: {
      nodes: [],
      edges: [
        { id: "e-pass", source: "sb-1", target: "pr-gate", sourceHandle: "passed" },
        { id: "e-fail", source: "sb-1", target: "retry-1", sourceHandle: "failed" },
      ],
      variables: [],
    } as unknown as FlowContent,
    variables,
    messages: [],
  };
}

function makeNode(data: Record<string, unknown> = {}) {
  return {
    id: "sb-1",
    type: "sandbox_verify" as const,
    position: { x: 0, y: 0 },
    data: {
      label: "Sandbox Verify",
      inputVariable: "generatedCode",
      checks: ["forbidden_patterns"],
      forbiddenPatterns: [],
      outputVariable: "sandboxResult",
      ...data,
    },
  };
}

describe("sandboxVerifyHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── forbidden_patterns: built-in ────────────────────────────────────────────

  it("FAILs when code imports from @prisma/client", async () => {
    const result = await sandboxVerifyHandler(
      makeNode(),
      makeContext({ generatedCode: 'import { PrismaClient } from "@prisma/client";\n' }),
    );

    expect(result.nextNodeId).toBe("failed");
    expect(result.updatedVariables?.sandboxResult).toBe("FAIL");
    const errors = result.updatedVariables?.sandboxErrors as string[];
    expect(errors.some((e) => e.includes("@/generated/prisma"))).toBe(true);
  });

  it("FAILs when code uses any type", async () => {
    const result = await sandboxVerifyHandler(
      makeNode(),
      makeContext({ generatedCode: "function foo(x: any): any { return x; }" }),
    );

    expect(result.nextNodeId).toBe("failed");
    expect(result.updatedVariables?.sandboxResult).toBe("FAIL");
    const errors = result.updatedVariables?.sandboxErrors as string[];
    expect(errors.some((e) => e.includes("any types"))).toBe(true);
  });

  it("FAILs when code uses console.log", async () => {
    const result = await sandboxVerifyHandler(
      makeNode(),
      makeContext({ generatedCode: 'console.log("debug info");' }),
    );

    expect(result.nextNodeId).toBe("failed");
    const errors = result.updatedVariables?.sandboxErrors as string[];
    expect(errors.some((e) => e.includes("logger"))).toBe(true);
  });

  it("FAILs when code uses console.error", async () => {
    const result = await sandboxVerifyHandler(
      makeNode(),
      makeContext({ generatedCode: 'console.error("something broke");' }),
    );

    expect(result.nextNodeId).toBe("failed");
    const errors = result.updatedVariables?.sandboxErrors as string[];
    expect(errors.some((e) => e.includes("logger"))).toBe(true);
  });

  it("PASSes clean code with no violations", async () => {
    const cleanCode = `
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function getAgents() {
  const agents = await prisma.agent.findMany();
  logger.info("agents fetched", { count: agents.length });
  return agents;
}
`;
    const result = await sandboxVerifyHandler(
      makeNode(),
      makeContext({ generatedCode: cleanCode }),
    );

    expect(result.nextNodeId).toBe("passed");
    expect(result.updatedVariables?.sandboxResult).toBe("PASS");
    const errors = result.updatedVariables?.sandboxErrors as string[];
    expect(errors).toHaveLength(0);
  });

  // ── Empty / missing input ────────────────────────────────────────────────────

  it("FAILs gracefully when input variable is empty", async () => {
    const result = await sandboxVerifyHandler(
      makeNode({ inputVariable: "generatedCode" }),
      makeContext({}),
    );

    expect(result.nextNodeId).toBe("failed");
    expect(result.updatedVariables?.sandboxResult).toBe("FAIL");
    const errors = result.updatedVariables?.sandboxErrors as string[];
    expect(errors[0]).toContain("generatedCode");
  });

  it("FAILs gracefully when input variable is empty string", async () => {
    const result = await sandboxVerifyHandler(
      makeNode(),
      makeContext({ generatedCode: "" }),
    );

    expect(result.nextNodeId).toBe("failed");
  });

  // ── Structured input (CodeGenOutput format) ──────────────────────────────────

  it("extracts code from structured files[] input", async () => {
    const structured = {
      files: [
        { path: "src/api/route.ts", content: 'import { PrismaClient } from "@prisma/client";' },
        { path: "src/lib/utils.ts", content: "export const clean = () => {};" },
      ],
      summary: "Generated code",
    };

    const result = await sandboxVerifyHandler(
      makeNode(),
      makeContext({ generatedCode: structured }),
    );

    expect(result.nextNodeId).toBe("failed");
    const errors = result.updatedVariables?.sandboxErrors as string[];
    expect(errors.some((e) => e.includes("route.ts"))).toBe(true);
  });

  // ── Custom forbidden patterns ─────────────────────────────────────────────────

  it("applies custom forbidden patterns", async () => {
    const result = await sandboxVerifyHandler(
      makeNode({
        forbiddenPatterns: [
          { pattern: "TODO", message: "No TODOs in generated code" },
        ],
      }),
      makeContext({ generatedCode: "// TODO: fix this later\nconst x = 1;" }),
    );

    expect(result.nextNodeId).toBe("failed");
    const errors = result.updatedVariables?.sandboxErrors as string[];
    expect(errors.some((e) => e.includes("No TODOs in generated code"))).toBe(true);
  });

  // ── Output variable ────────────────────────────────────────────────────────

  it("uses default outputVariable 'sandboxResult'", async () => {
    const result = await sandboxVerifyHandler(
      makeNode({ outputVariable: undefined }),
      makeContext({ generatedCode: "const x = 1;" }),
    );

    expect(result.updatedVariables).toHaveProperty("sandboxResult");
  });

  it("stores sandboxErrors and sandboxSummary always", async () => {
    const result = await sandboxVerifyHandler(
      makeNode(),
      makeContext({ generatedCode: "const x = 1;" }),
    );

    expect(result.updatedVariables?.sandboxErrors).toBeInstanceOf(Array);
    expect(typeof result.updatedVariables?.sandboxSummary).toBe("string");
  });

  // ── typecheck and lint (mocked) ───────────────────────────────────────────────

  it("runs typecheck check and propagates tsc errors", async () => {
    mockRunCommands.mockResolvedValueOnce({
      allPassed: false,
      output: "error TS2322: Type 'string' is not assignable to type 'number'.",
      results: [
        {
          command: "tsc --noEmit --allowJs --strict --skipLibCheck",
          passed: false,
          output: "error TS2322: Type 'string' is not assignable to type 'number'.",
          durationMs: 200,
        },
      ],
    });

    const result = await sandboxVerifyHandler(
      makeNode({ checks: ["typecheck"], inputVariable: "code" }),
      makeContext({ code: "const x: number = 'hello';" }),
    );

    expect(result.nextNodeId).toBe("failed");
    const errors = result.updatedVariables?.sandboxErrors as string[];
    expect(errors.some((e) => e.includes("TS2322"))).toBe(true);
  });

  it("PASSes when tsc returns no errors", async () => {
    mockRunCommands.mockResolvedValueOnce({
      allPassed: true,
      output: "",
      results: [{ command: "tsc --noEmit", passed: true, output: "", durationMs: 150 }],
    });

    const result = await sandboxVerifyHandler(
      makeNode({ checks: ["typecheck"], inputVariable: "code" }),
      makeContext({ code: "const x: number = 42;" }),
    );

    expect(result.nextNodeId).toBe("passed");
  });
});
