import { logger } from "@/lib/logger";

export interface GeneratedImage {
  url: string | null;
  base64: string | null;
  width: number;
  height: number;
  model: string;
  revisedPrompt: string | null;
}

export type ImageProvider = "dall-e-3" | "flux-pro" | "flux-dev" | "sdxl";

interface GenerateOptions {
  prompt: string;
  negativePrompt: string;
  provider: ImageProvider;
  size: string;
  quality: string;
  style: string;
}

export async function generateImage(options: GenerateOptions): Promise<GeneratedImage> {
  switch (options.provider) {
    case "flux-pro":
    case "flux-dev":
      return generateFal(options);
    case "dall-e-3":
    default:
      return generateDallE(options);
  }
}

async function generateDallE(options: GenerateOptions): Promise<GeneratedImage> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for DALL-E 3");
  }

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt: options.prompt,
      n: 1,
      size: options.size || "1024x1024",
      quality: options.quality || "standard",
      style: options.style || "vivid",
      response_format: "b64_json",
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`DALL-E 3 API error ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    data?: {
      b64_json?: string;
      url?: string;
      revised_prompt?: string;
    }[];
  };

  const image = data.data?.[0];
  const [w, h] = (options.size || "1024x1024").split("x").map(Number);

  return {
    url: null,
    base64: image?.b64_json ?? null,
    width: w,
    height: h,
    model: "dall-e-3",
    revisedPrompt: image?.revised_prompt ?? null,
  };
}

async function generateFal(options: GenerateOptions): Promise<GeneratedImage> {
  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) {
    throw new Error("FAL_API_KEY is required for Flux models");
  }

  const { fal } = await import("@fal-ai/client");
  fal.config({ credentials: apiKey });

  const modelId =
    options.provider === "flux-pro"
      ? "fal-ai/flux-pro"
      : "fal-ai/flux/dev";

  const [w, h] = (options.size || "1024x1024").split("x").map(Number);

  try {
    const result = await fal.subscribe(modelId, {
      input: {
        prompt: options.prompt,
        image_size: { width: w, height: h },
        num_images: 1,
      },
    });

    const imageData = result.data as {
      images?: { url?: string; content_type?: string }[];
    };

    const imageUrl = imageData.images?.[0]?.url ?? null;

    return {
      url: imageUrl,
      base64: null,
      width: w,
      height: h,
      model: options.provider,
      revisedPrompt: null,
    };
  } catch (err) {
    logger.warn("Fal image generation failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
