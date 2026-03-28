import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import { generateImage, type ImageProvider } from "@/lib/image/providers";

const DEFAULT_OUTPUT_VARIABLE = "generated_image";

/**
 * image_generation — Generates images from text prompts via DALL-E 3, Flux, or SDXL.
 */
export const imageGenerationHandler: NodeHandler = async (node, context) => {
  const promptTemplate = (node.data.prompt as string) ?? "";
  const negativePrompt = (node.data.negativePrompt as string) ?? "";
  const provider = (node.data.provider as ImageProvider) ?? "dall-e-3";
  const size = (node.data.size as string) ?? "1024x1024";
  const quality = (node.data.quality as string) ?? "standard";
  const style = (node.data.style as string) ?? "vivid";
  const outputVariable =
    (node.data.outputVariable as string) || DEFAULT_OUTPUT_VARIABLE;

  const prompt = resolveTemplate(promptTemplate, context.variables);

  if (!prompt) {
    return {
      messages: [
        { role: "assistant", content: "Image Generation node has no prompt configured." },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  try {
    const result = await generateImage({
      prompt,
      negativePrompt: resolveTemplate(negativePrompt, context.variables),
      provider,
      size,
      quality,
      style,
    });

    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: result,
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
