"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { Plug } from "lucide-react";
import { BaseNode } from "./base-node";

function MCPToolNodeComponent({ data, selected }: NodeProps) {
  const toolName = (data.toolName as string) || "";
  const serverName = (data.serverName as string) || "";

  return (
    <BaseNode
      icon={<Plug className="size-4" />}
      label={(data.label as string) || "MCP Tool"}
      color="teal"
      selected={selected}
    >
      {toolName ? (
        <p className="truncate">
          {serverName && (
            <span className="font-semibold">{serverName} → </span>
          )}
          <span className="font-mono">{toolName}</span>
        </p>
      ) : (
        <p className="italic">No tool selected</p>
      )}
    </BaseNode>
  );
}

export const MCPToolNode = memo(MCPToolNodeComponent);
