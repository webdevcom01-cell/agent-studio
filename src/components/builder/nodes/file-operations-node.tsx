"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { FolderOpen } from "lucide-react";
import { BaseNode } from "./base-node";

const OP_LABELS: Record<string, string> = {
  read: "Read",
  write: "Write",
  list: "List",
  delete: "Delete",
  presigned_url: "Presigned URL",
};

const PROVIDER_LABELS: Record<string, string> = {
  s3: "S3",
  gdrive: "Google Drive",
  base64: "Base64",
};

function FileOperationsNodeComponent({ data, selected }: NodeProps) {
  const operation = (data.operation as string) || "read";
  const provider = (data.provider as string) || "s3";

  return (
    <BaseNode
      icon={<FolderOpen className="size-4" />}
      label={(data.label as string) || "File Operations"}
      color="yellow"
      selected={selected}
    >
      <p className="truncate">
        <span className="font-semibold">{OP_LABELS[operation] ?? operation}</span>{" "}
        <span className="text-muted-foreground">via {PROVIDER_LABELS[provider] ?? provider}</span>
      </p>
    </BaseNode>
  );
}

export const FileOperationsNode = memo(FileOperationsNodeComponent);
