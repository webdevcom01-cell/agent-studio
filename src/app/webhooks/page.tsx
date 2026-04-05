"use client";

import Link from "next/link";
import useSWR from "swr";
import { Webhook, ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface Agent {
  id: string;
  name: string;
  description: string | null;
}

interface AgentsResponse {
  success: boolean;
  data: Agent[];
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function WebhooksPage() {
  const { data, isLoading } = useSWR<AgentsResponse>("/api/agents", fetcher);
  const agents = data?.data ?? [];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="h-[52px] shrink-0 flex items-center gap-3 border-b border-border px-4">
        <Webhook className="size-4 text-muted-foreground" />
        <h1 className="text-sm font-medium">Webhooks</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="space-y-2 max-w-2xl">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : agents.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="max-w-2xl">
            <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Select an agent
            </p>
            <ul className="space-y-1">
              {agents.map((agent) => (
                <AgentRow key={agent.id} agent={agent} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function AgentRow({ agent }: { agent: Agent }) {
  return (
    <li>
      <Link
        href={`/webhooks/${agent.id}`}
        className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 hover:bg-muted/30 transition-colors group"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{agent.name}</p>
          {agent.description && (
            <p className="text-xs text-muted-foreground truncate">{agent.description}</p>
          )}
        </div>
        <ArrowRight className="size-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0 ml-3" />
      </Link>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Webhook className="size-8 text-muted-foreground/30 mb-3" />
      <p className="text-sm font-medium">No agents yet</p>
      <p className="text-xs text-muted-foreground mt-1 mb-4">
        Create an agent first, then add webhook triggers in the flow builder.
      </p>
      <Button variant="outline" size="sm" asChild>
        <Link href="/agents/new">
          <Plus className="size-3.5 mr-1.5" />
          New agent
        </Link>
      </Button>
    </div>
  );
}
