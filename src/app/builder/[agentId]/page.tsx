"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { ArrowLeft, MessageSquare, Database, FlaskConical, Webhook } from "lucide-react";
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
}) {
  const { agentId } = use(params);
  const [agent, setAgent] = useState<AgentData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadAgent() {
      try {
        const res = await fetch(`/api/agents/${agentId}`);
        const json = await res.json();
        if (json.success) {
          setAgent(json.data);
        } else {
          setError(json.error || "Agent not found");
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
      <div className="flex h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-destructive">{error || "Agent not found"}</p>
        <Button variant="outline" asChild>
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
    <div className="flex h-screen flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Button variant="ghost" size="icon-sm" aria-label="Back to dashboard" asChild>
          <Link href="/">
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Link>
        </Button>
        <div className="flex-1" />
        <Button variant="outline" size="sm" asChild>
          <Link href={`/knowledge/${agentId}`}>
            <Database className="mr-1.5 size-4" />
            Knowledge Base
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/evals/${agentId}`}>
            <FlaskConical className="mr-1.5 size-4" />
            Evals
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/webhooks/${agentId}`}>
            <Webhook className="mr-1.5 size-4" />
            Webhooks
          </Link>
        </Button>
        <Button size="sm" asChild>
          <Link href={`/chat/${agentId}`}>
            <MessageSquare className="mr-1.5 size-4" />
            Test Chat
          </Link>
        </Button>
      </div>
      <div className="flex-1">
        <FlowBuilder
          agentId={agentId}
          agentName={agent.name}
          initialContent={initialContent}
        />
      </div>
    </div>
  );
}
