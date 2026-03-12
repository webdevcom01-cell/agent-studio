"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Plug,
  Plus,
  Trash2,
  Pencil,
  Loader2,
  CheckCircle2,
  XCircle,
  Wifi,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";

interface MCPServer {
  id: string;
  name: string;
  url: string;
  transport: "STREAMABLE_HTTP" | "SSE";
  enabled: boolean;
  toolsCache: string[] | null;
  createdAt: string;
  _count: { agents: number };
}

interface MCPServerManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TRANSPORT_OPTIONS = [
  { value: "STREAMABLE_HTTP", label: "Streamable HTTP" },
  { value: "SSE", label: "SSE" },
] as const;

const fetcher = (url: string): Promise<{ success: boolean; data: MCPServer[] }> =>
  fetch(url).then((r) => r.json());

export function MCPServerManager({ open, onOpenChange }: MCPServerManagerProps): React.JSX.Element {
  const { data, mutate } = useSWR(open ? "/api/mcp-servers" : null, fetcher);
  const servers = data?.data ?? [];

  const [showForm, setShowForm] = useState(false);
  const [editingServer, setEditingServer] = useState<MCPServer | null>(null);
  const [confirmDeleteServerId, setConfirmDeleteServerId] = useState<string | null>(null);
  const [isDeletingServer, setIsDeletingServer] = useState(false);

  function handleAdd(): void {
    setEditingServer(null);
    setShowForm(true);
  }

  function handleEdit(server: MCPServer): void {
    setEditingServer(server);
    setShowForm(true);
  }

  function handleFormClose(): void {
    setShowForm(false);
    setEditingServer(null);
  }

  async function handleToggleEnabled(server: MCPServer): Promise<void> {
    try {
      const res = await fetch(`/api/mcp-servers/${server.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !server.enabled }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error || "Failed to update server");
        return;
      }
      mutate();
    } catch {
      toast.error("Failed to update server");
    }
  }

  async function handleDelete(): Promise<void> {
    if (!confirmDeleteServerId) return;
    setIsDeletingServer(true);
    try {
      const res = await fetch(`/api/mcp-servers/${confirmDeleteServerId}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error || "Failed to delete server");
        return;
      }
      toast.success("Server deleted");
      setConfirmDeleteServerId(null);
      mutate();
    } catch {
      toast.error("Failed to delete server");
    } finally {
      setIsDeletingServer(false);
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plug className="size-5 text-teal-500" />
            MCP Servers
          </DialogTitle>
          <DialogDescription>
            Manage external tool servers for your agents
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 py-2">
          {!data ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : servers.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <Plug className="size-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No MCP servers configured</p>
              <p className="text-xs text-muted-foreground mt-1">
                Add a server to connect external tools to your agents
              </p>
            </div>
          ) : (
            servers.map((server) => (
              <ServerCard
                key={server.id}
                server={server}
                onEdit={() => handleEdit(server)}
                onDelete={() => setConfirmDeleteServerId(server.id)}
                onToggleEnabled={() => handleToggleEnabled(server)}
                onTestComplete={() => mutate()}
              />
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleAdd}>
            <Plus className="mr-1.5 size-4" />
            Add Server
          </Button>
        </DialogFooter>

        {showForm && (
          <ServerFormDialog
            server={editingServer}
            onClose={handleFormClose}
            onSaved={() => {
              handleFormClose();
              mutate();
            }}
          />
        )}
      </DialogContent>
    </Dialog>

    <ConfirmDialog
      open={confirmDeleteServerId !== null}
      onOpenChange={(open) => { if (!open) setConfirmDeleteServerId(null); }}
      title="Delete MCP Server"
      description={`Are you sure you want to delete "${servers.find((s) => s.id === confirmDeleteServerId)?.name ?? "this server"}"? All agent connections to this server will be removed.`}
      onConfirm={handleDelete}
      isLoading={isDeletingServer}
    />
    </>
  );
}

interface ServerCardProps {
  server: MCPServer;
  onEdit: () => void;
  onDelete: () => void;
  onToggleEnabled: () => void;
  onTestComplete: () => void;
}

function ServerCard({
  server,
  onEdit,
  onDelete,
  onToggleEnabled,
  onTestComplete,
}: ServerCardProps): React.ReactElement {
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    tools: string[];
    error?: string;
  } | null>(null);

  const toolCount = server.toolsCache?.length ?? 0;

  async function handleTest(): Promise<void> {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/mcp-servers/${server.id}/test`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.success) {
        setTestResult(json.data);
        if (json.data.success) {
          toast.success(`Connected — ${json.data.tools.length} tools found`);
          onTestComplete();
        } else {
          toast.error(json.data.error || "Connection failed");
        }
      } else {
        toast.error(json.error || "Test failed");
      }
    } catch {
      toast.error("Failed to test connection");
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Plug className="size-4 shrink-0 text-teal-500" />
          <span className="font-medium text-sm truncate">{server.name}</span>
          <Badge variant="outline" className="text-[10px] shrink-0">
            {server.transport === "SSE" ? "SSE" : "HTTP"}
          </Badge>
          {!server.enabled && (
            <Badge variant="secondary" className="text-[10px] shrink-0">
              Disabled
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleTest}
            disabled={isTesting}
            title="Test connection"
          >
            {isTesting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Wifi className="size-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onEdit}
            title="Edit"
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onDelete}
            title="Delete"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground truncate">{server.url}</p>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <button
          onClick={onToggleEnabled}
          className="flex items-center gap-1 hover:text-foreground transition-colors"
        >
          <div
            className={`size-2 rounded-full ${
              server.enabled
                ? "bg-emerald-500"
                : "bg-zinc-400 dark:bg-zinc-600"
            }`}
          />
          {server.enabled ? "Enabled" : "Disabled"}
        </button>
        <span>{server._count.agents} agent{server._count.agents !== 1 ? "s" : ""}</span>
        <span>{toolCount} tool{toolCount !== 1 ? "s" : ""}</span>
      </div>

      {testResult && (
        <div
          className={`rounded p-2 text-xs ${
            testResult.success
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
              : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300"
          }`}
        >
          <div className="flex items-center gap-1.5 mb-1">
            {testResult.success ? (
              <CheckCircle2 className="size-3.5" />
            ) : (
              <XCircle className="size-3.5" />
            )}
            <span className="font-medium">
              {testResult.success ? "Connection successful" : "Connection failed"}
            </span>
          </div>
          {testResult.success && testResult.tools.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {testResult.tools.map((tool) => (
                <Badge
                  key={tool}
                  variant="secondary"
                  className="text-[10px] bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300"
                >
                  {tool}
                </Badge>
              ))}
            </div>
          )}
          {testResult.error && (
            <p className="mt-1">{testResult.error}</p>
          )}
        </div>
      )}
    </div>
  );
}

interface ServerFormDialogProps {
  server: MCPServer | null;
  onClose: () => void;
  onSaved: () => void;
}

function ServerFormDialog({
  server,
  onClose,
  onSaved,
}: ServerFormDialogProps): React.ReactElement {
  const isEditing = server !== null;
  const [name, setName] = useState(server?.name ?? "");
  const [url, setUrl] = useState(server?.url ?? "");
  const [transport, setTransport] = useState<string>(
    server?.transport ?? "STREAMABLE_HTTP"
  );
  const [headersText, setHeadersText] = useState(
    server && server.toolsCache
      ? ""
      : ""
  );
  const [isSaving, setIsSaving] = useState(false);

  const isValid = name.trim() !== "" && url.trim() !== "";

  function getHeadersJson(): Record<string, string> | undefined {
    if (!headersText.trim()) return undefined;
    try {
      return JSON.parse(headersText);
    } catch {
      return undefined;
    }
  }

  async function handleSubmit(): Promise<void> {
    if (!isValid) return;

    if (headersText.trim()) {
      try {
        JSON.parse(headersText);
      } catch {
        toast.error("Headers must be valid JSON");
        return;
      }
    }

    setIsSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        url: url.trim(),
        transport,
      };
      const headers = getHeadersJson();
      if (headers) body.headers = headers;

      const endpoint = isEditing
        ? `/api/mcp-servers/${server.id}`
        : "/api/mcp-servers";
      const method = isEditing ? "PATCH" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!json.success) {
        toast.error(json.error || `Failed to ${isEditing ? "update" : "create"} server`);
        return;
      }

      toast.success(isEditing ? "Server updated" : "Server created");
      onSaved();
    } catch {
      toast.error(`Failed to ${isEditing ? "update" : "create"} server`);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Server" : "Add MCP Server"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My MCP Server"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>URL</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://mcp-server.example.com/mcp"
            />
          </div>

          <div className="space-y-2">
            <Label>Transport</Label>
            <select
              value={transport}
              onChange={(e) => setTransport(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              {TRANSPORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>
              Headers <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              value={headersText}
              onChange={(e) => setHeadersText(e.target.value)}
              placeholder='{"Authorization": "Bearer ..."}'
              rows={3}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">JSON object of HTTP headers</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSaving || !isValid}
          >
            {isSaving ? "Saving..." : isEditing ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
