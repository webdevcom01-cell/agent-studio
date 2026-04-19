"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Brain, Zap, TrendingUp, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentSummary {
  id: string;
  name: string;
  eccEnabled: boolean;
  _count: { conversations: number };
}

interface AgentsResponse {
  success: boolean;
  data: AgentSummary[];
}

// ─── Fetcher ─────────────────────────────────────────────────────────────────

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Network error");
  return res.json() as Promise<T>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EccIndexPage(): React.JSX.Element {
  const { data, isLoading } = useSWR<AgentsResponse>("/api/agents", fetcher);
  const [search, setSearch] = useState("");

  const agents = (data?.data ?? []).filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase()),
  );

  const enabledCount = (data?.data ?? []).filter((a) => a.eccEnabled).length;
  const total = data?.data?.length ?? 0;

  return (
    <div className="flex h-full flex-col overflow-auto bg-background">
      {/* Header */}
      <div className="border-b border-border px-6 py-5">
        <div className="flex items-center gap-3">
          <Brain className="size-6 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">ECC Learning</h1>
            <p className="text-sm text-muted-foreground">
              Emergent Capability Capture — automatic pattern learning from agent executions
            </p>
          </div>
        </div>

        {/* Quick stats */}
        {!isLoading && total > 0 && (
          <div className="mt-4 flex items-center gap-6 text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Zap className="size-3.5 text-primary" />
              {enabledCount} / {total} agents with ECC enabled
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <TrendingUp className="size-3.5 text-emerald-400" />
              Select an agent to view its instincts
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 p-6">
        {/* Search */}
        <input
          type="text"
          placeholder="Search agents…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-4 w-full max-w-sm rounded-md border border-border bg-muted/30 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />

        {/* Agent list */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Brain className="size-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              {search ? "No agents match your search." : "No agents yet."}
            </p>
            <Button variant="outline" size="sm" asChild className="mt-2">
              <Link href="/">Go to Dashboard</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {agents.map((agent) => (
              <Link
                key={agent.id}
                href={`/ecc/${agent.id}`}
                className={cn(
                  "flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3 transition-colors",
                  "hover:border-primary/40 hover:bg-muted/30",
                )}
              >
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium">{agent.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {agent._count.conversations} conversation
                    {agent._count.conversations === 1 ? "" : "s"}
                  </p>
                </div>

                <Badge
                  variant="outline"
                  className={cn(
                    "shrink-0 text-xs",
                    agent.eccEnabled
                      ? "border-emerald-700 bg-emerald-900/30 text-emerald-300"
                      : "border-zinc-700 text-zinc-500",
                  )}
                >
                  {agent.eccEnabled ? (
                    <CheckCircle2 className="mr-1 size-3" />
                  ) : (
                    <AlertCircle className="mr-1 size-3" />
                  )}
                  {agent.eccEnabled ? "Learning" : "Off"}
                </Badge>

                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
