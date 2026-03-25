"use client";

import { memo, useEffect, useState } from "react";
import { type NodeProps, useReactFlow } from "@xyflow/react";
import { Webhook, CheckCircle, PauseCircle, Copy } from "lucide-react";
import { BaseNode } from "./base-node";

interface WebhookStats {
  triggerCount: number;
  failureCount: number;
  lastTriggeredAt: string | null;
  enabled: boolean;
}

function formatRelative(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function WebhookTriggerNodeComponent({ data, id, selected }: NodeProps) {
  const name = (data.label as string) || "Webhook Trigger";
  const outputVariable = (data.outputVariable as string) || "webhook_payload";

  const [stats, setStats] = useState<WebhookStats | null>(null);
  const [copied, setCopied] = useState(false);

  const flow = useReactFlow();
  const agentId = (flow as unknown as { agentId?: string }).agentId;

  useEffect(() => {
    if (!agentId) return;
    // Load live stats for this webhook node
    fetch(`/api/agents/${agentId}/webhooks?nodeId=${id}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          const wh = res.data[0] as WebhookStats & { id: string };
          setStats({
            triggerCount: wh.triggerCount,
            failureCount: wh.failureCount,
            lastTriggeredAt: wh.lastTriggeredAt,
            enabled: wh.enabled,
          });
        }
      })
      .catch(() => {});
  }, [agentId, id]);

  function copyTriggerUrl() {
    if (!agentId || !stats) return;
    // We need the webhookId — fetch from the node-linked config
    fetch(`/api/agents/${agentId}/webhooks?nodeId=${id}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          const webhookId = (res.data[0] as { id: string }).id;
          const url = `${window.location.origin}/api/agents/${agentId}/trigger/${webhookId}`;
          void navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      })
      .catch(() => {});
  }

  return (
    <BaseNode
      icon={<Webhook className="size-4" />}
      label={name}
      color="violet"
      selected={selected}
      hasInput={false}
    >
      <div className="space-y-1.5">
        {/* Output variable */}
        <p className="text-[10px]">
          <span className="text-muted-foreground">payload → </span>
          <span className="font-mono text-foreground">{outputVariable}</span>
        </p>

        {/* Status badge */}
        <div className="flex items-center gap-1 flex-wrap">
          {stats !== null ? (
            stats.enabled ? (
              <span className="inline-flex items-center gap-0.5 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">
                <CheckCircle className="size-2.5" />
                Active
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                <PauseCircle className="size-2.5" />
                Disabled
              </span>
            )
          ) : (
            <span className="inline-flex items-center gap-0.5 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              Not deployed
            </span>
          )}

          {/* Copy URL button — only available after deploy */}
          {stats !== null && agentId && (
            <button
              onClick={copyTriggerUrl}
              title="Copy trigger URL"
              className="inline-flex items-center gap-0.5 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 transition-colors"
            >
              <Copy className="size-2.5" />
              {copied ? "Copied!" : "URL"}
            </button>
          )}
        </div>

        {/* Trigger stats */}
        {stats !== null && stats.triggerCount > 0 && (
          <p className="text-[10px] text-muted-foreground">
            {stats.triggerCount} trigger{stats.triggerCount !== 1 ? "s" : ""}
            {stats.failureCount > 0 && (
              <span className="text-red-400"> · {stats.failureCount} failed</span>
            )}
            {stats.lastTriggeredAt && (
              <span> · {formatRelative(stats.lastTriggeredAt)}</span>
            )}
          </p>
        )}
      </div>
    </BaseNode>
  );
}

export const WebhookTriggerNode = memo(WebhookTriggerNodeComponent);
