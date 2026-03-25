"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import {
  ArrowLeft, Plus, Trash2, Webhook, Copy, Eye, EyeOff, RefreshCw,
  CheckCircle2, XCircle, Loader2, MoreVertical, Clock, Zap, Send,
  ChevronDown, ChevronRight, Filter, Layers, X, ExternalLink, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { WEBHOOK_PRESETS, type WebhookPreset } from "@/lib/webhooks/presets";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WebhookExecution {
  id: string;
  status: string;
  triggeredAt: string;
  completedAt: string | null;
  durationMs: number | null;
  eventType: string | null;
  sourceIp: string | null;
  conversationId: string | null;
  errorMessage: string | null;
  /** Non-null when a stored payload exists and replay is available. */
  rawPayload: string | null;
  /** True when this row is itself a replay execution. */
  isReplay: boolean;
  /** Original execution ID this was replayed from, if any. */
  replayOf: string | null;
}

interface BodyMapping {
  jsonPath: string;
  variableName: string;
  type?: "string" | "number" | "boolean" | "object";
}

interface HeaderMapping {
  headerName: string;
  variableName: string;
}

interface WebhookSummary {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  triggerCount: number;
  failureCount: number;
  lastTriggeredAt: string | null;
  nodeId: string | null;
  eventFilters: string[];
  bodyMappings: BodyMapping[];
  headerMappings: HeaderMapping[];
  createdAt: string;
  updatedAt: string;
  _count: { executions: number };
}

