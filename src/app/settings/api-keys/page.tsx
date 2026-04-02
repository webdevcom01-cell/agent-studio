"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  AlertTriangle,
  Shield,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApiKeyRecord {
  id: string;
  keyPrefix: string;
  name: string;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

interface CreateApiKeyResponse {
  success: true;
  data: ApiKeyRecord & { key: string };
}

const ALL_SCOPES = [
  { value: "agents:read", label: "Agents — Read", description: "List and view agents" },
  { value: "agents:write", label: "Agents — Write", description: "Create and update agents" },
  { value: "agents:delete", label: "Agents — Delete", description: "Delete agents" },
  { value: "flows:read", label: "Flows — Read", description: "Read flow definitions" },
  { value: "flows:execute", label: "Flows — Execute", description: "Run agent flows" },
  { value: "kb:read", label: "Knowledge — Read", description: "Search knowledge bases" },
  { value: "kb:write", label: "Knowledge — Write", description: "Add KB sources" },
  { value: "evals:read", label: "Evals — Read", description: "View eval results" },
  { value: "evals:run", label: "Evals — Run", description: "Trigger eval runs" },
  { value: "webhooks:read", label: "Webhooks — Read", description: "View webhook configs" },
] as const;

const EXPIRY_OPTIONS = [
  { label: "No expiry", value: "" },
  { label: "30 days", value: "30" },
  { label: "90 days", value: "90" },
  { label: "180 days", value: "180" },
  { label: "365 days", value: "365" },
] as const;

const fetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<{ success: boolean; data: ApiKeyRecord[] }>);

// ── Scope colour map ──────────────────────────────────────────────────────────

