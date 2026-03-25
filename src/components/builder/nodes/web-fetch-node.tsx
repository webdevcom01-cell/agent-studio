"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { Globe } from "lucide-react";
import { BaseNode } from "./base-node";

const PROVIDER_LABELS: Record<string, string> = {
  jina: "Jina Reader",
  raw: "Raw HTML",
};

function WebFetchNodeComponent({ data, selected }: NodeProps) {
  const url = (data.url as string) || "";
  const provider = (data.provider as string) || "jina";

  return (
    <BaseNode
      icon={<Globe className="size-4" />}
      label={(data.label as string) || "Web Fetch"}
      color="cyan"
      selected={selected}
    >
      {url ? (
        <p className="truncate">
          <span className="font-semibold">{PROVIDER_LABELS[provider] ?? provider}</span>{" "}
          <span className="font-mono">{url}</span>
        </p>
      ) : (
        <p className="italic">No URL set</p>
      )}
    </BaseNode>
  );
}

export const WebFetchNode = memo(WebFetchNodeComponent);
