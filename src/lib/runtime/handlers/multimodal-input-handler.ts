import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import { getModel } from "@/lib/ai";
import { generateText } from "ai";
import { preprocessImage, toDataUrl } from "@/lib/image/preprocessor";

const DEFAULT_OUTPUT_VARIABLE = "vision_result";
const DEFAULT_MAX_IMAGE_SIZE = 2048;

const VISION_MODELS = new Set([
  "gpt-4.1",
  "gpt-4.1-mini",
  "claude-sonnet-4-6",
  "claude-opus-4-6",
  "claude-haiku-4-5-20251001",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "mistral-small-3.1-2503",
]);

const FORMAT_PROMPTS: Record<string, string> = {
  description: "Describe this image in detail.",
  ocr: "Extract all text visible in this image. Return only the extracted text, nothing else.",
  json: "Analyze this image and return your findings as a JSON object.",
  qa: "",
};

/**
 * multimodal_input — Sends an image to a vision-capable model for analysis.
 * Supports description, OCR, JSON extraction, and Q&A modes.
 */
export const multimodalInputHandler: NodeHandler = async (node, context) => {
  const imageVariable = (node.data.imageVariable as string) ?? "";
  const promptTemplate = (node.data.prompt as string) ?? "";
  const modelId = (node.data.model as string) || "gpt-4.1";
  const outputFormat = (node.data.outputFormat as string) ?? "description";
  const maxImageSize =
    (node.data.maxImageSize as number) ?? DEFAULT_MAX_IMAGE_SIZE;
  const outputVariable =
    (node.data.outputVariable as string) || DEFAULT_OUTPUT_VARIABLE;

  if (!VISION_MODELS.has(modelId)) {
    return {
      messages: [
        {
          role: "assistant",
          content: `Model "${modelId}" does not support vision. Use one of: ${[...VISION_MODELS].join(", ")}`,
        },
      ],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: `[Error: Model "${modelId}" does not support vision]`,
      },
    };
  }

  const imageInput = imageVariable
    ? String(context.variables[imageVariable] ?? "")
    : "";

  if (!imageInput) {
    return {
      messages: [
        {
          role: "assistant",
          content: "Multimodal Input: no image provided.",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  const userPrompt = promptTemplate
    ? resolveTemplate(promptTemplate, context.variables)
    : FORMAT_PROMPTS[outputFormat] ?? FORMAT_PROMPTS.description;

  try {
    const processed = await preprocessImage(imageInput, maxImageSize);
    const dataUrl = toDataUrl(processed);

    const { text, usage } = await generateText({
      model: getModel(modelId),
      messages: [
        {
          role: "user",
          content: [
            { type: "image", image: dataUrl },
            { type: "text", text: userPrompt },
          ],
        },
      ],
    });

    const resultKey =
      outputFormat === "ocr"
        ? "text"
        : outputFormat === "qa"
          ? "answer"
          : "description";

    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: {
          [resultKey]: text,
          model: modelId,
          imageSize: { width: processed.width, height: processed.height },
          tokenUsage: usage
            ? { input: usage.inputTokens, output: usage.outputTokens }
            : null,
        },
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: `[Error: ${errorMsg}]`,
      },
    };
  }
};
