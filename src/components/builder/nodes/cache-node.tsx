"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { Database } from "lucide-react";
import { BaseNode } from "./base-node";

const OP_LABELS: Record<string, string> = {
  get: "Get",
  set: "Set",
  delete: "Delete",
};

function CacheNodeComponent({ data, selected }: NodeProps) {
  const operation = (data.operation as string) || "get";
  const cacheKey = (data.cacheKey as string) || "";

  return (
    <BaseNode
      icon={<Database className="size-4" />}
      label={(data.label as string) || "Cache"}
      color="orange"
      selected={selected}
    >
      <p className="truncate">
        <span className="font-semibold">{OP_LABELS[operation] ?? operation}</span>{" "}
        {cacheKey ? <span className="font-mono">{cacheKey}</span> : <span className="italic">no key</span>}
      </p>
    </BaseNode>
  );
}

export const CacheNode = memo(CacheNodeComponent);
