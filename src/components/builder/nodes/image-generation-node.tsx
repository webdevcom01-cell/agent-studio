"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { ImagePlus } from "lucide-react";
import { BaseNode } from "./base-node";

const PROVIDER_LABELS: Record<string, string> = {
  "dall-e-3": "DALL-E 3",
  "flux-pro": "Flux Pro",
  "flux-dev": "Flux Dev",
  sdxl: "SDXL",
};

function ImageGenerationNodeComponent({ data, selected }: NodeProps) {
  const provider = (data.provider as string) || "dall-e-3";
  const prompt = (data.prompt as string) || "";

  return (
    <BaseNode
      icon={<ImagePlus className="size-4" />}
      label={(data.label as string) || "Image Generation"}
      color="rose"
      selected={selected}
    >
      <p className="truncate">
        <span className="font-semibold">{PROVIDER_LABELS[provider] ?? provider}</span>
        {prompt && <span className="text-muted-foreground"> {prompt}</span>}
      </p>
    </BaseNode>
  );
}

export const ImageGenerationNode = memo(ImageGenerationNodeComponent);
