import { logger } from "@/lib/logger";

const DEFAULT_MAX_SIZE = 2048;
const SUPPORTED_FORMATS = ["jpeg", "png", "webp", "gif"];

export interface ProcessedImage {
  base64: string;
  mimeType: string;
  width: number;
  height: number;
  originalSize: number;
}

/**
 * Preprocesses an image for vision model input.
 * Resizes if larger than maxSize, converts to base64.
 */
export async function preprocessImage(
  input: string,
  maxSize: number = DEFAULT_MAX_SIZE,
): Promise<ProcessedImage> {
  const sharp = (await import("sharp")).default;

  let buffer: Buffer;

  if (input.startsWith("data:")) {
    const base64Data = input.split(",")[1] ?? "";
    buffer = Buffer.from(base64Data, "base64");
  } else if (input.startsWith("http://") || input.startsWith("https://")) {
    const response = await fetch(input, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`Image fetch failed: HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } else {
    buffer = Buffer.from(input, "base64");
  }

  const originalSize = buffer.length;

  const image = sharp(buffer);
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const format = metadata.format ?? "jpeg";

  if (!SUPPORTED_FORMATS.includes(format)) {
    logger.warn("Unsupported image format, converting to jpeg", { format });
  }

  let processed = image;

  if (width > maxSize || height > maxSize) {
    processed = processed.resize(maxSize, maxSize, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  const outputFormat = SUPPORTED_FORMATS.includes(format) ? format : "jpeg";
  const outputBuffer = await processed
    .toFormat(outputFormat as keyof import("sharp").FormatEnum)
    .toBuffer();

  const processedMeta = await sharp(outputBuffer).metadata();

  return {
    base64: outputBuffer.toString("base64"),
    mimeType: `image/${outputFormat}`,
    width: processedMeta.width ?? 0,
    height: processedMeta.height ?? 0,
    originalSize,
  };
}

/**
 * Creates a data URL from a ProcessedImage.
 */
export function toDataUrl(image: ProcessedImage): string {
  return `data:${image.mimeType};base64,${image.base64}`;
}
