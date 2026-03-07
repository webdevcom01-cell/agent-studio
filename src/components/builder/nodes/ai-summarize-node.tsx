"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { FileText } from "lucide-react";
import { BaseNode } from "./base-node";

function AISummarizeNodeComponent({ data, selected }: NodeProps) {
  const outputVariable = (data.outputVariable as string) || "summary";
  const maxLength = (data.maxLength as number) ?? 200;

  return (
    <BaseNode
      icon={<FileText className="size-4" />}
      label={(data.label as string) || "AI Summarize"}
      color="violet"
      selected={selected}
    >
      <p>
        → <code className="font-mono">{outputVariable}</code> (max {maxLength} chars)
      </p>
    </BaseNode>
  );
}

export const AISummarizeNode = memo(AISummarizeNodeComponent);
