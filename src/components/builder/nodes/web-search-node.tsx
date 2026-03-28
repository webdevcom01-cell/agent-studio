"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { Search } from "lucide-react";
import { BaseNode } from "./base-node";

const PROVIDER_LABELS: Record<string, string> = {
  tavily: "Tavily",
  brave: "Brave",
};

function WebSearchNodeComponent({ data, selected }: NodeProps) {
  const query = (data.query as string) || "";
  const provider = (data.provider as string) || "tavily";

  return (
    <BaseNode
      icon={<Search className="size-4" />}
      label={(data.label as string) || "Web Search"}
      color="blue"
      selected={selected}
    >
      {query ? (
        <p className="truncate">
          <span className="font-semibold">{PROVIDER_LABELS[provider] ?? provider}</span>{" "}
          <span className="font-mono">{query}</span>
        </p>
      ) : (
        <p className="italic">No query set</p>
      )}
    </BaseNode>
  );
}

export const WebSearchNode = memo(WebSearchNodeComponent);
