import { describe, it, expect, vi, beforeEach } from "vitest";
import { fileWriterHandler } from "../file-writer-handler";
import type { RuntimeContext } from "../../types";

const mockMkdirSync = vi.fn();
const mockWriteFileSync = vi.fn();

vi.mock("fs", () => ({
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function makeNode(overrides: Record<string, unknown> = {}) {
  return {
    id: "node-1",
    type: "file_writer",
    data: {
      label: "File Writer",
      inputVariable: "codeOutput",
      targetDir: "/tmp/test-project",
      outputVariable: "fileWriteResult",
      nextNodeId: "next-1",
      ...overrides,
    },
  };
}

function makeContext(variables: Record<string, unknown> = {}): RuntimeContext {
  return {
    agentId: "agent-1",
    conversationId: "conv-1",
    variables,
    history: [],
    nodes: [],
    edges: [],
  } as unknown as RuntimeContext;
}

describe("fileWriterHandler", () => {
  beforeEach(() => {
    mockMkdirSync.mockReset();
    mockWriteFileSync.mockReset();
  });

  it("writes files from CodeGenOutput and returns success", async () => {
    const codeOutput = {
      files: [
        { path: "src/foo.ts", content: "export const x = 1;", language: "typescript", isNew: true },
        { path: "src/bar.ts", content: "export const y = 2;", language: "typescript", isNew: false },
      ],
      summary: "generated",
    };

    const result = await fileWriterHandler(
      makeNode() as never,
      makeContext({ codeOutput }),
    );

    expect(mockMkdirSync).toHaveBeenCalledTimes(2);
    expect(mockWriteFileSync).toHaveBeenCalledTimes(2);
    expect(result.nextNodeId).toBe("next-1");

    const output = result.updatedVariables?.fileWriteResult as Record<string, unknown>;
    expect(output.success).toBe(true);
    expect((output.filesWritten as string[]).length).toBe(2);
  });

  it("returns error result when inputVariable is empty", async () => {
    const result = await fileWriterHandler(
      makeNode() as never,
      makeContext({}),
    );

    expect(result.nextNodeId).toBeNull();
    const output = result.updatedVariables?.fileWriteResult as Record<string, unknown>;
    expect(output.success).toBe(false);
    expect(output.errors).toHaveLength(1);
  });

  it("returns error result when targetDir is not configured", async () => {
    const codeOutput = {
      files: [{ path: "src/foo.ts", content: "x", language: "typescript", isNew: true }],
      summary: "ok",
    };

    const result = await fileWriterHandler(
      makeNode({ targetDir: "" }) as never,
      makeContext({ codeOutput }),
    );

    expect(result.nextNodeId).toBeNull();
    const output = result.updatedVariables?.fileWriteResult as Record<string, unknown>;
    expect(output.success).toBe(false);
  });

  it("returns partial success when some files fail to write", async () => {
    const codeOutput = {
      files: [
        { path: "src/ok.ts", content: "ok", language: "typescript", isNew: true },
        { path: "src/fail.ts", content: "fail", language: "typescript", isNew: true },
      ],
      summary: "mixed",
    };

    mockWriteFileSync
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => { throw new Error("EACCES: permission denied"); });

    const result = await fileWriterHandler(
      makeNode() as never,
      makeContext({ codeOutput }),
    );

    const output = result.updatedVariables?.fileWriteResult as Record<string, unknown>;
    expect(output.success).toBe(false);
    expect((output.filesWritten as string[]).length).toBe(1);
    expect((output.errors as string[]).length).toBe(1);
  });

  it("does not throw when handler encounters unexpected error", async () => {
    mockMkdirSync.mockImplementation(() => { throw new Error("unexpected"); });

    const codeOutput = {
      files: [{ path: "src/x.ts", content: "x", language: "typescript", isNew: true }],
      summary: "ok",
    };

    await expect(
      fileWriterHandler(makeNode() as never, makeContext({ codeOutput })),
    ).resolves.toBeDefined();
  });
});
