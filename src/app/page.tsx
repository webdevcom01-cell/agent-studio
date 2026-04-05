"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus, Bot, MessageSquare, Database, Trash2, MoreVertical,
  Download, Upload, Plug, ArrowRightLeft, Sparkles, Loader2,
  Webhook, Brain, FlaskConical, Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { MCPServerManager } from "@/components/mcp/mcp-server-manager";
import { AgentCallMonitor } from "@/components/a2a/agent-call-monitor";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AgentWizard, type WizardResult } from "@/components/dashboard/agent-wizard";
import { STARTER_FLOWS } from "@/data/starter-flows";

interface Agent {
  id: string;
  name: string;
  description: string;
  model: string;
  createdAt: string;
  _count: { conversations: number };
  knowledgeBase: { id: string } | null;
}

export default function DashboardPage(): React.ReactElement {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [showMCPManager, setShowMCPManager] = useState(false);
  const [showCallMonitor, setShowCallMonitor] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [generatingEvalIds, setGeneratingEvalIds] = useState<Set<string>>(new Set());
  const [isBackfilling, setIsBackfilling] = useState(false);

  useEffect(() => {
    fetchAgents();
  }, []);

  async function fetchAgents(): Promise<void> {
    try {
      const res = await fetch("/api/agents");
      const json = await res.json();
      if (json.success) setAgents(json.data);
    } catch {
      toast.error("Failed to load agents");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreate(data: WizardResult): Promise<void> {
    setIsCreating(true);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.success) {
        setShowCreate(false);
        const agentId: string = json.data.id;

        if (data.templateId) {
          const starterFlow = STARTER_FLOWS[data.templateId];
          if (starterFlow) {
            fetch(`/api/agents/${agentId}/flow`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ content: starterFlow }),
            }).catch(() => {});
          }
        }

        fetch(`/api/agents/${agentId}/evals/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetCount: 5, runOnDeploy: true }),
        }).catch(() => {});

        toast.success(
          data.templateId && STARTER_FLOWS[data.templateId]
            ? "Agent created with starter flow — opening builder"
            : "Agent created — eval suite generating in background"
        );
        router.push(`/builder/${agentId}`);
      } else {
        toast.error(json.error ?? "Failed to create agent");
      }
    } catch {
      toast.error("Failed to create agent");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!confirmDeleteId) return;
    setIsDeleting(true);
    try {
      await fetch(`/api/agents/${confirmDeleteId}`, { method: "DELETE" });
      setAgents((prev) => prev.filter((a) => a.id !== confirmDeleteId));
      toast.success("Agent deleted");
      setConfirmDeleteId(null);
    } catch {
      toast.error("Failed to delete agent");
    } finally {
      setIsDeleting(false);
    }
  }

  function handleExport(agentId: string, agentName: string): void {
    const link = document.createElement("a");
    link.href = `/api/agents/${agentId}/export`;
    link.download = `${agentName.replace(/[^a-zA-Z0-9-_]/g, "_")}.agent.json`;
    link.click();
  }

  async function handleGenerateEval(agentId: string, agentName: string): Promise<void> {
    setGeneratingEvalIds((prev) => new Set(prev).add(agentId));
    try {
      const res = await fetch(`/api/agents/${agentId}/evals/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetCount: 5, runOnDeploy: true }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Eval suite generated for "${agentName}"`);
      } else {
        toast.error(json.error ?? "Eval generation failed");
      }
    } catch {
      toast.error("Eval generation failed");
    } finally {
      setGeneratingEvalIds((prev) => {
        const next = new Set(prev);
        next.delete(agentId);
        return next;
      });
    }
  }

  async function handleBackfillEvals(): Promise<void> {
    setIsBackfilling(true);
    const toastId = toast.loading("Generating eval suites for all agents…");
    try {
      const res = await fetch("/api/evals/backfill", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        const { processed, failed, total } = json.data as {
          processed: number;
          failed: number;
          total: number;
        };
        if (total === 0) {
          toast.success("All agents already have eval suites.", { id: toastId });
        } else if (failed === 0) {
          toast.success(`Generated eval suites for ${processed} agent${processed !== 1 ? "s" : ""}.`, { id: toastId });
        } else {
          toast.warning(`Generated ${processed}/${total} eval suites — ${failed} failed.`, { id: toastId });
        }
      } else {
        toast.error(json.error ?? "Backfill failed", { id: toastId });
      }
    } catch {
      toast.error("Backfill failed", { id: toastId });
    } finally {
      setIsBackfilling(false);
    }
  }

  async function handleImport(file: File): Promise<void> {
    try {
      const text = await file.text();
      const data: unknown = JSON.parse(text);
      const res = await fetch("/api/agents/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Agent imported");
        fetchAgents();
      } else {
        toast.error(json.error ?? "Failed to import agent");
      }
    } catch {
      toast.error("Invalid agent file");
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Skip to main content
      </a>

      {/* Page header */}
      <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-border px-6">
        <div className="flex flex-1 items-baseline gap-2">
          <h1 className="text-sm font-medium tracking-tight text-foreground">My Agents</h1>
          {!isLoading && (
            <span className="text-xs text-muted-foreground/40" aria-live="polite">
              {agents.length}
            </span>
          )}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => importInputRef.current?.click()}
            title="Import agent"
            aria-label="Import agent"
            data-testid="import-agent-btn"
          >
            <Upload className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setShowMCPManager(true)}
            title="MCP Servers"
            aria-label="MCP Servers"
          >
            <Plug className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setShowCallMonitor(true)}
            title="Agent Calls"
            aria-label="Agent Calls"
          >
            <ArrowRightLeft className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleBackfillEvals}
            disabled={isBackfilling}
            title="Generate eval suites for all agents"
            aria-label="Generate eval suites for all agents"
          >
            {isBackfilling
              ? <Loader2 className="size-3.5 animate-spin" />
              : <Sparkles className="size-3.5" />
            }
          </Button>

          <div className="mx-1.5 h-4 w-px bg-border" />

          <Button
            size="sm"
            onClick={() => setShowCreate(true)}
            className="gap-1.5"
            data-testid="create-agent-btn"
          >
            <Plus className="size-3.5" />
            New Agent
          </Button>
        </div>

        <input
          ref={importInputRef}
          type="file"
          accept=".json"
          className="hidden"
          data-testid="import-file-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImport(file);
            e.target.value = "";
          }}
        />
      </div>

      {/* Content */}
      <main id="main-content" className="flex-1 overflow-y-auto px-6 py-6">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse space-y-3 rounded-lg border border-border bg-card p-4">
                <div className="h-3.5 w-32 rounded bg-muted" />
                <div className="h-3 w-48 rounded bg-muted" />
                <div className="h-3 w-24 rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-5 rounded-full border border-border p-4">
              <Bot className="size-5 text-muted-foreground/40" />
            </div>
            <h2 className="mb-1 text-sm font-medium">No agents yet</h2>
            <p className="mb-6 max-w-xs text-sm text-muted-foreground">
              Create your first agent and start building conversational AI flows.
            </p>
            <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5">
              <Plus className="size-3.5" />
              Create your first agent
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <div
                key={agent.id}
                data-testid="agent-card"
                className="group relative flex flex-col rounded-lg border border-border bg-card p-4 transition-colors duration-150 hover:border-border/80 hover:bg-card/80"
              >
                {/* Card header */}
                <div className="mb-1.5 flex items-start justify-between">
                  <h3 className="pr-2 text-sm font-medium leading-snug text-foreground">
                    {agent.name}
                  </h3>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`More options for ${agent.name}`}
                        className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <MoreVertical className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/webhooks/${agent.id}`}>
                          <Webhook className="size-3.5" />
                          Webhooks
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleExport(agent.id, agent.name)}>
                        <Download className="size-3.5" />
                        Export
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleGenerateEval(agent.id, agent.name)}
                        disabled={generatingEvalIds.has(agent.id)}
                      >
                        {generatingEvalIds.has(agent.id)
                          ? <Loader2 className="size-3.5 animate-spin" />
                          : <Sparkles className="size-3.5" />
                        }
                        Generate Eval Suite
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setConfirmDeleteId(agent.id)}
                      >
                        <Trash2 className="size-3.5" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Description */}
                {agent.description ? (
                  <p className="mb-4 line-clamp-2 flex-1 text-xs leading-relaxed text-muted-foreground">
                    {agent.description}
                  </p>
                ) : (
                  <div className="mb-4 flex-1" />
                )}

                {/* Meta */}
                <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground/40">
                  <span className="flex items-center gap-1">
                    <MessageSquare className="size-3" />
                    {agent._count.conversations} chat{agent._count.conversations !== 1 ? "s" : ""}
                  </span>
                  {agent.knowledgeBase && (
                    <span className="flex items-center gap-1">
                      <Database className="size-3" />
                      KB
                    </span>
                  )}
                  <span className="ml-auto rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/30">
                    {agent.model}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" asChild className="h-7 flex-1 text-xs font-normal">
                    <Link href={`/builder/${agent.id}`}>
                      <Workflow className="size-3" />
                      Builder
                    </Link>
                  </Button>
                  <Button size="sm" variant="outline" asChild className="h-7 flex-1 text-xs font-normal">
                    <Link href={`/memory/${agent.id}`}>
                      <Brain className="size-3" />
                      Memory
                    </Link>
                  </Button>
                  <Button size="sm" variant="outline" asChild className="h-7 flex-1 text-xs font-normal">
                    <Link href={`/evals/${agent.id}`}>
                      <FlaskConical className="size-3" />
                      Evals
                    </Link>
                  </Button>
                  <Button size="sm" asChild className="h-7 flex-1 text-xs font-normal">
                    <Link href={`/chat/${agent.id}`}>Chat</Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <AgentWizard
        open={showCreate}
        onOpenChange={setShowCreate}
        onSubmit={handleCreate}
        isSubmitting={isCreating}
      />
      <MCPServerManager open={showMCPManager} onOpenChange={setShowMCPManager} />
      <AgentCallMonitor open={showCallMonitor} onOpenChange={setShowCallMonitor} />
      <ConfirmDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}
        title="Delete Agent"
        description={`Are you sure you want to delete "${agents.find((a) => a.id === confirmDeleteId)?.name ?? "this agent"}"? All conversations and knowledge base data will be permanently removed.`}
        onConfirm={handleDelete}
        isLoading={isDeleting}
      />
    </div>
  );
}
