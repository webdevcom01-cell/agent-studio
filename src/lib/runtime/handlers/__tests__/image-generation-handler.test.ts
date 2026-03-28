import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateImage = vi.fn();

vi.mock("@/lib/image/providers", () => ({
  generateImage: (...args: unknown[]) => mockGenerateImage(...args),
}));

import { imageGenerationHandler } from "../image-generation-handler";
import type { RuntimeContext } from "../../types";
import type { FlowNode, FlowContent } from "@/types";

function makeNode(overrides: Record<string, unknown> = {}): FlowNode {
  return {
    id: "img-1",
    type: "image_generation",
    position: { x: 0, y: 0 },
    data: {
      prompt: "A cat in space",
      provider: "dall-e-3",
      size: "1024x1024",
      quality: "standard",
      style: "vivid",
      outputVariable: "generated_image",
      ...overrides,
    },
  };
}

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges: [], variables: [] } as FlowContent,
    currentNodeId: "img-1",
    variables: {},
    messageHistory: [],
    isNewConversation: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("imageGenerationHandler", () => {
  it("returns error when prompt is empty", async () => {
    const result = await imageGenerationHandler(
      makeNode({ prompt: "" }),
      makeContext(),
    );
    expect(result.messages[0].content).toContain("no prompt");
  });

  it("generates image and returns result", async () => {
    mockGenerateImage.mockResolvedValueOnce({
      url: null,
      base64: "iVBORw0KGgoAAAANSUhEUgAA...",
      width: 1024,
      height: 1024,
      model: "dall-e-3",
      revisedPrompt: "A cute cat floating in outer space",
    });

    const result = await imageGenerationHandler(makeNode(), makeContext());
    const output = result.updatedVariables?.generated_image as Record<string, unknown>;
    expect(output.base64).toBeTruthy();
    expect(output.width).toBe(1024);
    expect(output.height).toBe(1024);
    expect(output.model).toBe("dall-e-3");
    expect(output.revisedPrompt).toContain("cat");
  });

  it("resolves template variables in prompt", async () => {
    mockGenerateImage.mockResolvedValueOnce({
      url: null,
      base64: "abc",
      width: 1024,
      height: 1024,
      model: "dall-e-3",
      revisedPrompt: null,
    });

    await imageGenerationHandler(
      makeNode({ prompt: "{{subject}} in the rain" }),
      makeContext({ variables: { subject: "A dog" } }),
    );

    expect(mockGenerateImage).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "A dog in the rain" }),
    );
  });

  it("handles content policy error gracefully", async () => {
    mockGenerateImage.mockRejectedValueOnce(
      new Error("400: content policy violation"),
    );

    const result = await imageGenerationHandler(makeNode(), makeContext());
    expect(result.updatedVariables?.generated_image).toContain("[Error:");
  });

  it("passes provider-specific options", async () => {
    mockGenerateImage.mockResolvedValueOnce({
      url: null,
      base64: "abc",
      width: 1792,
      height: 1024,
      model: "dall-e-3",
      revisedPrompt: null,
    });

    await imageGenerationHandler(
      makeNode({ size: "1792x1024", quality: "hd", style: "natural" }),
      makeContext(),
    );

    expect(mockGenerateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        size: "1792x1024",
        quality: "hd",
        style: "natural",
      }),
    );
  });
});
