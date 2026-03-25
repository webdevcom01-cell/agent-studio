"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { FileOutput } from "lucide-react";
import { BaseNode } from "./base-node";

interface ExtractField {
  name: string;
  description: string;
  type: string;
}

function AIExtractNodeComponent({ data, selected }: NodeProps) {
  const fields = (data.fields as ExtractField[]) ?? [];

  return (
    <BaseNode
      icon={<FileOutput className="size-4" />}
      label={(data.label as string) || "AI Extract"}
      color="violet"
      selected={selected}
    >
      {fields.length > 0 ? (
        <div className="space-y-0.5">
          {fields.map((f) => (
            <p key={f.name} className="truncate">
              <code className="font-mono">{f.name}</code>{" "}
              <span className="text-muted-foreground">({f.type})</span>
            </p>
          ))}
        </div>
      ) : (
        <p className="italic">No fields set</p>
      )}
    </BaseNode>
  );
}

export const AIExtractNode = memo(AIExtractNodeComponent);
