"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { UserCheck } from "lucide-react";
import { BaseNode } from "./base-node";

function HumanApprovalNodeComponent({ data, selected }: NodeProps) {
  const prompt = (data.prompt as string) || "";
  const timeoutMinutes = (data.timeoutMinutes as number) || 60;

  return (
    <BaseNode
      icon={<UserCheck className="size-4" />}
      label={(data.label as string) || "Human Approval"}
      color="amber"
      selected={selected}
    >
      {prompt ? (
        <p className="truncate">{prompt}</p>
      ) : (
        <p className="italic">No prompt set</p>
      )}
      <p className="mt-0.5 text-[10px] text-muted-foreground">
        Timeout: {timeoutMinutes} min
      </p>
    </BaseNode>
  );
}

export const HumanApprovalNode = memo(HumanApprovalNodeComponent);
