"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { Globe } from "lucide-react";
import { BaseNode } from "./base-node";

function ApiCallNodeComponent({ data, selected }: NodeProps) {
  const method = (data.method as string) || "GET";
  const url = (data.url as string) || "";

  return (
    <BaseNode
      icon={<Globe className="size-4" />}
      label={(data.label as string) || "API Call"}
      color="orange"
      selected={selected}
    >
      {url ? (
        <p className="truncate">
          <span className="font-semibold">{method}</span>{" "}
          <span className="font-mono">{url}</span>
        </p>
      ) : (
        <p className="italic">No URL set</p>
      )}
    </BaseNode>
  );
}

export const ApiCallNode = memo(ApiCallNodeComponent);
