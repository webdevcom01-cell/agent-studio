"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { MessageSquare } from "lucide-react";
import { BaseNode } from "./base-node";

function MessageNodeComponent({ data, selected }: NodeProps) {
  return (
    <BaseNode
      icon={<MessageSquare className="size-4" />}
      label={(data.label as string) || "Message"}
      color="blue"
      selected={selected}
    >
      {data.message ? (
        <p className="line-clamp-2">{String(data.message)}</p>
      ) : null}
    </BaseNode>
  );
}

export const MessageNode = memo(MessageNodeComponent);
