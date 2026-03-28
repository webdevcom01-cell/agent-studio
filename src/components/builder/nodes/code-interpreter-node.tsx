"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { Terminal } from "lucide-react";
import { BaseNode } from "./base-node";

function CodeInterpreterNodeComponent({ data, selected }: NodeProps) {
  const language = (data.language as string) || "python";
  const code = (data.code as string) || "";
  const preview = code.split("\n")[0]?.slice(0, 50) ?? "";

  return (
    <BaseNode
      icon={<Terminal className="size-4" />}
      label={(data.label as string) || "Code Interpreter"}
      color={language === "python" ? "yellow" : "amber"}
      selected={selected}
    >
      <p className="truncate">
        <span className="font-semibold">{language === "python" ? "Python" : "JavaScript"}</span>
      </p>
      {preview && (
        <p className="truncate font-mono text-[10px] text-muted-foreground">{preview}</p>
      )}
    </BaseNode>
  );
}

export const CodeInterpreterNode = memo(CodeInterpreterNodeComponent);
