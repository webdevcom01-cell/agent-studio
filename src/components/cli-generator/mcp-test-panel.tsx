"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Copy,
  Check,
  Server,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ValidationIssue {
  file: string;
  severity: "error" | "warning";
  message: string;
}

interface MCPTestResult {
  valid: boolean;
  issues: ValidationIssue[];
  target: "python" | "typescript";
  claudeDesktopConfig: Record<string, unknown>;
  mcpServerId: string | null;
  fileCount: number;
}

interface MCPTestResponse {
  success: boolean;
  data: MCPTestResult;
}

interface MCPTestPanelProps {
  generationId: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function MCPTestPanel({ generationId }: MCPTestPanelProps): React.JSX.Element {
  const [copiedConfig, setCopiedConfig] = useState(false);

  const { data, isLoading, error } = useSWR<MCPTestResponse>(
    `/api/cli-generator/${generationId}/test-mcp`,
    fetcher,
    { revalidateOnFocus: false },
  );

  function handleCopyConfig(configJson: string): void {
    navigator.clipboard
      .writeText(configJson)
      .then(() => {
        setCopiedConfig(true);
        setTimeout(() => setCopiedConfig(false), 2000);
      })
      .catch(() => {
        // clipboard not available
      });
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Server className="size-4 animate-pulse" />
          Validating generated bridge…
        </div>
      </div>
    );
  }

  if (error || !data?.success) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">Validation unavailable</p>
      </div>
    );
  }

  const result = data.data;
  const configJson = JSON.stringify(result.claudeDesktopConfig, null, 2);
  const errors = result.issues.filter((i) => i.severity === "error");
  const warnings = result.issues.filter((i) => i.severity === "warning");

  return (
    <div className="flex flex-col gap-4">
      {/* Validation summary */}
      <div className="flex items-center gap-3">
        {result.valid ? (
          <CheckCircle2 className="size-5 text-green-500 shrink-0" />
        ) : (
          <XCircle className="size-5 text-red-500 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            {result.valid
              ? "Bridge validation passed"
              : `Validation failed — ${errors.length} error${errors.length !== 1 ? "s" : ""}`}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {result.fileCount} files generated &middot;{" "}
            {result.target === "typescript" ? "TypeScript MCP SDK" : "Python FastMCP"}
            {result.mcpServerId && " · Registered as MCP server"}
          </p>
        </div>
      </div>

      {/* Validation issues */}
      {result.issues.length > 0 && (
        <div className="flex flex-col gap-1">
          {errors.map((issue, i) => (
            <div
              key={i}
              className="flex items-start gap-2 text-xs text-red-500 bg-red-500/5 rounded px-2 py-1.5"
            >
              <XCircle className="size-3 shrink-0 mt-0.5" />
              <span>
                <span className="font-mono font-medium">{issue.file}</span>:{" "}
                {issue.message}
              </span>
            </div>
          ))}
          {warnings.map((issue, i) => (
            <div
              key={i}
              className="flex items-start gap-2 text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-500/5 rounded px-2 py-1.5"
            >
              <AlertTriangle className="size-3 shrink-0 mt-0.5" />
              <span>
                <span className="font-mono font-medium">{issue.file}</span>:{" "}
                {issue.message}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Claude Desktop config */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Claude Desktop Config
          </p>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => handleCopyConfig(configJson)}
            title="Copy config JSON"
          >
            {copiedConfig ? (
              <Check className="size-3 text-green-500" />
            ) : (
              <Copy className="size-3" />
            )}
          </Button>
        </div>
        <pre
          className={cn(
            "rounded-lg border border-zinc-700 bg-zinc-900 p-3",
            "text-[11px] leading-relaxed text-zinc-100 overflow-x-auto",
          )}
        >
          <code>{configJson}</code>
        </pre>
        <p className="text-[10px] text-muted-foreground">
          Add this to{" "}
          <code className="font-mono">~/.config/claude/claude_desktop_config.json</code>{" "}
          and restart Claude Desktop.
        </p>
      </div>
    </div>
  );
}