function scopeColour(scope: string): string {
  if (scope.startsWith("agents")) return "bg-blue-500/10 text-blue-400 border-blue-500/20";
  if (scope.startsWith("flows")) return "bg-violet-500/10 text-violet-400 border-violet-500/20";
  if (scope.startsWith("kb")) return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  if (scope.startsWith("evals")) return "bg-amber-500/10 text-amber-400 border-amber-500/20";
  if (scope.startsWith("webhooks")) return "bg-orange-500/10 text-orange-400 border-orange-500/20";
  return "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
}

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }): React.ReactElement {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-zinc-800"
      aria-label="Copy to clipboard"
    >
      {copied ? (
        <Check className="size-3.5 text-emerald-400" />
      ) : (
        <Copy className="size-3.5" />
      )}
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

// ── One-time key reveal dialog ────────────────────────────────────────────────

interface KeyRevealDialogProps {
  rawKey: string;
  keyName: string;
  onClose: () => void;
}

function KeyRevealDialog({
  rawKey,
  keyName,
  onClose,
}: KeyRevealDialogProps): React.ReactElement {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="size-5 text-emerald-400" />
            Save your API key
          </DialogTitle>
          <DialogDescription>
            This is the only time <strong className="text-foreground">{keyName}</strong> will be
            shown. Copy it now — it cannot be retrieved later.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-zinc-900/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <code className="text-xs font-mono text-emerald-300 break-all leading-relaxed">
              {rawKey}
            </code>
            <CopyButton text={rawKey} />
          </div>
        </div>

        <p className="flex items-start gap-2 rounded-md bg-amber-500/5 border border-amber-500/20 p-3 text-xs text-amber-300">
          <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
          Store this key in a secret manager (e.g. Railway environment variables). Never
          commit it to source code.
        </p>

        <DialogFooter>
          <Button onClick={onClose} className="w-full sm:w-auto">
            I&apos;ve saved the key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Create key dialog ─────────────────────────────────────────────────────────

interface CreateKeyDialogProps {
  onCreated: (rawKey: string, name: string) => void;
}

function CreateKeyDialog({ onCreated }: CreateKeyDialogProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>(["agents:read"]);
  const [expiresInDays, setExpiresInDays] = useState("");
  const [loading, setLoading] = useState(false);

  const toggleScope = (scope: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (selectedScopes.length === 0) {
      toast.error("Select at least one scope");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          scopes: selectedScopes,
          ...(expiresInDays ? { expiresInDays: parseInt(expiresInDays) } : {}),
        }),
      });
      const json = (await res.json()) as { success: boolean; data?: CreateApiKeyResponse["data"]; error?: string };

      if (!json.success || !json.data) {
        toast.error(json.error ?? "Failed to create API key");
        return;
      }

      setOpen(false);
      // Reset form
      setName("");
      setSelectedScopes(["agents:read"]);
      setExpiresInDays("");
      onCreated(json.data.key, json.data.name);
    } catch {
      toast.error("Failed to create API key");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus />
          New API key
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create API key</DialogTitle>
          <DialogDescription>
            API keys let you authenticate against the Agent Studio API from scripts,
            CI pipelines, or other services.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="key-name">Name</Label>
            <Input
              id="key-name"
              placeholder="e.g. CI pipeline, Local dev"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
            />
          </div>

          {/* Expiry */}
          <div className="space-y-1.5">
            <Label htmlFor="key-expiry">Expiry</Label>
            <select
              id="key-expiry"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"
            >
              {EXPIRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} className="bg-zinc-900">
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Scopes */}
          <div className="space-y-2">
            <Label>Permissions</Label>
            <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
              {ALL_SCOPES.map(({ value, label, description }) => (
                <label
                  key={value}
                  className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-accent/40 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedScopes.includes(value)}
                    onChange={() => toggleScope(value)}
                    className="mt-0.5 size-4 rounded accent-primary shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-none">{label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || selectedScopes.length === 0}>
              {loading && <RefreshCw className="animate-spin" />}
              Create key
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Revoke confirm dialog ─────────────────────────────────────────────────────

interface RevokeDialogProps {
  keyId: string;
  keyName: string;
  onRevoked: () => void;
}

function RevokeDialog({ keyId, keyName, onRevoked }: RevokeDialogProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRevoke = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/api-keys/${keyId}`, { method: "DELETE" });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!json.success) {
        toast.error(json.error ?? "Failed to revoke key");
        return;
      }
      toast.success(`"${keyName}" revoked`);
      setOpen(false);
      onRevoked();
    } catch {
      toast.error("Failed to revoke key");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          title="Revoke key"
        >
          <Trash2 />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-destructive" />
            Revoke API key
          </DialogTitle>
          <DialogDescription>
            Any application using{" "}
            <strong className="text-foreground">&ldquo;{keyName}&rdquo;</strong> will
            immediately lose access. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleRevoke} disabled={loading}>
            {loading && <RefreshCw className="animate-spin" />}
            Revoke key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Key row ───────────────────────────────────────────────────────────────────

interface KeyRowProps {
  apiKey: ApiKeyRecord;
  onRevoked: () => void;
}

function KeyRow({ apiKey, onRevoked }: KeyRowProps): React.ReactElement {
  const expired = isExpired(apiKey.expiresAt);

  return (
    <div className="flex items-start justify-between gap-4 py-4 px-5">
      <div className="flex items-start gap-3 min-w-0">
        <div className="mt-0.5 flex items-center justify-center size-8 rounded-md bg-zinc-800 border border-zinc-700 shrink-0">
          <Key className="size-4 text-zinc-400" />
        </div>
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">{apiKey.name}</span>
            {expired && (
              <Badge variant="destructive" className="text-xs">Expired</Badge>
            )}
          </div>
          <code className="text-xs text-muted-foreground font-mono">
            {apiKey.keyPrefix}••••••••••••••••••••••••••••••
          </code>
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            <span>Created {formatDate(apiKey.createdAt)}</span>
            <span className="text-border select-none">·</span>
            <span>Last used: {formatDate(apiKey.lastUsedAt)}</span>
            {apiKey.expiresAt && (
              <>
                <span className="text-border select-none">·</span>
                <span className={expired ? "text-destructive" : ""}>
                  {expired ? "Expired" : "Expires"} {formatDate(apiKey.expiresAt)}
                </span>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-1 pt-0.5">
            {apiKey.scopes.map((scope) => (
              <span
                key={scope}
                className={`inline-flex items-center rounded-full border px-1.5 py-px text-[10px] font-medium ${scopeColour(scope)}`}
              >
                {scope}
              </span>
            ))}
          </div>
        </div>
      </div>

      <RevokeDialog keyId={apiKey.id} keyName={apiKey.name} onRevoked={onRevoked} />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ApiKeysPage(): React.ReactElement {
  const { data, isLoading, mutate } = useSWR("/api/api-keys", fetcher);
  const [revealedKey, setRevealedKey] = useState<{ key: string; name: string } | null>(null);

  const keys = data?.data ?? [];

  const handleCreated = useCallback((rawKey: string, name: string) => {
    void mutate(); // refresh list
    setRevealedKey({ key: rawKey, name });
  }, [mutate]);

  const handleRevoked = useCallback(() => {
    void mutate();
  }, [mutate]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">API Keys</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Authenticate programmatic access to Agent Studio. Keys are hashed with
            SHA-256 — the raw key is shown only once.
          </p>
        </div>
        <CreateKeyDialog onCreated={handleCreated} />
      </div>

      {/* Keys list */}
      <Card className="py-0 gap-0">
        {isLoading ? (
          <div className="divide-y divide-border">
            {[1, 2, 3].map((i) => (
              <div key={i} className="px-5 py-4 flex items-center gap-3 animate-pulse">
                <div className="size-8 rounded-md bg-zinc-800" />
                <div className="space-y-2 flex-1">
                  <div className="h-3.5 w-40 rounded bg-zinc-800" />
                  <div className="h-2.5 w-64 rounded bg-zinc-800" />
                  <div className="h-2.5 w-48 rounded bg-zinc-800" />
                </div>
              </div>
            ))}
          </div>
        ) : keys.length === 0 ? (
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div className="flex items-center justify-center size-12 rounded-full bg-zinc-800">
              <Key className="size-5 text-zinc-400" />
            </div>
            <div>
              <p className="text-sm font-medium">No API keys yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Create a key to start using the Agent Studio API.
              </p>
            </div>
          </CardContent>
        ) : (
          <div className="divide-y divide-border">
            {keys.map((k) => (
              <KeyRow key={k.id} apiKey={k} onRevoked={handleRevoked} />
            ))}
          </div>
        )}
      </Card>

      {/* Docs callout */}
      <Card className="bg-zinc-900/40 border-zinc-700/50">
        <CardHeader className="pb-0">
          <CardTitle className="text-sm font-medium">Using API keys</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Pass the key as an <code className="text-xs bg-zinc-800 px-1 py-0.5 rounded">x-api-key</code> header
            in every request, or as a Bearer token:
          </p>
          <div className="rounded-md bg-zinc-900 border border-zinc-800 p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <code className="text-xs font-mono text-zinc-300">
                curl https://your-app.railway.app/api/agents \<br />
                &nbsp;&nbsp;-H &quot;x-api-key: as_live_…&quot;
              </code>
              <CopyButton text={`curl https://your-app.railway.app/api/agents \\\n  -H "x-api-key: as_live_…"`} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Maximum <strong className="text-foreground">20 active keys</strong> per account.
            Revoked keys stop working immediately.
          </p>
        </CardContent>
      </Card>

      {/* One-time key reveal modal */}
      {revealedKey && (
        <KeyRevealDialog
          rawKey={revealedKey.key}
          keyName={revealedKey.name}
          onClose={() => setRevealedKey(null)}
        />
      )}
    </div>
  );
}