interface WebhookDetail extends WebhookSummary {
  secret: string;
  executions: WebhookExecution[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(status: string): string {
  if (status === "COMPLETED") return "text-green-400";
  if (status === "FAILED" || status === "SKIPPED") return "text-red-400";
  if (status === "RUNNING") return "text-blue-400";
  return "text-zinc-400";
}

function statusBadgeClass(status: string): string {
  if (status === "COMPLETED")
    return "bg-green-900/30 text-green-300 border-green-800/50";
  if (status === "FAILED" || status === "SKIPPED")
    return "bg-red-900/30 text-red-300 border-red-800/50";
  if (status === "RUNNING")
    return "bg-blue-900/30 text-blue-300 border-blue-800/50";
  return "bg-zinc-800 text-zinc-400 border-zinc-700";
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Preset Picker Dialog ─────────────────────────────────────────────────────

function PresetPickerDialog({
  open, onClose, onApply,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (preset: WebhookPreset) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Apply Provider Preset</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Pre-configure body/header mappings and event filters for a known webhook provider.
            Existing mappings will be replaced.
          </p>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {WEBHOOK_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => { onApply(preset); onClose(); }}
              className="text-left rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 hover:border-violet-700/60 hover:bg-violet-900/10 transition-colors group"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-lg">{preset.icon}</span>
                <span className="text-sm font-medium">{preset.name}</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{preset.description}</p>
              {preset.id !== "generic" && (
                <p className="text-[10px] text-violet-400 mt-2">
                  {preset.bodyMappings.length} body · {preset.headerMappings.length} header mappings
                </p>
              )}
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Event Filter Editor ──────────────────────────────────────────────────────

function EventFilterEditor({
  filters,
  suggestions,
  onAdd,
  onRemove,
}: {
  filters: string[];
  suggestions: string[];
  onAdd: (val: string) => void;
  onRemove: (val: string) => void;
}) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const filtered = suggestions.filter(
    (s) => !filters.includes(s) && s.toLowerCase().includes(input.toLowerCase())
  );

  function add(val: string) {
    const trimmed = val.trim();
    if (!trimmed || filters.includes(trimmed)) return;
    onAdd(trimmed);
    setInput("");
    setShowSuggestions(false);
  }

  return (
    <div className="space-y-2">
      {/* Current filters as tags */}
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {filters.length === 0 ? (
          <span className="text-xs text-zinc-600 italic">No filters — all events are accepted</span>
        ) : (
          filters.map((f) => (
            <span
              key={f}
              className="inline-flex items-center gap-1 rounded-full bg-violet-900/30 border border-violet-700/40 px-2 py-0.5 text-xs text-violet-300"
            >
              {f}
              <button
                type="button"
                onClick={() => onRemove(f)}
                className="hover:text-violet-100 transition-colors"
                aria-label={`Remove ${f}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))
        )}
      </div>

      {/* Input */}
      <div className="relative">
        <Input
          value={input}
          onChange={(e) => { setInput(e.target.value); setShowSuggestions(true); }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(input); }
          }}
          placeholder="e.g. push, payment_intent.succeeded …"
          className="h-8 text-xs"
        />
        {input.trim() && !filters.includes(input.trim()) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 px-2 text-xs"
            onClick={() => add(input)}
          >
            Add
          </Button>
        )}

        {/* Suggestions dropdown */}
        {showSuggestions && filtered.length > 0 && (
          <div className="absolute z-50 top-full mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 shadow-lg py-1 max-h-48 overflow-y-auto">
            {filtered.slice(0, 20).map((s) => (
              <button
                key={s}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); add(s); }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-800 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="text-[11px] text-zinc-600">
        Leave empty to accept all events. Press Enter or click Add to add a filter.
      </p>
    </div>
  );
}

// ─── Mappings Editor ──────────────────────────────────────────────────────────

function BodyMappingsEditor({
  mappings,
  onChange,
}: {
  mappings: BodyMapping[];
  onChange: (m: BodyMapping[]) => void;
}) {
  function updateRow(idx: number, field: keyof BodyMapping, val: string) {
    const next = mappings.map((m, i) =>
      i === idx ? { ...m, [field]: val } : m
    );
    onChange(next);
  }

  function removeRow(idx: number) {
    onChange(mappings.filter((_, i) => i !== idx));
  }

  function addRow() {
    onChange([...mappings, { jsonPath: "", variableName: "", type: "string" }]);
  }

  return (
    <div className="space-y-2">
      {mappings.length > 0 ? (
        <div className="space-y-1.5">
          <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-1.5 text-[10px] text-zinc-500 px-0.5">
            <span>JSONPath</span><span>Variable name</span><span>Type</span><span />
          </div>
          {mappings.map((m, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto] gap-1.5 items-center">
              <Input
                value={m.jsonPath}
                onChange={(e) => updateRow(i, "jsonPath", e.target.value)}
                placeholder="$.action"
                className="h-7 text-xs font-mono"
              />
              <Input
                value={m.variableName}
                onChange={(e) => updateRow(i, "variableName", e.target.value)}
                placeholder="my_var"
                className="h-7 text-xs font-mono"
              />
              <select
                value={m.type ?? "string"}
                onChange={(e) => updateRow(i, "type", e.target.value)}
                className="h-7 rounded-md border border-input bg-background px-1.5 text-[11px]"
              >
                <option>string</option>
                <option>number</option>
                <option>boolean</option>
                <option>object</option>
              </select>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => removeRow(i)}
              >
                <X className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-zinc-600 italic">No body mappings configured.</p>
      )}
      {mappings.length < 20 && (
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addRow}>
          <Plus className="size-3 mr-1" /> Add Mapping
        </Button>
      )}
    </div>
  );
}

function HeaderMappingsEditor({
  mappings,
  onChange,
}: {
  mappings: HeaderMapping[];
  onChange: (m: HeaderMapping[]) => void;
}) {
  function updateRow(idx: number, field: keyof HeaderMapping, val: string) {
    const next = mappings.map((m, i) =>
      i === idx ? { ...m, [field]: val } : m
    );
    onChange(next);
  }

  function removeRow(idx: number) {
    onChange(mappings.filter((_, i) => i !== idx));
  }

  function addRow() {
    onChange([...mappings, { headerName: "", variableName: "" }]);
  }

  return (
    <div className="space-y-2">
      {mappings.length > 0 ? (
        <div className="space-y-1.5">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 text-[10px] text-zinc-500 px-0.5">
            <span>Header name</span><span>Variable name</span><span />
          </div>
          {mappings.map((m, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-center">
              <Input
                value={m.headerName}
                onChange={(e) => updateRow(i, "headerName", e.target.value)}
                placeholder="x-custom-header"
                className="h-7 text-xs font-mono"
              />
              <Input
                value={m.variableName}
                onChange={(e) => updateRow(i, "variableName", e.target.value)}
                placeholder="my_header"
                className="h-7 text-xs font-mono"
              />
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => removeRow(i)}
              >
                <X className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-zinc-600 italic">No header mappings configured.</p>
      )}
      {mappings.length < 20 && (
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addRow}>
          <Plus className="size-3 mr-1" /> Add Mapping
        </Button>
      )}
    </div>
  );
}

// ─── Config Tab ───────────────────────────────────────────────────────────────

function ConfigTab({
  agentId,
  webhookId,
  detail,
  onUpdated,
}: {
  agentId: string;
  webhookId: string;
  detail: WebhookDetail;
  onUpdated: (changes: Partial<WebhookDetail>) => void;
}) {
  const [showPresetPicker, setShowPresetPicker] = useState(false);
  const [eventFilters, setEventFilters] = useState<string[]>(detail.eventFilters ?? []);
  const [bodyMappings, setBodyMappings] = useState<BodyMapping[]>(
    (detail.bodyMappings as BodyMapping[]) ?? []
  );
  const [headerMappings, setHeaderMappings] = useState<HeaderMapping[]>(
    (detail.headerMappings as HeaderMapping[]) ?? []
  );
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Track dirtiness
  useEffect(() => {
    const filtersChanged = JSON.stringify(eventFilters) !== JSON.stringify(detail.eventFilters ?? []);
    const bodyChanged = JSON.stringify(bodyMappings) !== JSON.stringify(detail.bodyMappings ?? []);
    const headerChanged = JSON.stringify(headerMappings) !== JSON.stringify(detail.headerMappings ?? []);
    setDirty(filtersChanged || bodyChanged || headerChanged);
  }, [eventFilters, bodyMappings, headerMappings, detail]);

  // Collect all known event suggestions from all presets
  const allSuggestions = Array.from(
    new Set(WEBHOOK_PRESETS.flatMap((p) => p.commonEvents))
  ).sort();

  async function saveConfig() {
    // Validate variable names
    const varNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    for (const m of bodyMappings) {
      if (!m.jsonPath.trim() || !m.variableName.trim()) {
        toast.error("Body mappings must have a JSONPath and variable name");
        return;
      }
      if (!varNameRegex.test(m.variableName)) {
        toast.error(`Invalid variable name: "${m.variableName}" — use letters, numbers, and underscores`);
        return;
      }
    }
    for (const m of headerMappings) {
      if (!m.headerName.trim() || !m.variableName.trim()) {
        toast.error("Header mappings must have a header name and variable name");
        return;
      }
      if (!varNameRegex.test(m.variableName)) {
        toast.error(`Invalid variable name: "${m.variableName}" — use letters, numbers, and underscores`);
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/webhooks/${webhookId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventFilters, bodyMappings, headerMappings }),
      });
      const json = await res.json() as { success: boolean; error?: string };
      if (!json.success) throw new Error(json.error ?? "Failed to save");
      onUpdated({ eventFilters, bodyMappings, headerMappings });
      setDirty(false);
      toast.success("Configuration saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save configuration");
    } finally {
      setSaving(false);
    }
  }

  async function applyPreset(preset: WebhookPreset) {
    // Apply preset values locally — user still needs to save
    setEventFilters(preset.eventFilters);
    setBodyMappings(preset.bodyMappings);
    setHeaderMappings(preset.headerMappings);
    toast.success(`${preset.name} preset applied — review and save when ready`);
  }

  return (
    <div className="space-y-6">
      {/* Preset picker banner */}
      <div className="flex items-center justify-between rounded-lg border border-dashed border-zinc-700 bg-zinc-900/30 px-4 py-3">
        <div>
          <p className="text-sm font-medium">Provider Presets</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Instantly configure mappings for GitHub, Stripe, Slack, or a custom webhook.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowPresetPicker(true)}
        >
          <Layers className="size-3.5 mr-1.5" />
          Apply Preset
        </Button>
      </div>

      {/* Event Filters */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <Filter className="size-3.5 text-violet-400" />
          <h3 className="text-sm font-medium">Event Filters</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Only trigger the flow when the incoming event type matches one of these values.
          The event type is read from provider-specific headers (e.g.{" "}
          <code className="text-[10px]">x-github-event</code>) or from the body
          (e.g. Stripe&apos;s <code className="text-[10px]">$.type</code>).
        </p>
        <EventFilterEditor
          filters={eventFilters}
          suggestions={allSuggestions}
          onAdd={(v) => setEventFilters((prev) => [...prev, v])}
          onRemove={(v) => setEventFilters((prev) => prev.filter((f) => f !== v))}
        />
      </div>

      {/* Body Mappings */}
      <div className="space-y-2.5">
        <h3 className="text-sm font-medium">Body Mappings</h3>
        <p className="text-xs text-muted-foreground">
          Extract values from the request body using JSONPath expressions and assign them to
          flow variables.
        </p>
        <BodyMappingsEditor
          mappings={bodyMappings}
          onChange={setBodyMappings}
        />
      </div>

      {/* Header Mappings */}
      <div className="space-y-2.5">
        <h3 className="text-sm font-medium">Header Mappings</h3>
        <p className="text-xs text-muted-foreground">
          Pass specific request headers into flow variables.
        </p>
        <HeaderMappingsEditor
          mappings={headerMappings}
          onChange={setHeaderMappings}
        />
      </div>

      {/* Save bar */}
      <div className={`flex items-center justify-between rounded-lg border px-4 py-3 transition-colors ${
        dirty ? "border-blue-800/50 bg-blue-900/10" : "border-zinc-800 bg-zinc-900/20"
      }`}>
        <p className="text-xs text-muted-foreground">
          {dirty ? "You have unsaved changes" : "Configuration is up to date"}
        </p>
        <Button
          size="sm"
          disabled={!dirty || saving}
          onClick={() => void saveConfig()}
        >
          {saving ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : null}
          Save Configuration
        </Button>
      </div>

      <PresetPickerDialog
        open={showPresetPicker}
        onClose={() => setShowPresetPicker(false)}
        onApply={(preset) => void applyPreset(preset)}
      />
    </div>
  );
}

// ─── Create Webhook Dialog ────────────────────────────────────────────────────

function CreateWebhookDialog({
  open, onClose, onCreated, agentId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (wh: WebhookSummary) => void;
  agentId: string;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<WebhookPreset | null>(null);
  const [saving, setSaving] = useState(false);

  function reset() {
    setName("");
    setDescription("");
    setSelectedPreset(null);
  }

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || undefined,
      };
      if (selectedPreset) {
        body.eventFilters = selectedPreset.eventFilters;
        body.bodyMappings = selectedPreset.bodyMappings;
        body.headerMappings = selectedPreset.headerMappings;
      }
      const res = await fetch(`/api/agents/${agentId}/webhooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json() as { success: boolean; data?: WebhookSummary; error?: string };
      if (!json.success) throw new Error(json.error ?? "Failed to create");
      toast.success("Webhook created");
      onCreated(json.data!);
      reset();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create webhook");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Webhook</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. GitHub Events"
              onKeyDown={(e) => e.key === "Enter" && void handleCreate()}
            />
          </div>
          <div className="space-y-2">
            <Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What events does this webhook receive?"
              rows={2}
            />
          </div>

          {/* Quick preset selection */}
          <div className="space-y-2">
            <Label>Start with a preset <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <div className="grid grid-cols-4 gap-2">
              {WEBHOOK_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setSelectedPreset(selectedPreset?.id === preset.id ? null : preset)}
                  className={`rounded-lg border p-2 text-center transition-colors ${
                    selectedPreset?.id === preset.id
                      ? "border-violet-600 bg-violet-900/20 text-violet-300"
                      : "border-zinc-800 hover:border-zinc-600 text-zinc-400"
                  }`}
                >
                  <div className="text-xl mb-1">{preset.icon}</div>
                  <div className="text-[10px] font-medium leading-tight">{preset.name}</div>
                </button>
              ))}
            </div>
            {selectedPreset && (
              <div className="rounded-md border border-dashed border-violet-700/40 bg-violet-900/10 px-3 py-2 text-xs text-violet-300">
                <strong>{selectedPreset.name}</strong> preset selected —{" "}
                {selectedPreset.bodyMappings.length} body mappings,{" "}
                {selectedPreset.headerMappings.length} header mappings
                {selectedPreset.eventFilters.length > 0 && (
                  <>, filters: {selectedPreset.eventFilters.join(", ")}</>
                )}{" "}
                will be applied.
                {selectedPreset.docs && (
                  <a
                    href={selectedPreset.docs}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 ml-2 text-violet-400 hover:text-violet-300"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Docs <ExternalLink className="size-2.5" />
                  </a>
                )}
              </div>
            )}
          </div>

          {!selectedPreset && (
            <div className="rounded-md bg-muted/30 border border-dashed p-3 text-xs text-muted-foreground">
              A signing secret will be generated automatically. You can configure mappings and filters after creation.
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button onClick={() => void handleCreate()} disabled={!name.trim() || saving}>
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Test Webhook Panel ───────────────────────────────────────────────────────

function TestPanel({
  agentId, webhook,
}: {
  agentId: string;
  webhook: WebhookDetail;
}) {
  const [payload, setPayload] = useState(
    JSON.stringify({ event: "test", data: { message: "Hello from test panel" } }, null, 2)
  );
  const [eventType, setEventType] = useState("test.event");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; status: number; body: string } | null>(null);

  const triggerUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/agents/${agentId}/trigger/${webhook.id}`;

  async function sendTest() {
    setSending(true);
    setResult(null);
    try {
      // Generate HMAC-SHA256 signature using Web Crypto API
      const webhookId = `test-${Date.now()}`;
      const ts = Math.floor(Date.now() / 1000).toString();
      const toSign = `${webhookId}.${ts}.${payload}`;

      const keyData = new TextEncoder().encode(webhook.secret);
      const msgData = new TextEncoder().encode(toSign);
      const cryptoKey = await crypto.subtle.importKey(
        "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
      );
      const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
      const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));

      const res = await fetch(triggerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-webhook-id": webhookId,
          "x-webhook-timestamp": ts,
          "x-webhook-signature": `v1,${sigB64}`,
          ...(eventType ? { "x-webhook-event": eventType } : {}),
        },
        body: payload,
      });

      const body = await res.text();
      setResult({ ok: res.ok, status: res.status, body });
      if (res.ok) {
        toast.success("Test webhook sent successfully");
      } else {
        toast.error(`Webhook returned ${res.status}`);
      }
    } catch (err) {
      setResult({ ok: false, status: 0, body: err instanceof Error ? err.message : "Network error" });
      toast.error("Failed to send test webhook");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      {webhook.eventFilters.length > 0 && (
        <div className="rounded-md border border-amber-800/50 bg-amber-900/10 px-3 py-2 text-xs text-amber-300">
          <Filter className="inline size-3 mr-1" />
          Event filters are active: {webhook.eventFilters.join(", ")}. Make sure your test event type matches.
        </div>
      )}
      <div className="space-y-2">
        <Label>Payload (JSON)</Label>
        <Textarea
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          className="font-mono text-xs"
          rows={6}
        />
      </div>
      <div className="space-y-2">
        <Label>Event Type <span className="text-muted-foreground font-normal">(x-webhook-event header)</span></Label>
        <Input
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
          placeholder="e.g. push, pull_request, invoice.paid"
        />
      </div>
      <Button onClick={() => void sendTest()} disabled={sending || !webhook.enabled}>
        {sending
          ? <Loader2 className="mr-2 size-4 animate-spin" />
          : <Send className="mr-2 size-4" />
        }
        {webhook.enabled ? "Send Test Request" : "Enable webhook to test"}
      </Button>

      {result && (
        <div className={`rounded-md border p-3 space-y-1 ${result.ok ? "border-green-800/50 bg-green-900/20" : "border-red-800/50 bg-red-900/20"}`}>
          <div className="flex items-center gap-2">
            {result.ok
              ? <CheckCircle2 className="size-4 text-green-400" />
              : <XCircle className="size-4 text-red-400" />
            }
            <span className={`text-sm font-medium ${result.ok ? "text-green-300" : "text-red-300"}`}>
              HTTP {result.status} — {result.ok ? "Success" : "Error"}
            </span>
          </div>
          {result.body && (
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
              {result.body}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Execution Row ────────────────────────────────────────────────────────────

interface ReplayState {
  status: "idle" | "running" | "success" | "error";
  executionId?: string;
  error?: string;
}

function ExecutionRow({
  exec,
  agentId,
  webhookId,
  onReplayed,
}: {
  exec: WebhookExecution;
  agentId: string;
  webhookId: string;
  onReplayed?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [replay, setReplay] = useState<ReplayState>({ status: "idle" });

  async function handleReplay(e: React.MouseEvent) {
    e.stopPropagation(); // Don't toggle expand/collapse
    setReplay({ status: "running" });
    try {
      const res = await fetch(
        `/api/agents/${agentId}/webhooks/${webhookId}/executions/${exec.id}/replay`,
        { method: "POST" }
      );
      const json = await res.json() as { success: boolean; data?: { executionId: string }; error?: string };
      if (!res.ok || !json.success) {
        setReplay({ status: "error", error: json.error ?? "Replay failed" });
        toast.error(json.error ?? "Replay failed");
      } else {
        setReplay({ status: "success", executionId: json.data?.executionId });
        toast.success("Execution replayed successfully");
        onReplayed?.();
      }
    } catch {
      setReplay({ status: "error", error: "Network error" });
      toast.error("Network error during replay");
    }
  }

  const canReplay = exec.rawPayload !== null;

  return (
    <div className="border border-zinc-800 rounded-md overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-zinc-800/50 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={`text-xs font-medium uppercase tracking-wide ${statusColor(exec.status)}`}>
          {exec.status.toLowerCase()}
        </span>
        {exec.isReplay && (
          <Badge variant="outline" className="h-5 text-[10px] border-blue-800/50 text-blue-400 gap-1">
            <RotateCcw className="size-2.5" />
            replay
          </Badge>
        )}
        {exec.eventType && (
          <Badge variant="outline" className="h-5 text-[10px] border-zinc-700 text-zinc-400">
            {exec.eventType}
          </Badge>
        )}
        <span className="flex-1 text-xs text-zinc-500">{relativeTime(exec.triggeredAt)}</span>
        {exec.durationMs != null && (
          <span className="text-[10px] text-zinc-600">{exec.durationMs}ms</span>
        )}
        {/* Replay button */}
        {canReplay && (
          <button
            type="button"
            title="Replay this execution with the original payload"
            disabled={replay.status === "running"}
            onClick={handleReplay}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/60 disabled:opacity-50 transition-colors"
          >
            {replay.status === "running" ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <RotateCcw className="size-3" />
            )}
            {replay.status === "running" ? "Replaying…" : "Replay"}
          </button>
        )}
        {expanded ? <ChevronDown className="size-3.5 text-zinc-500" /> : <ChevronRight className="size-3.5 text-zinc-500" />}
      </button>

      {expanded && (
        <div className="border-t border-zinc-800 px-3 py-2 bg-zinc-900/50 space-y-1.5 text-xs">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-zinc-400">
            <span className="text-zinc-600">Triggered</span>
            <span>{formatDate(exec.triggeredAt)}</span>
            {exec.completedAt && (
              <>
                <span className="text-zinc-600">Completed</span>
                <span>{formatDate(exec.completedAt)}</span>
              </>
            )}
            {exec.durationMs != null && (
              <>
                <span className="text-zinc-600">Duration</span>
                <span>{exec.durationMs}ms</span>
              </>
            )}
            {exec.sourceIp && (
              <>
                <span className="text-zinc-600">Source IP</span>
                <span className="font-mono">{exec.sourceIp}</span>
              </>
            )}
            {exec.conversationId && (
              <>
                <span className="text-zinc-600">Conversation ID</span>
                <span className="font-mono truncate">{exec.conversationId}</span>
              </>
            )}
            {exec.replayOf && (
              <>
                <span className="text-zinc-600">Replayed from</span>
                <span className="font-mono text-blue-400 truncate">{exec.replayOf}</span>
              </>
            )}
          </div>
          {exec.errorMessage && (
            <div className="rounded bg-red-900/20 border border-red-800/50 px-2 py-1.5 text-red-300">
              {exec.errorMessage}
            </div>
          )}
          {/* Inline replay result feedback */}
          {replay.status === "success" && (
            <div className="rounded bg-green-900/20 border border-green-800/50 px-2 py-1.5 text-green-300 flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5 shrink-0" />
              <span>Replayed — new execution ID: <code className="font-mono">{replay.executionId}</code></span>
            </div>
          )}
          {replay.status === "error" && (
            <div className="rounded bg-red-900/20 border border-red-800/50 px-2 py-1.5 text-red-300 flex items-center gap-1.5">
              <XCircle className="size-3.5 shrink-0" />
              <span>{replay.error}</span>
            </div>
          )}
          {!canReplay && (
            <p className="text-zinc-600 text-[10px]">
              Replay unavailable — no stored payload (captured before replay support was enabled).
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Webhook Detail Panel ─────────────────────────────────────────────────────

function WebhookDetailPanel({
  agentId, webhookId, onDeleted, onUpdated,
}: {
  agentId: string;
  webhookId: string;
  onDeleted: () => void;
  onUpdated: (wh: Partial<WebhookSummary>) => void;
}) {
  const [detail, setDetail] = useState<WebhookDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSecret, setShowSecret] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tab, setTab] = useState<"executions" | "config" | "test">("executions");
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/webhooks/${webhookId}`);
      const json = await res.json() as { success: boolean; data?: WebhookDetail };
      if (json.success && json.data) setDetail(json.data);
    } catch {
      toast.error("Failed to load webhook detail");
    } finally {
      setLoading(false);
    }
  }, [agentId, webhookId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleEnabled() {
    if (!detail || toggling) return;
    setToggling(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/webhooks/${webhookId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !detail.enabled }),
      });
      const json = await res.json() as { success: boolean };
      if (!json.success) throw new Error("Failed to toggle");
      const newEnabled = !detail.enabled;
      setDetail((d) => d ? { ...d, enabled: newEnabled } : d);
      onUpdated({ enabled: newEnabled });
      toast.success(newEnabled ? "Webhook enabled" : "Webhook disabled");
    } catch {
      toast.error("Failed to update webhook");
    } finally {
      setToggling(false);
    }
  }

  async function rotateSecret() {
    if (!detail || rotating) return;
    setRotating(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/webhooks/${webhookId}/rotate`, {
        method: "POST",
      });
      const json = await res.json() as { success: boolean; data?: { secret: string } };
      if (!json.success || !json.data) throw new Error("Failed to rotate");
      setDetail((d) => d ? { ...d, secret: json.data!.secret } : d);
      setShowSecret(true);
      toast.success("Secret rotated — update your provider immediately");
    } catch {
      toast.error("Failed to rotate secret");
    } finally {
      setRotating(false);
    }
  }

  async function handleDelete() {
    try {
      const res = await fetch(`/api/agents/${agentId}/webhooks/${webhookId}`, {
        method: "DELETE",
      });
      const json = await res.json() as { success: boolean };
      if (!json.success) throw new Error("Failed to delete");
      toast.success("Webhook deleted");
      onDeleted();
    } catch {
      toast.error("Failed to delete webhook");
    }
  }

  function handleConfigUpdated(changes: Partial<WebhookDetail>) {
    setDetail((d) => d ? { ...d, ...changes } : d);
    onUpdated(changes);
  }

  function copyUrl() {
    if (!detail) return;
    void navigator.clipboard.writeText(triggerUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  }

  function copySecret() {
    if (!detail) return;
    void navigator.clipboard.writeText(detail.secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Webhook not found
      </div>
    );
  }

  const triggerUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/agents/${agentId}/trigger/${detail.id}`;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-4 border-b">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold truncate">{detail.name}</h2>
            {detail.description && (
              <p className="text-sm text-muted-foreground mt-0.5">{detail.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Enable/disable toggle */}
            <button
              type="button"
              disabled={toggling}
              onClick={() => void toggleEnabled()}
              title={detail.enabled ? "Disable webhook" : "Enable webhook"}
              className={`relative inline-flex h-5 w-9 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50 ${
                detail.enabled ? "bg-blue-600" : "bg-zinc-600"
              }`}
            >
              <span className={`inline-block size-4 rounded-full bg-white shadow transition-transform ${
                detail.enabled ? "translate-x-4" : "translate-x-0"
              }`} />
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8">
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => void rotateSecret()}>
                  <RefreshCw className="mr-2 size-4" />
                  Rotate Secret
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="mr-2 size-4" />
                  Delete Webhook
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Status + stats strip */}
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium border ${statusBadgeClass(detail.enabled ? "COMPLETED" : "FAILED")}`}>
            {detail.enabled ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
            {detail.enabled ? "Active" : "Disabled"}
          </span>
          {detail.nodeId && (
            <span className="text-xs text-zinc-500">
              Linked to flow node
            </span>
          )}
          {detail.eventFilters.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-violet-400">
              <Filter className="size-3" />
              {detail.eventFilters.length} filter{detail.eventFilters.length !== 1 ? "s" : ""}
            </span>
          )}
          <span className="text-xs text-zinc-500">
            <Zap className="inline size-3 mr-0.5" />
            {detail.triggerCount} trigger{detail.triggerCount !== 1 ? "s" : ""}
            {detail.failureCount > 0 && (
              <span className="text-red-400 ml-1">· {detail.failureCount} failed</span>
            )}
          </span>
          {detail.lastTriggeredAt && (
            <span className="text-xs text-zinc-500">
              <Clock className="inline size-3 mr-0.5" />
              {relativeTime(detail.lastTriggeredAt)}
            </span>
          )}
        </div>
      </div>

      {/* Trigger URL + secret */}
      <div className="px-6 py-4 border-b space-y-3">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-zinc-400">Trigger URL</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-md bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-xs font-mono text-zinc-300">
              POST {triggerUrl}
            </code>
            <Button variant="outline" size="sm" className="shrink-0 h-8" onClick={copyUrl}>
              <Copy className="size-3.5 mr-1.5" />
              {copiedUrl ? "Copied!" : "Copy"}
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-zinc-400">Signing Secret</p>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setShowSecret((v) => !v)}
            >
              {showSecret ? <EyeOff className="size-3 mr-1" /> : <Eye className="size-3 mr-1" />}
              {showSecret ? "Hide" : "Show"}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-md bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-xs font-mono text-zinc-300">
              {showSecret ? detail.secret : "•".repeat(43)}
            </code>
            <Button variant="outline" size="sm" className="shrink-0 h-8" onClick={copySecret}>
              <Copy className="size-3.5 mr-1.5" />
              {copiedSecret ? "Copied!" : "Copy"}
            </Button>
          </div>
          <p className="text-[11px] text-zinc-500">
            Used to verify HMAC-SHA256 signatures. Keep this secret — rotate it if compromised.
          </p>
        </div>
      </div>

      {/* Tabs: Execution History / Config / Test */}
      <div className="flex border-b">
        {(["executions", "config", "test"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "executions" ? `Executions (${detail._count.executions})` : t === "config" ? "Configuration" : "Test"}
          </button>
        ))}
        {tab === "executions" && (
          <button
            type="button"
            onClick={() => void load()}
            className="ml-auto px-3 text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh"
          >
            <RefreshCw className="size-3.5" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {tab === "executions" && (
          <div className="space-y-2">
            {detail.executions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                <Webhook className="size-8 text-zinc-700" />
                <p className="text-sm text-muted-foreground">No executions yet</p>
                <p className="text-xs text-zinc-600">
                  Send a POST request to the trigger URL or use the Test tab.
                </p>
              </div>
            ) : (
              detail.executions.map((exec) => (
                <ExecutionRow
                  key={exec.id}
                  exec={exec}
                  agentId={agentId}
                  webhookId={webhookId}
                  onReplayed={() => void load()}
                />
              ))
            )}
          </div>
        )}

        {tab === "config" && (
          <ConfigTab
            agentId={agentId}
            webhookId={webhookId}
            detail={detail}
            onUpdated={handleConfigUpdated}
          />
        )}

        {tab === "test" && (
          <TestPanel agentId={agentId} webhook={detail} />
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete Webhook"
        description={`Delete "${detail.name}"? All execution history will also be removed. This cannot be undone.`}
        confirmLabel="Delete Webhook"
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WebhooksPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = use(params);
  const [webhooks, setWebhooks] = useState<WebhookSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [agentName, setAgentName] = useState<string>("");

  const loadWebhooks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/webhooks`);
      const json = await res.json() as { success: boolean; data?: WebhookSummary[] };
      if (json.success && json.data) {
        setWebhooks(json.data);
        if (json.data.length > 0 && !selectedId) {
          setSelectedId(json.data[0].id);
        }
      }
    } catch {
      toast.error("Failed to load webhooks");
    } finally {
      setLoading(false);
    }
  }, [agentId, selectedId]);

  useEffect(() => {
    void loadWebhooks();
    // Load agent name for the back-link context
    fetch(`/api/agents/${agentId}`)
      .then((r) => r.json())
      .then((j: { success: boolean; data?: { name: string } }) => {
        if (j.success && j.data) setAgentName(j.data.name);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  function handleCreated(wh: WebhookSummary) {
    setWebhooks((prev) => [wh, ...prev]);
    setSelectedId(wh.id);
  }

  function handleDeleted() {
    setWebhooks((prev) => {
      const next = prev.filter((w) => w.id !== selectedId);
      setSelectedId(next[0]?.id ?? null);
      return next;
    });
  }

  function handleUpdated(changes: Partial<WebhookSummary>) {
    setWebhooks((prev) =>
      prev.map((w) => (w.id === selectedId ? { ...w, ...changes } : w))
    );
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b px-4 py-2.5 shrink-0">
        <Button variant="ghost" size="icon-sm" aria-label="Back to builder" asChild>
          <Link href={`/builder/${agentId}`}>
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Link>
        </Button>
        <Webhook className="size-4 text-violet-400" />
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold truncate">
            Webhooks
            {agentName && (
              <span className="ml-2 text-muted-foreground font-normal">— {agentName}</span>
            )}
          </h1>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="mr-1.5 size-4" />
          New Webhook
        </Button>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-1 min-h-0">
        {/* Left sidebar — webhook list */}
        <div className="w-72 shrink-0 border-r flex flex-col overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : webhooks.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 p-6 text-center gap-3">
              <Webhook className="size-10 text-zinc-700" />
              <p className="text-sm font-medium">No webhooks yet</p>
              <p className="text-xs text-muted-foreground">
                Create a webhook to receive events from external systems, or add a{" "}
                <strong>Webhook Trigger</strong> node in the flow builder.
              </p>
              <Button size="sm" onClick={() => setShowCreate(true)} className="mt-1">
                <Plus className="mr-1.5 size-3.5" />
                Create Webhook
              </Button>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {webhooks.map((wh) => (
                <button
                  key={wh.id}
                  type="button"
                  onClick={() => setSelectedId(wh.id)}
                  className={`w-full text-left rounded-lg px-3 py-2.5 transition-colors group ${
                    selectedId === wh.id
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <span className="text-sm font-medium truncate">{wh.name}</span>
                    <span className={`shrink-0 mt-0.5 inline-flex size-2 rounded-full ${
                      wh.enabled ? "bg-green-500" : "bg-zinc-600"
                    }`} />
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-muted-foreground">
                      {wh.triggerCount} trigger{wh.triggerCount !== 1 ? "s" : ""}
                    </span>
                    {wh.failureCount > 0 && (
                      <span className="text-[10px] text-red-400">{wh.failureCount} failed</span>
                    )}
                    {wh.eventFilters.length > 0 && (
                      <span className="text-[10px] text-violet-400">
                        <Filter className="inline size-2.5 mr-0.5" />
                        {wh.eventFilters.length} filter{wh.eventFilters.length !== 1 ? "s" : ""}
                      </span>
                    )}
                    {wh.lastTriggeredAt && (
                      <span className="text-[10px] text-zinc-500 ml-auto">
                        {relativeTime(wh.lastTriggeredAt)}
                      </span>
                    )}
                  </div>
                  {wh.nodeId && (
                    <span className="text-[10px] text-violet-400 mt-0.5">
                      Flow node
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right panel — webhook detail */}
        <div className="flex-1 overflow-hidden">
          {selectedId ? (
            <WebhookDetailPanel
              key={selectedId}
              agentId={agentId}
              webhookId={selectedId}
              onDeleted={handleDeleted}
              onUpdated={handleUpdated}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
              <Webhook className="size-12 text-zinc-700" />
              <div>
                <p className="text-sm font-medium">Select a webhook</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Choose a webhook from the list or create a new one.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <CreateWebhookDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreated}
        agentId={agentId}
      />
    </div>
  );
}
