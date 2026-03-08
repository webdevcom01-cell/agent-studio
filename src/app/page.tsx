"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Plus, Bot, MessageSquare, Database, Trash2, MoreVertical, Download, Upload, LogOut, BarChart3, Plug, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
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
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Agent Studio</h1>
          <p className="text-muted-foreground mt-1">
            Build and manage your AI agents
          </p>
        </div>
        <div className="flex items-center gap-2">
          {session?.user && (
            <div className="flex items-center gap-2 mr-2">
              {session.user.image && (
                <Image
                  src={session.user.image}
                  alt=""
                  width={28}
                  height={28}
                  className="rounded-full"
                />
              )}
              <span className="text-sm text-muted-foreground hidden sm:inline">
                {session.user.name ?? session.user.email}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => signOut()}
                title="Sign out"
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          )}
          <Button variant="outline" asChild>
            <Link href="/analytics">
              <BarChart3 className="mr-2 size-4" />
              Analytics
            </Link>
          </Button>
          <Button variant="outline" onClick={() => setShowCallMonitor(true)}>
            <ArrowRightLeft className="mr-2 size-4" />
            Agent Calls
          </Button>
          <Button variant="outline" onClick={() => setShowMCPManager(true)}>
            <Plug className="mr-2 size-4" />
            MCP Servers
          </Button>
          <Button variant="outline" onClick={() => importInputRef.current?.click()}>
            <Upload className="mr-2 size-4" />
            Import
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
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 size-4" />
            New Agent
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-5 w-32 rounded bg-muted" />
                <div className="h-4 w-48 rounded bg-muted" />
              </CardHeader>
              <CardContent>
                <div className="h-4 w-24 rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : agents.length === 0 ? (
        <Card className="py-12">
          <CardContent className="flex flex-col items-center text-center">
            <Bot className="size-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">No agents yet</h3>
            <p className="text-muted-foreground mt-1 mb-4">
              Create your first AI agent to get started
            </p>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 size-4" />
              Create Agent
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <Card key={agent.id} className="group relative">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{agent.name}</CardTitle>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-xs" className="opacity-0 group-hover:opacity-100">
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => handleExport(agent.id, agent.name)}
                      >
                        <Download className="size-4" />
                        Export
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => handleDelete(agent.id)}
                      >
                        <Trash2 className="size-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {agent.description && (
                  <CardDescription className="line-clamp-2">
                    {agent.description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MessageSquare className="size-3" />
                    {agent._count.conversations} chats
                  </span>
                  {agent.knowledgeBase && (
                    <span className="flex items-center gap-1">
                      <Database className="size-3" />
                      KB
                    </span>
                  )}
                </div>
              </CardContent>
              <CardFooter className="gap-2">
                <Button size="sm" variant="outline" asChild className="flex-1">
                  <Link href={`/builder/${agent.id}`}>Edit Flow</Link>
                </Button>
                <Button size="sm" asChild className="flex-1">
                  <Link href={`/chat/${agent.id}`}>Chat</Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Agent</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="My Agent"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="What does this agent do?"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isCreating || !newName.trim()}>
              {isCreating ? "Creating..." : "Create"}
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
