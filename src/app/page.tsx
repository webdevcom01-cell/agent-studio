"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  Plus, Bot, MessageSquare, Database, Trash2, MoreVertical,
  Download, Upload, LogOut, BarChart3, Plug, ArrowRightLeft,
  Sun, Moon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { MCPServerManager } from "@/components/mcp/mcp-server-manager";
import { AgentCallMonitor } from "@/components/a2a/agent-call-monitor";
import { useTheme } from "@/components/theme-provider";

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
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [showMCPManager, setShowMCPManager] = useState(false);
  const [showCallMonitor, setShowCallMonitor] = useState(false);

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

  async function handleCreate() {
    if (!newName.trim()) return;
    setIsCreating(true);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, description: newDescription }),
      });
      const json = await res.json();
      if (json.success) {
        setShowCreate(false);
        setNewName("");
        setNewDescription("");
        router.push(`/builder/${json.data.id}`);
      }
    } catch {
      toast.error("Failed to create agent");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDelete(agentId: string) {
    try {
      await fetch(`/api/agents/${agentId}`, { method: "DELETE" });
      setAgents((prev) => prev.filter((a) => a.id !== agentId));
      toast.success("Agent deleted");
    } catch {
      toast.error("Failed to delete agent");
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
              title="Analytics"
              className="text-muted-foreground hover:text-foreground"
            >
              <Link href="/analytics">
                <BarChart3 className="size-4" />
              </Link>
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowCallMonitor(true)}
              title="Agent Calls"
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowRightLeft className="size-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowMCPManager(true)}
              title="MCP Servers"
              className="text-muted-foreground hover:text-foreground"
            >
              <Plug className="size-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => importInputRef.current?.click()}
              title="Import agent"
              className="text-muted-foreground hover:text-foreground"
            >
              <Upload className="size-4" />
            </Button>

            <input
              ref={importInputRef}
              type="file"
              accept=".json"
              className="hidden"
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
                  className="text-muted-foreground hover:text-foreground"
                >
                  <LogOut className="size-4" />
                </Button>
                <div className="w-px h-4 bg-border mx-1.5" />
              </>
            )}

            {/* Theme toggle */}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={toggleTheme}
              title={theme === "dark" ? "Switch to light" : "Switch to dark"}
              className="text-muted-foreground hover:text-foreground"
            >
              {theme === "dark"
                ? <Sun className="size-4" />
                : <Moon className="size-4" />
              }
            </Button>

            {/* Divider */}
            <div className="w-px h-4 bg-border mx-1.5" />

            {/* New Agent — primary CTA */}
            <Button
              size="sm"
              onClick={() => setShowCreate(true)}
              className="gap-1.5 h-7 px-3 text-xs font-medium"
            >
              <Plus className="size-3" />
              New Agent
            </Button>
          </div>
        </div>
      </header>

      {/* ── Main Content ────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-5xl px-6 py-10">

        {/* Page heading */}
        <div className="mb-10">
          <h1 className="text-2xl font-light tracking-tight text-foreground">
            Your Agents
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
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
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground shrink-0"
                      >
                        <MoreVertical className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="text-sm">
                      <DropdownMenuItem onClick={() => handleExport(agent.id, agent.name)}>
                        <Download className="size-3.5" />
                        Export
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => handleDelete(agent.id)}
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

      {/* ── Create Agent Dialog ─────────────────────────────────────────── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-medium">New Agent</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="My Agent"
                autoFocus
                className="text-sm"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="What does this agent do?"
                rows={3}
                className="text-sm resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowCreate(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={isCreating || !newName.trim()}
            >
              {isCreating ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MCPServerManager
        open={showMCPManager}
        onOpenChange={setShowMCPManager}
      />

      <AgentCallMonitor
        open={showCallMonitor}
        onOpenChange={setShowCallMonitor}
      />
    </div>
  );
}
