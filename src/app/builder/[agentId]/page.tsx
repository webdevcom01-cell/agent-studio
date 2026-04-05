"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { FlowBuilder } from "@/components/builder/flow-builder";
import { Button } from "@/components/ui/button";
import type { FlowContent } from "@/types";

interface AgentData {
  id: string;
  name: string;
  flow: { content: FlowContent } | null;
}

export default function BuilderPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}): React.ReactElement {
  const { agentId } = use(params);
  const [agent, setAgent] = useState<AgentData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadAgent(): Promise<void> {
      try {
        const res = await fetch(`/api/agents/${agentId}`);
        const json = await res.json();
        if (json.success) {
          setAgent(json.data);
        } else {
          setError(json.error ?? "Agent not found");
        }
      } catch {
        setError("Failed to load agent");
      } finally {
        setIsLoading(false);
      }
    }
    loadAgent();
  }, [agentId]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="animate-pulse text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  if (error ?? !agent) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-sm text-destructive">{error ?? "Agent not found"}</p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/">Back to Dashboard</Link>
        </Button>
      </div>
    );
  }

  const initialContent: FlowContent = agent.flow?.content ?? {
    nodes: [],
    edges: [],
    variables: [],
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <FlowBuilder
        agentId={agentId}
        agentName={agent.name}
        initialContent={initialContent}
      />
    </div>
  );
}
