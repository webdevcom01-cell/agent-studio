"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { Database } from "lucide-react";
import { BaseNode } from "./base-node";

const DB_LABELS: Record<string, string> = {
  postgres: "PostgreSQL",
  mysql: "MySQL",
  sqlite: "SQLite",
};

function DatabaseQueryNodeComponent({ data, selected }: NodeProps) {
  const dbType = (data.dbType as string) || "postgres";
  const query = (data.query as string) || "";
  const readOnly = (data.readOnly as boolean) ?? true;

  return (
    <BaseNode
      icon={<Database className="size-4" />}
      label={(data.label as string) || "Database Query"}
      color="blue"
      selected={selected}
    >
      <p className="truncate">
        <span className="font-semibold">{DB_LABELS[dbType] ?? dbType}</span>
        {readOnly && <span className="text-muted-foreground"> (read-only)</span>}
      </p>
      {query && (
        <p className="truncate font-mono text-[10px] text-muted-foreground">
          {query.slice(0, 60)}
        </p>
      )}
    </BaseNode>
  );
}

export const DatabaseQueryNode = memo(DatabaseQueryNodeComponent);
