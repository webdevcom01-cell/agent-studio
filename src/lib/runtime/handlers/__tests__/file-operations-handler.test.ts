import { describe, it, expect, vi, beforeEach } from "vitest";

const mockS3Read = vi.fn();
const mockS3Write = vi.fn();
const mockS3List = vi.fn();
const mockS3Presigned = vi.fn();

vi.mock("@/lib/storage/s3-provider", () => ({
  createS3Provider: () => ({
    read: mockS3Read,
    write: mockS3Write,
    list: mockS3List,
    remove: vi.fn(),
    presignedUrl: mockS3Presigned,
  }),
}));

vi.mock("@/lib/storage/gdrive-provider", () => ({
  createGDriveProvider: () => ({
    read: vi.fn().mockResolvedValue({ content: "abc", contentType: "text/plain", size: 3 }),
    write: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    remove: vi.fn(),
    presignedUrl: vi.fn(),
  }),
}));

import { fileOperationsHandler } from "../file-operations-handler";
import type { RuntimeContext } from "../../types";
import type { FlowNode, FlowContent } from "@/types";

function makeNode(overrides: Record<string, unknown> = {}): FlowNode {
  return {
    id: "file-1",
    type: "file_operations",
    position: { x: 0, y: 0 },
    data: {
      operation: "read",
      provider: "s3",
      path: "uploads/report.pdf",
      bucket: "test-bucket",
      outputVariable: "file_result",
      ...overrides,
    },
  };
}

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges: [], variables: [] } as FlowContent,
    currentNodeId: "file-1",
    variables: {},
    messageHistory: [],
    isNewConversation: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AWS_ACCESS_KEY_ID", "test-key");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "test-secret");
});

describe("fileOperationsHandler", () => {
  it("returns error when path is empty", async () => {
    const result = await fileOperationsHandler(
      makeNode({ path: "" }),
      makeContext(),
    );
    expect(result.messages[0].content).toContain("no path");
  });

  it("reads file from S3", async () => {
    mockS3Read.mockResolvedValueOnce({
      content: "base64data",
      contentType: "application/pdf",
      size: 1024,
    });

    const result = await fileOperationsHandler(makeNode(), makeContext());
    const output = result.updatedVariables?.file_result as Record<string, unknown>;
    expect(output.content).toBe("base64data");
    expect(output.size).toBe(1024);
  });

  it("writes file to S3", async () => {
    mockS3Write.mockResolvedValueOnce({
      url: "https://bucket.s3.amazonaws.com/test.pdf",
      key: "test.pdf",
    });

    const result = await fileOperationsHandler(
      makeNode({ operation: "write", path: "test.pdf", contentVariable: "data" }),
      makeContext({ variables: { data: "filecontents" } }),
    );
    const output = result.updatedVariables?.file_result as Record<string, unknown>;
    expect(output.key).toBe("test.pdf");
  });

  it("generates presigned URL", async () => {
    mockS3Presigned.mockResolvedValueOnce({
      url: "https://signed-url.example.com",
      expiresAt: "2026-04-01T00:00:00Z",
    });

    const result = await fileOperationsHandler(
      makeNode({ operation: "presigned_url" }),
      makeContext(),
    );
    const output = result.updatedVariables?.file_result as Record<string, unknown>;
    expect(output.url).toContain("signed-url");
  });

  it("handles base64 mode read/write without external storage", async () => {
    const result = await fileOperationsHandler(
      makeNode({ provider: "base64", path: "my_data", operation: "read" }),
      makeContext({ variables: { my_data: "SGVsbG8=" } }),
    );
    const output = result.updatedVariables?.file_result as Record<string, unknown>;
    expect(output.content).toBe("SGVsbG8=");
  });

  it("lists files from S3", async () => {
    mockS3List.mockResolvedValueOnce([
      { name: "a.txt", size: 100, lastModified: null, contentType: null },
    ]);

    const result = await fileOperationsHandler(
      makeNode({ operation: "list" }),
      makeContext(),
    );
    const output = result.updatedVariables?.file_result as Record<string, unknown>;
    expect((output.files as unknown[]).length).toBe(1);
  });

  it("handles errors gracefully", async () => {
    mockS3Read.mockRejectedValueOnce(new Error("Access Denied"));

    const result = await fileOperationsHandler(makeNode(), makeContext());
    expect(result.updatedVariables?.file_result).toContain("[Error:");
  });
});
