"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { TextCursorInput } from "lucide-react";
import { BaseNode } from "./base-node";

function CaptureNodeComponent({ data, selected }: NodeProps) {
  return (
    <BaseNode
      icon={<TextCursorInput className="size-4" />}
      label={(data.label as string) || "Capture Input"}
      color="green"
      selected={selected}
    >
      {data.variableName ? (
        <p>
          Save to: <code className="font-mono">{`{${String(data.variableName)}}`}</code>
        </p>
      ) : null}
      {data.prompt ? (
        <p className="line-clamp-1 mt-0.5">{String(data.prompt)}</p>
      ) : null}
    </BaseNode>
  );
}

export const CaptureNode = memo(CaptureNodeComponent);
