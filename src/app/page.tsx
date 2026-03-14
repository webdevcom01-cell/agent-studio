"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  Plus, Bot, MessageSquare, Database, Trash2, MoreVertical,
  Download, Upload, LogOut, BarChart3, Plug, ArrowRightLeft,
  Sun, Moon, Compass, Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { MCPServerManager } from "@/components/mcp/mcp-server-manager";
import { AgentCallMonitor } from "@/components/a2a/agent-call-monitor";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useTheme } from "@/components/theme-provider";
import { AgentWizard, type WizardResult } from "@/components/dashboard/agent-wizard";

interface Agent {
  id: string;
  name: string;
  description: string;
  model: string;
  createdAt: string;
  _count: { conversations: number };
  knowledgeBase: { id: string } | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { theme, toggleTheme } = useTheme();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [showMCPManager, setShowMCPManager] = useState(false);
  const [showCallMonitor, setShowCallMonitor] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchAgents();
  }, []);

  async function fetchAgents() {
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

  async function handleCreate(data: WizardResult) {
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
        router.push(`/builder/${json.data.id}`);
      } else {
        toast.error(json.error ?? "Failed to create agent");
      }
    } catch {
      toast.error("Failed to create agent");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDelete() {
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
        toast.error(json.error || "Failed to import agent");
      }
    } catch {
      toast.error("Invalid agent file");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Skip to main content — screen reader + keyboard nav */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Skip to main content
      </a>

      {/* ── Top Navigation ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl px-6 h-14 flex items-center justify-between gap-4">

          {/* Wordmark */}
          <span className="text-sm font-medium tracking-tight select-none">
            Agent Studio
          </span>

          {/* Actions */}
          <div className="flex items-center gap-0.5">

            {/* Secondary — icon-only with tooltips */}
            <Button
              variant="ghost"
              size="icon-sm"
              asChild
              title="Discover Agents"
              aria-label="Discover Agents"
              className="text-muted-foreground hover:text-foreground"
            >
              <Link href="/discover">
                <Compass className="size-4" aria-hidden="true" />
              </Link>
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              asChild
              title="CLI Generator"
              aria-label="CLI Generator"
              className="text-muted-foreground hover:text-foreground"
            >
              <Link href="/cli-generator">
                <Terminal className="size-4" aria-hidden="true" />
              </Link>
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              asChild
              title="Analytics"
              aria-label="Analytics"
              className="text-muted-foreground hover:text-foreground"
            >
              <Link href="/analytics">
                <BarChart3 className="size-4" aria-hidden="true" />
              </Link>
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowCallMonitor(true)}
              title="Agent Calls"
              aria-label="Agent Calls"
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowRightLeft className="size-4" aria-hidden="true" />
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowMCPManager(true)}
              title="MCP Servers"
              aria-label="MCP Servers"
              className="text-muted-foreground hover:text-foreground"
            >
              <Plug className="size-4" aria-hidden="true" />
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => importInputRef.current?.click()}
              title="Import agent"
              aria-label="Import agent"
              className="text-muted-foreground hover:text-foreground"
              data-testid="import-agent-btn"
            >
              <Upload className="size-4" aria-hidden="true" />
            </Button>

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

            {/* Divider */}
            <div className="w-px h-4 bg-border mx-1.5" />

            {/* User */}
            {session?.user && (
              <>
                {session.user.image && (
                  <Image
                    src={session.user.image}
                    alt=""
                    width={24}
                    height={24}
                    className="rounded-full mx-1"
                  />
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => signOut()}
                  title="Sign out"
                  aria-label="Sign out"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <LogOut className="size-4" aria-hidden="true" />
                </Button>
                <div className="w-px h-4 bg-border mx-1.5" />
              </>
            )}

            {/* Theme toggle */}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={toggleTheme}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="text-muted-foreground hover:text-foreground"
            >
              {theme === "dark"
                ? <Sun className="size-4" aria-hidden="true" />
                : <Moon className="size-4" aria-hidden="true" />
              }
            </Button>

            {/* Divider */}
            <div className="w-px h-4 bg-border mx-1.5" />

            {/* New Agent — primary CTA */}
            <Button
              size="sm"
              onClick={() => setShowCreate(true)}
              className="gap-1.5 h-7 px-3 text-xs font-medium"
              data-testid="create-agent-btn"
            >
              <Plus className="size-3" />
              New Agent
            </Button>
          </div>
        </div>
      </header>

      {/* ── Main Content ────────────────────────────────────────────────── */}
      <main id="main-content" className="mx-auto max-w-5xl px-6 py-10">

        {/* Page heading */}
        <div className="mb-10">
          <h1 className="text-2xl font-light tracking-tight text-foreground">
            Your Agents
          </h1>
          <p className="mt-1 text-sm text-muted-foreground" aria-live="polite" aria-atomic="true">
            {isLoading
              ? "Loading..."
              : agents.length === 0
                ? "No agents yet"
                : `${agents.length} agent${agents.length !== 1 ? "s" : ""}`
            }
          </p>
        </div>

        {/* Agent Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="animate-pulse rounded-lg border border-border bg-card p-5 space-y-3"
              >
                <div className="h-4 w-28 rounded bg-muted" />
                <div className="h-3 w-40 rounded bg-muted" />
                <div className="h-3 w-20 rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : agents.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="rounded-full border border-border p-4 mb-5">
              <Bot className="size-6 text-muted-foreground" />
            </div>
            <h2 className="text-base font-medium mb-1">No agents yet</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs">
              Create your first agent and start building conversational AI flows.
            </p>
            <Button
              size="sm"
              onClick={() => setShowCreate(true)}
              className="gap-1.5"
            >
              <Plus className="size-3.5" />
              Create your first agent
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <div
                key={agent.id}
                data-testid="agent-card"
                className="group relative flex flex-col rounded-lg border border-border bg-card p-5 transition-all duration-200 hover:border-foreground/20 hover:shadow-sm"
              >
                {/* Card header */}
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-sm font-medium leading-snug text-foreground pr-2">
                    {agent.name}
                  </h3>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`More options for ${agent.name}`}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground shrink-0"
                      >
                        <MoreVertical className="size-3.5" aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="text-sm">
                      <DropdownMenuItem onClick={() => handleExport(agent.id, agent.name)}>
                        <Download className="size-3.5" />
                        Export
                      </DropdownMenuItem>
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
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-4 flex-1">
                    {agent.description}
                  </p>
                ) : (
                  <div className="flex-1 mb-4" />
                )}

                {/* Meta */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-4">
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
                </div>

                {/* Actions */}
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    asChild
                    className="flex-1 h-7 text-xs font-normal"
                  >
                    <Link href={`/builder/${agent.id}`}>Edit Flow</Link>
                  </Button>
                  <Button
                    size="sm"
                    asChild
                    className="flex-1 h-7 text-xs font-normal"
                  >
                    <Link href={`/chat/${agent.id}`}>Chat</Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ── Create Agent Wizard ─────────────────────────────────────────── */}
      <AgentWizard
        open={showCreate}
        onOpenChange={setShowCreate}
        onSubmit={handleCreate}
        isSubmitting={isCreating}
      />

      <MCPServerManager
        open={showMCPManager}
        onOpenChange={setShowMCPManager}
      />

      <AgentCallMonitor
        open={showCallMonitor}
        onOpenChange={setShowCallMonitor}
      />

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
