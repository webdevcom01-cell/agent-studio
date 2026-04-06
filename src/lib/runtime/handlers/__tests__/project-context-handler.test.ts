import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RuntimeContext } from "../../types";
import type { FlowContent } from "@/types";

vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { projectContextHandler } from "../project-context-handler";
import { existsSync, readFileSync, readdirSync } from "fs";
import { logger } from "@/lib/logger";

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockReaddirSync = vi.mocked(readdirSync);

function makeContext(overrides?: Partial<RuntimeContext>): RuntimeContext {
  return {
    agentId: "test-agent",
    conversationId: "test-conv",
    flowContent: {
      nodes: [],
      edges: [{ id: "e1", source: "ctx-1", target: "next-1" }],
      variables: [],
    } as unknown as FlowContent,
    variables: {},
    messages: [],
    ...overrides,
  };
}

function makeNode(data: Record<string, unknown> = {}) {
  return {
    id: "ctx-1",
    type: "project_context" as const,
    position: { x: 0, y: 0 },
    data: { label: "Project Context", ...data },
  };
}

describe("projectContextHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads multiple files and sets outputVariable", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync
      .mockReturnValueOnce("# CLAUDE.md content" as unknown as Buffer)
      .mockReturnValueOnce("# TypeScript rules" as unknown as Buffer);

    const result = await projectContextHandler(
      makeNode({
        contextFiles: ["CLAUDE.md", ".claude/rules/typescript.md"],
        outputVariable: "projectContext",
      }),
      makeContext(),
    );

    expect(result.nextNodeId).toBe("next-1");
    expect(result.updatedVariables?.projectContext).toContain("CLAUDE.md");
    expect(result.updatedVariables?.projectContext).toContain("# CLAUDE.md content");
    expect(result.updatedVariables?.projectContext).toContain("# TypeScript rules");
    expect(result.messages[0].content).toContain("2 context file");
  });

  it("returns empty string when contextFiles is empty", async () => {
    const result = await projectContextHandler(
      makeNode({ contextFiles: [], outputVariable: "projectContext" }),
      makeContext(),
    );

    expect(result.nextNodeId).toBe("next-1");
    expect(result.updatedVariables?.projectContext).toBe("");
    expect(result.messages[0].content).toContain("No context files loaded");
  });

  it("skips missing files with a warning and continues", async () => {
    mockExistsSync
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    mockReadFileSync.mockReturnValueOnce("# Rules" as unknown as Buffer);

    const result = await projectContextHandler(
      makeNode({
        contextFiles: ["missing.md", "CLAUDE.md"],
        outputVariable: "ctx",
      }),
      makeContext(),
    );

    expect(result.nextNodeId).toBe("next-1");
    expect(result.updatedVariables?.ctx).toContain("# Rules");
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.stringContaining("file not found"),
      expect.objectContaining({ filePath: "missing.md" }),
    );
  });

  it("truncates content exceeding maxTokens", async () => {
    mockExistsSync.mockReturnValue(true);
    const longContent = "x".repeat(10000);
    mockReadFileSync.mockReturnValue(longContent as unknown as Buffer);

    const result = await projectContextHandler(
      makeNode({
        contextFiles: ["large.md"],
        maxTokens: 100,
        outputVariable: "ctx",
      }),
      makeContext(),
    );

    const output = result.updatedVariables?.ctx as string;
    expect(output.length).toBeLessThanOrEqual(100 * 4 + 100);
    expect(output).toContain("[truncated]");
  });

  it("uses default outputVariable 'projectContext' when not specified", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("content" as unknown as Buffer);

    const result = await projectContextHandler(
      makeNode({ contextFiles: ["CLAUDE.md"] }),
      makeContext(),
    );

    expect(result.updatedVariables).toHaveProperty("projectContext");
  });

  it("expands glob patterns using readdirSync", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(["typescript.md", "api-routes.md"] as unknown as ReturnType<typeof readdirSync>);
    mockReadFileSync.mockReturnValue("# Rule" as unknown as Buffer);

    const result = await projectContextHandler(
      makeNode({ contextFiles: [".claude/rules/*.md"], outputVariable: "ctx" }),
      makeContext(),
    );

    expect(result.updatedVariables?.ctx).toContain("# Rule");
    expect(result.messages[0].content).toContain("2 context file");
  });

  it("routes to nextNodeId from edges", async () => {
    const context = makeContext({
      flowContent: {
        nodes: [],
        edges: [{ id: "e1", source: "ctx-1", target: "code-gen-1" }],
        variables: [],
      } as unknown as FlowContent,
    });

    const result = await projectContextHandler(
      makeNode({ contextFiles: [] }),
      context,
    );

    expect(result.nextNodeId).toBe("code-gen-1");
  });

  it("returns null nextNodeId when no outgoing edge", async () => {
    const context = makeContext({
      flowContent: {
        nodes: [],
        edges: [],
        variables: [],
      } as unknown as FlowContent,
    });

    const result = await projectContextHandler(
      makeNode({ contextFiles: [] }),
      context,
    );

    expect(result.nextNodeId).toBeNull();
  });
});
