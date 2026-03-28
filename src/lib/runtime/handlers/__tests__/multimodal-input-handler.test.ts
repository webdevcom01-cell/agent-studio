import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateText = vi.fn();

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}));

vi.mock("@/lib/ai", () => ({
  getModel: vi.fn(() => "mock-model"),
}));

const mockPreprocessImage = vi.fn();
const mockToDataUrl = vi.fn();

vi.mock("@/lib/image/preprocessor", () => ({
  preprocessImage: (...args: unknown[]) => mockPreprocessImage(...args),
  toDataUrl: (...args: unknown[]) => mockToDataUrl(...args),
}));

import { multimodalInputHandler } from "../multimodal-input-handler";
import type { RuntimeContext } from "../../types";
import type { FlowNode, FlowContent } from "@/types";

function makeNode(overrides: Record<string, unknown> = {}): FlowNode {
  return {
    id: "vision-1",
    type: "multimodal_input",
    position: { x: 0, y: 0 },
    data: {
      imageVariable: "screenshot",
      prompt: "Describe this image",
      model: "gpt-4.1",
      outputFormat: "description",
      maxImageSize: 2048,
      outputVariable: "vision_result",
      ...overrides,
    },
  };
}

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges: [], variables: [] } as FlowContent,
    currentNodeId: "vision-1",
    variables: { screenshot: "data:image/png;base64,iVBOR..." },
    messageHistory: [],
    isNewConversation: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPreprocessImage.mockResolvedValue({
    base64: "abc123",
    mimeType: "image/png",
    width: 1024,
    height: 768,
    originalSize: 50000,
  });
  mockToDataUrl.mockReturnValue("data:image/png;base64,abc123");
});

describe("multimodalInputHandler", () => {
  it("returns error for unsupported vision model", async () => {
    const result = await multimodalInputHandler(
      makeNode({ model: "deepseek-chat" }),
      makeContext(),
    );
    expect(result.messages[0].content).toContain("does not support vision");
  });

  it("returns error when no image provided", async () => {
    const result = await multimodalInputHandler(
      makeNode(),
      makeContext({ variables: {} }),
    );
    expect(result.messages[0].content).toContain("no image");
  });

  it("sends image content to vision model", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: "A screenshot of a dashboard",
      usage: { inputTokens: 100, outputTokens: 20 },
    });

    const result = await multimodalInputHandler(makeNode(), makeContext());
    const output = result.updatedVariables?.vision_result as Record<string, unknown>;
    expect(output.description).toBe("A screenshot of a dashboard");
    expect(output.model).toBe("gpt-4.1");

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "user",
            content: expect.arrayContaining([
              expect.objectContaining({ type: "image" }),
              expect.objectContaining({ type: "text" }),
            ]),
          }),
        ]),
      }),
    );
  });

  it("preprocesses image with maxImageSize", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: "Processed",
      usage: { inputTokens: 50, outputTokens: 10 },
    });

    await multimodalInputHandler(
      makeNode({ maxImageSize: 1024 }),
      makeContext(),
    );

    expect(mockPreprocessImage).toHaveBeenCalledWith(
      "data:image/png;base64,iVBOR...",
      1024,
    );
  });

  it("returns text field in OCR mode", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: "Extracted text content",
      usage: { inputTokens: 100, outputTokens: 30 },
    });

    const result = await multimodalInputHandler(
      makeNode({ outputFormat: "ocr" }),
      makeContext(),
    );
    const output = result.updatedVariables?.vision_result as Record<string, unknown>;
    expect(output.text).toBe("Extracted text content");
    expect(output.description).toBeUndefined();
  });

  it("handles vision model failure gracefully", async () => {
    mockGenerateText.mockRejectedValueOnce(new Error("Model overloaded"));

    const result = await multimodalInputHandler(makeNode(), makeContext());
    expect(result.updatedVariables?.vision_result).toContain("[Error:");
  });
});
