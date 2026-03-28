"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { ImageIcon } from "lucide-react";
import { BaseNode } from "./base-node";

const FORMAT_LABELS: Record<string, string> = {
  description: "Describe",
  ocr: "OCR",
  json: "JSON Extract",
  qa: "Q&A",
};

function MultimodalInputNodeComponent({ data, selected }: NodeProps) {
  const outputFormat = (data.outputFormat as string) || "description";
  const model = (data.model as string) || "gpt-4.1";

  return (
    <BaseNode
      icon={<ImageIcon className="size-4" />}
      label={(data.label as string) || "Vision Input"}
      color="purple"
      selected={selected}
    >
      <p className="truncate">
        <span className="font-semibold">{FORMAT_LABELS[outputFormat] ?? outputFormat}</span>
        <span className="text-muted-foreground"> via {model}</span>
      </p>
    </BaseNode>
  );
}

export const MultimodalInputNode = memo(MultimodalInputNodeComponent);
