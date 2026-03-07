"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { Webhook } from "lucide-react";
import { BaseNode } from "./base-node";

function WebhookNodeComponent({ data, selected }: NodeProps) {
  const method = (data.method as string) || "POST";
  const url = (data.url as string) || "";

  return (
    <BaseNode
      icon={<Webhook className="size-4" />}
      label={(data.label as string) || "Webhook"}
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

export const WebhookNode = memo(WebhookNodeComponent);
