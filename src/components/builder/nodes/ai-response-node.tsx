"use client";

import { memo, useEffect, useState } from "react";
import { type NodeProps, useReactFlow } from "@xyflow/react";
import { Sparkles, Plug } from "lucide-react";
import { BaseNode } from "./base-node";

function AIResponseNodeComponent({ data, selected }: NodeProps) {
  const [mcpToolCount, setMcpToolCount] = useState(0);
  const flow = useReactFlow();
  const agentId = (flow as unknown as { agentId?: string }).agentId;

  useEffect(() => {
    if (!agentId) return;

    fetch(`/api/agents/${agentId}/mcp`)
      .then((r) => r.json())
      .then((res) => {
        if (!res.success) return;
        let count = 0;
        for (const link of res.data) {
          const cache = link.mcpServer?.toolsCache;
          if (Array.isArray(cache)) {
            count += cache.length;
          }
        }
        setMcpToolCount(count);
      })
      .catch(() => {});
  }, [agentId]);

  return (
    <BaseNode
      icon={<Sparkles className="size-4" />}
      label={(data.label as string) || "AI Response"}
      color="violet"
      selected={selected}
    >
      {data.prompt ? (
        <p className="line-clamp-2">{String(data.prompt)}</p>
      ) : null}
      <div className="mt-0.5 flex items-center gap-2">
        {data.model ? (
          <span className="text-[10px] text-muted-foreground">
            Model: {String(data.model)}
          </span>
        ) : null}
        {mcpToolCount > 0 && (
          <span className="inline-flex items-center gap-0.5 rounded bg-muted/20 px-1 py-0.5 text-[10px] font-medium text-foreground/60">
            <Plug className="size-2.5" />
            MCP: {mcpToolCount} {mcpToolCount === 1 ? "tool" : "tools"}
          </span>
        )}
      </div>
    </BaseNode>
  );
}

export const AIResponseNode = memo(AIResponseNodeComponent);
