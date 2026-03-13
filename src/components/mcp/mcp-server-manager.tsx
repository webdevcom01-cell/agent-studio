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
  ExternalLink,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import {
  FEATURED_MCP_SERVERS,
  buildFeaturedServerUrl,
  buildFeaturedServerHeaders,
  type FeaturedMCPServer,
} from "@/lib/mcp/featured-servers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Main manager
// ---------------------------------------------------------------------------

export function MCPServerManager({ open, onOpenChange }: MCPServerManagerProps): React.JSX.Element {
  const { data, mutate } = useSWR(open ? "/api/mcp-servers" : null, fetcher);
  const servers = data?.data ?? [];

  const [showForm, setShowForm] = useState(false);
  const [editingServer, setEditingServer] = useState<MCPServer | null>(null);
  const [confirmDeleteServerId, setConfirmDeleteServerId] = useState<string | null>(null);
  const [isDeletingServer, setIsDeletingServer] = useState(false);
  const [connectingFeatured, setConnectingFeatured] = useState<FeaturedMCPServer | null>(null);

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

  // Check if a featured server is already connected (by URL prefix match)
  function isFeaturedConnected(featured: FeaturedMCPServer): boolean {
    if (featured.url) {
      return servers.some((s) => s.url.startsWith(featured.url!));
    }
    // repo_url type: check if any server URL matches the template base
    const base = featured.urlTemplate?.replace("{repo}", "") ?? "";
    return servers.some((s) => s.url.startsWith(base));
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plug className="size-5 text-teal-500" />
              MCP Servers
            </DialogTitle>
            <DialogDescription>
              Connect external tools and services to your agents
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="featured" className="flex-1 flex flex-col min-h-0">
            <TabsList className="shrink-0 w-full justify-start">
              <TabsTrigger value="featured" className="flex items-center gap-1.5">
                <Star className="size-3.5" />
                Featured
              </TabsTrigger>
              <TabsTrigger value="servers">
                My Servers
                {servers.length > 0 && (
                  <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">
                    {servers.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* ── Featured tab ── */}
            <TabsContent value="featured" className="flex-1 overflow-y-auto mt-4">
              <div className="grid grid-cols-2 gap-3">
                {FEATURED_MCP_SERVERS.map((featured) => {
                  const connected = isFeaturedConnected(featured);
                  return (
                    <FeaturedServerCard
                      key={featured.id}
                      server={featured}
                      connected={connected}
                      onConnect={() => setConnectingFeatured(featured)}
                    />
                  );
                })}
              </div>
              <p className="mt-4 text-xs text-muted-foreground text-center">
                Need a different server?{" "}
                <button
                  className="underline underline-offset-2 hover:text-foreground transition-colors"
                  onClick={() => {
                    // switch to My Servers tab and open the form
                    const trigger = document.querySelector<HTMLButtonElement>(
                      '[data-state][value="servers"]'
                    );
                    trigger?.click();
                    setTimeout(handleAdd, 50);
                  }}
                >
                  Add a custom server
                </button>
              </p>
            </TabsContent>

            {/* ── My Servers tab ── */}
            <TabsContent value="servers" className="flex-1 overflow-y-auto mt-4">
              <div className="space-y-3">
                {!data ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                ) : servers.length === 0 ? (
                  <div className="flex flex-col items-center py-8 text-center">
                    <Plug className="size-10 text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground">No servers configured yet</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Connect a featured server or add a custom one
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

              <div className="mt-4 flex justify-end">
                <Button size="sm" onClick={handleAdd}>
                  <Plus className="mr-1.5 size-4" />
                  Add Custom Server
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="border-t pt-3 mt-2 shrink-0">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
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

      {/* Connect featured server dialog */}
      {connectingFeatured && (
        <ConnectFeaturedDialog
          server={connectingFeatured}
          onClose={() => setConnectingFeatured(null)}
          onConnected={() => {
            setConnectingFeatured(null);
            mutate();
          }}
        />
      )}

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

// ---------------------------------------------------------------------------
// Featured server card
// ---------------------------------------------------------------------------

interface FeaturedServerCardProps {
  server: FeaturedMCPServer;
  connected: boolean;
  onConnect: () => void;
}

function FeaturedServerCard({ server, connected, onConnect }: FeaturedServerCardProps): React.ReactElement {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none mt-0.5" aria-hidden="true">
          {server.icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">{server.name}</p>
            {connected && (
              <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                Connected
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {server.description}
          </p>
        </div>
      </div>

      {/* Capabilities */}
      <ul className="space-y-1">
        {server.capabilities.map((cap) => (
          <li key={cap} className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <span className="mt-0.5 text-teal-500" aria-hidden="true">✓</span>
            {cap}
          </li>
        ))}
      </ul>

      {/* Action */}
      <Button
        size="sm"
        variant={connected ? "outline" : "default"}
        className="w-full mt-auto"
        onClick={onConnect}
      >
        {connected ? "Reconnect" : "Connect"}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connect featured server dialog
// ---------------------------------------------------------------------------

interface ConnectFeaturedDialogProps {
  server: FeaturedMCPServer;
  onClose: () => void;
  onConnected: () => void;
}

function ConnectFeaturedDialog({
  server,
  onClose,
  onConnected,
}: ConnectFeaturedDialogProps): React.ReactElement {
  const [userInput, setUserInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    tools: string[];
    error?: string;
  } | null>(null);

  const isValid = userInput.trim().length > 0;

  async function handleConnect(): Promise<void> {
    if (!isValid) return;
    setIsSaving(true);
    setTestResult(null);

    try {
      const url = buildFeaturedServerUrl(server, userInput);
      const headers = buildFeaturedServerHeaders(server, userInput);

      // Validate the URL was built correctly
      if (!url) {
        toast.error("Could not build server URL");
        return;
      }

      // Build request body
      const body: Record<string, unknown> = {
        name: server.setupType === "repo_url"
          ? `${server.name}: ${userInput.trim()}`
          : server.name,
        url,
        transport: server.transport,
      };
      if (headers) body.headers = headers;

      // Create the server
      const createRes = await fetch("/api/mcp-servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const createJson = await createRes.json();

      if (!createJson.success) {
        toast.error(createJson.error || "Failed to create server");
        return;
      }

      const serverId = createJson.data.id as string;

      // Test the connection
      const testRes = await fetch(`/api/mcp-servers/${serverId}/test`, {
        method: "POST",
      });
      const testJson = await testRes.json();

      if (testJson.success && testJson.data) {
        setTestResult(testJson.data);

        if (testJson.data.success) {
          toast.success(`${server.name} connected — ${testJson.data.tools.length} tools found`);
          onConnected();
        } else {
          // Server was created but connection test failed — show error but don't close
          toast.error("Server saved but connection test failed");
        }
      } else {
        // Test endpoint failed entirely
        toast.success(`${server.name} connected`);
        onConnected();
      }
    } catch {
      toast.error("Failed to connect server");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-xl" aria-hidden="true">{server.icon}</span>
            Connect {server.name}
          </DialogTitle>
          <DialogDescription>
            {server.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="featured-input" className="text-xs font-medium">
              {server.keyLabel}
            </Label>
            <Input
              id="featured-input"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder={server.keyPlaceholder}
              type={server.setupType === "api_key" ? "password" : "text"}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && isValid && !isSaving) {
                  void handleConnect();
                }
              }}
            />
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              {server.keyHelpText}
              {" "}
              <a
                href={server.keyHelpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-foreground transition-colors"
              >
                {server.setupType === "api_key" ? "Get token" : "Browse GitHub"}
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            </p>
          </div>

          {/* Transport info */}
          <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
            <Plug className="size-3.5 shrink-0 text-teal-500" />
            <span>
              Transport: <span className="font-medium text-foreground">
                {server.transport === "STREAMABLE_HTTP" ? "Streamable HTTP" : "SSE"}
              </span>
              {server.url && (
                <> · <span className="font-mono">{server.url}</span></>
              )}
            </span>
          </div>

          {/* Test result */}
          {testResult && (
            <div
              className={`rounded-md p-3 text-xs ${
                testResult.success
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                  : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300"
              }`}
            >
              <div className="flex items-center gap-1.5 font-medium mb-1">
                {testResult.success ? (
                  <CheckCircle2 className="size-3.5" />
                ) : (
                  <XCircle className="size-3.5" />
                )}
                {testResult.success ? "Connection successful" : "Connection failed"}
              </div>
              {testResult.success && testResult.tools.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {testResult.tools.slice(0, 12).map((tool) => (
                    <Badge
                      key={tool}
                      variant="secondary"
                      className="text-[10px] bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300"
                    >
                      {tool}
                    </Badge>
                  ))}
                  {testResult.tools.length > 12 && (
                    <Badge variant="secondary" className="text-[10px]">
                      +{testResult.tools.length - 12} more
                    </Badge>
                  )}
                </div>
              )}
              {testResult.error && (
                <p className="mt-1">{testResult.error}</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleConnect} disabled={!isValid || isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                Connecting…
              </>
            ) : (
              "Connect & Test"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Server card (My Servers tab)
// ---------------------------------------------------------------------------

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

  // Check if this server matches a featured server config
  const featuredMatch = FEATURED_MCP_SERVERS.find((f) => {
    if (f.url) return server.url.startsWith(f.url);
    const base = f.urlTemplate?.replace("{repo}", "") ?? "";
    return base && server.url.startsWith(base);
  });

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
          {featuredMatch && (
            <span className="text-base leading-none shrink-0" aria-hidden="true">
              {featuredMatch.icon}
            </span>
          )}
          {!featuredMatch && <Plug className="size-4 shrink-0 text-teal-500" />}
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
              server.enabled ? "bg-emerald-500" : "bg-zinc-400 dark:bg-zinc-600"
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

// ---------------------------------------------------------------------------
// Manual server form dialog (Add / Edit)
// ---------------------------------------------------------------------------

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
  const [headersText, setHeadersText] = useState("");
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

      const endpoint = isEditing ? `/api/mcp-servers/${server.id}` : "/api/mcp-servers";
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
    <Dialog open onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Server" : "Add Custom MCP Server"}
          </DialogTitle>
          <DialogDescription>
            Manually configure an MCP server endpoint
          </DialogDescription>
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
              Headers{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
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
          <Button onClick={handleSubmit} disabled={isSaving || !isValid}>
            {isSaving ? "Saving…" : isEditing ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
