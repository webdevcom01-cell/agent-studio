"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { FileJson } from "lucide-react";
import { BaseNode } from "./base-node";

function StructuredOutputNodeComponent({ data, selected }: NodeProps) {
  const prompt = (data.prompt as string) || "";

  return (
    <BaseNode
      icon={<FileJson className="size-4" />}
      label={(data.label as string) || "Structured Output"}
      color="violet"
      selected={selected}
    >
      {prompt ? (
        <p className="truncate">{prompt}</p>
      ) : (
        <p className="italic">No prompt set</p>
      )}
    </BaseNode>
  );
}

export const StructuredOutputNode = memo(StructuredOutputNodeComponent);
