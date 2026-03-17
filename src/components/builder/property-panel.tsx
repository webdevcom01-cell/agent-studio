"use client";

import { useEffect, useState, useMemo } from "react";
import { type Node } from "@xyflow/react";
import { Trash2, X, Plus, Search, Database, Plug, Zap, AppWindow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALL_MODELS } from "@/lib/models";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DESKTOP_APPS, getDesktopApp } from "@/lib/constants/desktop-apps";

interface PropertyPanelProps {
  node: Node;
  allNodes: Node[];
  agentId?: string;
  onUpdateData: (nodeId: string, data: Record<string, unknown>) => void;
  onDeleteNode: (nodeId: string) => void;
  onClose: () => void;
}

const TIER_LABELS: Record<string, string> = {
  fast: "⚡ Fast & Cheap",
  balanced: "⚖️ Balanced",
  powerful: "🧠 Powerful",
};

function ModelSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const models = ALL_MODELS;
  const tiers = ["fast", "balanced", "powerful"] as const;

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full text-xs">
        <SelectValue placeholder="Select model..." />
      </SelectTrigger>
      <SelectContent>
        {tiers.map((tier) => {
          const group = models.filter((m) => m.tier === tier);
          if (group.length === 0) return null;
          return (
            <SelectGroup key={tier}>
              <SelectLabel className="text-xs text-muted-foreground">
                {TIER_LABELS[tier]}
              </SelectLabel>
              {group.map((m) => (
                <SelectItem key={m.id} value={m.id} className="text-xs">
                  {m.name}
                  <span className="ml-1 text-muted-foreground opacity-60">
                    ({m.provider})
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
}

export function PropertyPanel({
  node,
  allNodes,
  agentId,
  onUpdateData,
  onDeleteNode,
  onClose,
}: PropertyPanelProps) {
  const data = node.data as Record<string, unknown>;
  const [confirmDeleteNode, setConfirmDeleteNode] = useState(false);

  function update(key: string, value: unknown) {
    onUpdateData(node.id, { [key]: value });
  }

  return (
    <div className="flex w-80 flex-col border-l bg-background" data-testid="property-panel">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="text-sm font-semibold">Properties</h3>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Close properties panel"
          onClick={onClose}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="space-y-2">
          <Label>Label</Label>
          <Input
            value={(data.label as string) ?? ""}
            onChange={(e) => update("label", e.target.value)}
          />
        </div>

        {node.type === "message" && (
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              value={(data.message as string) ?? ""}
              onChange={(e) => update("message", e.target.value)}
              rows={4}
            />
          </div>
        )}

        {node.type === "ai_response" && (
          <>
            <div className="space-y-2">
              <Label>System Prompt</Label>
              <Textarea
                value={(data.prompt as string) ?? ""}
                onChange={(e) => update("prompt", e.target.value)}
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label>Model</Label>
              <ModelSelect
                value={(data.model as string) ?? "deepseek-chat"}
                onChange={(val) => update("model", val)}
              />
            </div>
            <div className="space-y-2">
              <Label>Max Tokens</Label>
              <Input
                type="number"
                value={(data.maxTokens as number) ?? 500}
                onChange={(e) => update("maxTokens", parseInt(e.target.value) || 500)}
              />
            </div>
            <div className="space-y-2">
              <Label>Output Variable</Label>
              <Input
                value={(data.outputVariable as string) ?? ""}
                onChange={(e) => update("outputVariable", e.target.value)}
                placeholder="e.g. ai_response"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-md border border-zinc-700 bg-zinc-800/50 p-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Agent Orchestration</Label>
                  <p className="text-xs text-zinc-400">
                    Let AI dynamically call your other agents as tools
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={(data.enableAgentTools as boolean) ?? false}
                  onClick={() => update("enableAgentTools", !(data.enableAgentTools as boolean))}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                    (data.enableAgentTools as boolean)
                      ? "bg-blue-600"
                      : "bg-zinc-600"
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                      (data.enableAgentTools as boolean)
                        ? "translate-x-4"
                        : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
              {(data.enableAgentTools as boolean) && (
                <p className="rounded bg-blue-950/50 px-2 py-1.5 text-xs text-blue-300">
                  This AI node will see your other agents as callable tools.
                  The LLM decides which agents to invoke based on the conversation.
                  Protected by circuit breaker, rate limiting, and depth control.
                </p>
              )}
            </div>
          </>
        )}

        {node.type === "capture" && (
          <>
            <div className="space-y-2">
              <Label>Variable Name</Label>
              <Input
                value={(data.variableName as string) ?? ""}
                onChange={(e) => update("variableName", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Prompt</Label>
              <Textarea
                value={(data.prompt as string) ?? ""}
                onChange={(e) => update("prompt", e.target.value)}
                rows={3}
              />
            </div>
          </>
        )}

        {node.type === "kb_search" && (
          <>
            <div className="space-y-2">
              <Label>Query Variable</Label>
              <Input
                value={(data.queryVariable as string) ?? "last_message"}
                onChange={(e) => update("queryVariable", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Top K Results</Label>
              <Input
                type="number"
                value={(data.topK as number) ?? 5}
                onChange={(e) => update("topK", parseInt(e.target.value) || 5)}
              />
            </div>
          </>
        )}

        {node.type === "end" && (
          <div className="space-y-2">
            <Label>End Message</Label>
            <Textarea
              value={(data.endMessage as string) ?? ""}
              onChange={(e) => update("endMessage", e.target.value)}
              rows={2}
              placeholder="Optional goodbye message"
            />
          </div>
        )}

        {node.type === "goto" && (
          <div className="space-y-2">
            <Label>Target Node</Label>
            <select
              value={(data.targetNodeId as string) ?? ""}
              onChange={(e) => update("targetNodeId", e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Select a node...</option>
              {allNodes
                .filter((n) => n.id !== node.id)
                .map((n) => {
                  const nodeData = n.data as Record<string, unknown>;
                  const label = (nodeData.label as string) || n.id;
                  return (
                    <option key={n.id} value={n.id}>
                      {label} ({n.type})
                    </option>
                  );
                })}
            </select>
          </div>
        )}

        {node.type === "set_variable" && (
          <>
            <div className="space-y-2">
              <Label>Variable Name</Label>
              <Input
                value={(data.variableName as string) ?? ""}
                onChange={(e) => update("variableName", e.target.value)}
                placeholder="e.g. user_score"
              />
            </div>
            <div className="space-y-2">
              <Label>Value</Label>
              <Input
                value={(data.value as string) ?? ""}
                onChange={(e) => update("value", e.target.value)}
                placeholder="e.g. {{last_message}} or static text"
              />
            </div>
          </>
        )}

        {node.type === "wait" && (
          <div className="space-y-2">
            <Label>Duration (seconds)</Label>
            <Input
              type="number"
              value={(data.duration as number) ?? 1}
              onChange={(e) => update("duration", parseInt(e.target.value) || 1)}
              min={1}
              max={5}
            />
            <p className="text-xs text-muted-foreground">Max 5 seconds</p>
          </div>
        )}

        {node.type === "button" && (
          <ButtonProperties data={data} update={update} />
        )}

        {node.type === "api_call" && (
          <HttpProperties data={data} update={update} />
        )}

        {node.type === "webhook" && (
          <HttpProperties data={data} update={update} />
        )}

        {node.type === "function" && (
          <>
            <div className="space-y-2">
              <Label>Code</Label>
              <Textarea
                value={(data.code as string) ?? ""}
                onChange={(e) => update("code", e.target.value)}
                rows={8}
                className="font-mono text-xs"
                placeholder="return variables.x + variables.y;"
              />
              <p className="text-xs text-muted-foreground">
                Access flow variables via <code>variables</code> object
              </p>
            </div>
            <div className="space-y-2">
              <Label>Output Variable</Label>
              <Input
                value={(data.outputVariable as string) ?? ""}
                onChange={(e) => update("outputVariable", e.target.value)}
                placeholder="e.g. result"
              />
            </div>
          </>
        )}

        {node.type === "ai_classify" && (
          <AIClassifyProperties data={data} update={update} />
        )}

        {node.type === "ai_extract" && (
          <AIExtractProperties data={data} update={update} />
        )}

        {node.type === "ai_summarize" && (
          <>
            <div className="space-y-2">
              <Label>Output Variable</Label>
              <Input
                value={(data.outputVariable as string) ?? "summary"}
                onChange={(e) => update("outputVariable", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Max Length (chars)</Label>
              <Input
                type="number"
                value={(data.maxLength as number) ?? 200}
                onChange={(e) => update("maxLength", parseInt(e.target.value) || 200)}
              />
            </div>
            <div className="space-y-2">
              <Label>Model</Label>
              <Input
                value={(data.model as string) ?? "deepseek-chat"}
                onChange={(e) => update("model", e.target.value)}
              />
            </div>
          </>
        )}

        {node.type === "mcp_tool" && (
          <MCPToolProperties data={data} update={update} />
        )}

        {node.type === "call_agent" && (
          <CallAgentProperties data={data} update={update} currentAgentId={agentId ?? ""} />
        )}

        {node.type === "human_approval" && (
          <HumanApprovalProperties data={data} update={update} />
        )}

        {node.type === "loop" && (
          <LoopProperties data={data} update={update} />
        )}

        {node.type === "parallel" && (
          <ParallelProperties data={data} update={update} />
        )}

        {node.type === "memory_write" && (
          <MemoryWriteProperties data={data} update={update} />
        )}

        {node.type === "memory_read" && (
          <MemoryReadProperties data={data} update={update} />
        )}

        {node.type === "evaluator" && (
          <EvaluatorProperties data={data} update={update} />
        )}

        {node.type === "schedule_trigger" && (
          <ScheduleTriggerProperties data={data} update={update} agentId={agentId ?? ""} />
        )}

        {node.type === "email_send" && (
          <EmailSendProperties data={data} update={update} />
        )}

        {node.type === "notification" && (
          <NotificationProperties data={data} update={update} />
        )}

        {node.type === "format_transform" && (
          <FormatTransformProperties data={data} update={update} />
        )}

        {node.type === "switch" && (
          <SwitchProperties data={data} update={update} />
        )}

        {node.type === "web_fetch" && (
          <WebFetchProperties data={data} update={update} />
        )}

        {node.type === "browser_action" && (
          <BrowserActionProperties data={data} update={update} />
        )}

        {node.type === "desktop_app" && (
          <DesktopAppProperties data={data} update={update} />
        )}
      </div>

      <div className="border-t p-4">
        <Button
          variant="destructive"
          size="sm"
          className="w-full"
          onClick={() => setConfirmDeleteNode(true)}
        >
          <Trash2 className="mr-2 size-4" />
          Delete Node
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDeleteNode}
        onOpenChange={setConfirmDeleteNode}
        title="Delete Node"
        description={`Delete this ${node.type ?? "node"}? Any connected edges will also be removed.`}
        confirmLabel="Delete Node"
        onConfirm={() => {
          onDeleteNode(node.id);
          setConfirmDeleteNode(false);
        }}
      />
    </div>
  );
}

interface SubPanelProps {
  data: Record<string, unknown>;
  update: (key: string, value: unknown) => void;
}

function ButtonProperties({ data, update }: SubPanelProps) {
  interface ButtonOption {
    id: string;
    label: string;
    value: string;
  }

  const buttons = (data.buttons as ButtonOption[]) ?? [];

  function addButton() {
    const id = `btn-${Date.now()}`;
    update("buttons", [...buttons, { id, label: "", value: "" }]);
  }

  function updateButton(index: number, field: string, value: string) {
    const updated = buttons.map((b, i) =>
      i === index ? { ...b, [field]: value } : b
    );
    update("buttons", updated);
  }

  function removeButton(index: number) {
    update("buttons", buttons.filter((_, i) => i !== index));
  }

  return (
    <>
      <div className="space-y-2">
        <Label>Message</Label>
        <Textarea
          value={(data.message as string) ?? ""}
          onChange={(e) => update("message", e.target.value)}
          rows={2}
          placeholder="Choose an option:"
        />
      </div>
      <div className="space-y-2">
        <Label>Variable Name</Label>
        <Input
          value={(data.variableName as string) ?? ""}
          onChange={(e) => update("variableName", e.target.value)}
          placeholder="e.g. user_choice"
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Buttons</Label>
          <Button variant="ghost" size="sm" className="h-6 px-2" onClick={addButton}>
            <Plus className="mr-1 size-3" /> Add
          </Button>
        </div>
        {buttons.map((btn, i) => (
          <div key={btn.id} className="flex gap-1">
            <Input
              value={btn.label}
              onChange={(e) => updateButton(i, "label", e.target.value)}
              placeholder="Label"
              className="flex-1"
            />
            <Input
              value={btn.value}
              onChange={(e) => updateButton(i, "value", e.target.value)}
              placeholder="Value"
              className="flex-1"
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              onClick={() => removeButton(i)}
            >
              <X className="size-3" />
            </Button>
          </div>
        ))}
      </div>
    </>
  );
}

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

function HttpProperties({ data, update }: SubPanelProps) {
  const method = (data.method as string) ?? "GET";

  return (
    <>
      <div className="space-y-2">
        <Label>Method</Label>
        <div className="flex gap-1 flex-wrap">
          {HTTP_METHODS.map((m) => (
            <Button
              key={m}
              variant={method === m ? "default" : "outline"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => update("method", m)}
            >
              {m}
            </Button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label>URL</Label>
        <Input
          value={(data.url as string) ?? ""}
          onChange={(e) => update("url", e.target.value)}
          placeholder="https://api.example.com/endpoint"
        />
      </div>
      <div className="space-y-2">
        <Label>Body</Label>
        <Textarea
          value={(data.body as string) ?? ""}
          onChange={(e) => update("body", e.target.value)}
          rows={4}
          className="font-mono text-xs"
          placeholder='{"key": "{{variable}}"}'
        />
      </div>
      <div className="space-y-2">
        <Label>Output Variable</Label>
        <Input
          value={(data.outputVariable as string) ?? ""}
          onChange={(e) => update("outputVariable", e.target.value)}
          placeholder="e.g. api_result"
        />
      </div>
    </>
  );
}

function AIClassifyProperties({ data, update }: SubPanelProps) {
  const categories = (data.categories as string[]) ?? [];
  const newCategoryValue = "";

  function addCategory() {
    const input = document.getElementById("new-category-input") as HTMLInputElement;
    const value = input?.value?.trim();
    if (value && !categories.includes(value)) {
      update("categories", [...categories, value]);
      if (input) input.value = "";
    }
  }

  function removeCategory(index: number) {
    update("categories", categories.filter((_, i) => i !== index));
  }

  return (
    <>
      <div className="space-y-2">
        <Label>Input Variable</Label>
        <Input
          value={(data.inputVariable as string) ?? ""}
          onChange={(e) => update("inputVariable", e.target.value)}
          placeholder="e.g. last_message"
        />
      </div>
      <div className="space-y-2">
        <Label>Categories</Label>
        <div className="flex gap-1">
          <Input
            id="new-category-input"
            defaultValue={newCategoryValue}
            placeholder="e.g. complaint"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCategory();
              }
            }}
          />
          <Button variant="outline" size="sm" className="shrink-0" onClick={addCategory}>
            <Plus className="size-3" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1">
          {categories.map((cat, i) => (
            <span
              key={cat}
              className="inline-flex items-center gap-1 rounded bg-violet-100 px-2 py-0.5 text-xs text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
            >
              {cat}
              <button onClick={() => removeCategory(i)} className="hover:text-destructive">
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label>Model</Label>
        <Input
          value={(data.model as string) ?? "deepseek-chat"}
          onChange={(e) => update("model", e.target.value)}
        />
      </div>
    </>
  );
}

interface MCPServerOption {
  id: string;
  name: string;
  toolsCache: string[] | null;
}

function MCPToolProperties({ data, update }: SubPanelProps) {
  const [servers, setServers] = useState<MCPServerOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const selectedServerId = (data.mcpServerId as string) ?? "";
  const selectedTool = (data.toolName as string) ?? "";
  const inputMapping = (data.inputMapping as Record<string, string>) ?? {};
  const selectedServer = servers.find((s) => s.id === selectedServerId);
  const availableTools = (selectedServer?.toolsCache as string[]) ?? [];

  useEffect(() => {
    setIsLoading(true);
    fetch("/api/mcp-servers")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setServers(res.data);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  function handleServerChange(serverId: string) {
    const server = servers.find((s) => s.id === serverId);
    update("mcpServerId", serverId);
    update("serverName", server?.name ?? "");
    update("toolName", "");
    update("inputMapping", {});
  }

  function addMapping() {
    update("inputMapping", { ...inputMapping, "": "" });
  }

  function updateMappingKey(oldKey: string, newKey: string) {
    const entries = Object.entries(inputMapping);
    const updated = Object.fromEntries(
      entries.map(([k, v]) => (k === oldKey ? [newKey, v] : [k, v])),
    );
    update("inputMapping", updated);
  }

  function updateMappingValue(key: string, value: string) {
    update("inputMapping", { ...inputMapping, [key]: value });
  }

  function removeMapping(key: string) {
    const { [key]: _removed, ...rest } = inputMapping;
    void _removed;
    update("inputMapping", rest);
  }

  return (
    <>
      <div className="space-y-2">
        <Label>MCP Server</Label>
        <select
          value={selectedServerId}
          onChange={(e) => handleServerChange(e.target.value)}
          className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          disabled={isLoading}
        >
          <option value="">{isLoading ? "Loading..." : "Select a server..."}</option>
          {servers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label>Tool</Label>
        <select
          value={selectedTool}
          onChange={(e) => update("toolName", e.target.value)}
          className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          disabled={!selectedServerId || availableTools.length === 0}
        >
          <option value="">
            {!selectedServerId
              ? "Select a server first..."
              : availableTools.length === 0
                ? "No tools cached — test connection first"
                : "Select a tool..."}
          </option>
          {availableTools.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Input Mapping</Label>
          <Button variant="ghost" size="sm" className="h-6 px-2" onClick={addMapping}>
            <Plus className="mr-1 size-3" /> Add
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Map tool parameters to template values
        </p>
        {Object.entries(inputMapping).map(([key, value]) => (
          <div key={key} className="flex gap-1">
            <Input
              value={key}
              onChange={(e) => updateMappingKey(key, e.target.value)}
              placeholder="param"
              className="flex-1"
            />
            <Input
              value={value}
              onChange={(e) => updateMappingValue(key, e.target.value)}
              placeholder="{{variable}}"
              className="flex-1"
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              onClick={() => removeMapping(key)}
            >
              <X className="size-3" />
            </Button>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Label>Output Variable</Label>
        <Input
          value={(data.outputVariable as string) ?? ""}
          onChange={(e) => update("outputVariable", e.target.value)}
          placeholder="e.g. mcp_result"
        />
      </div>
    </>
  );
}

interface AgentOption {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  tags?: string[];
  model?: string;
  _count?: { conversations: number };
  knowledgeBase?: { id: string } | null;
  mcpServers?: unknown[];
}

interface ExternalSkill {
  id: string;
  name: string;
  description?: string;
}

interface CallAgentPropertiesProps extends SubPanelProps {
  currentAgentId: string;
}

interface ParallelTargetData {
  agentId: string;
  agentName?: string;
  outputVariable: string;
  inputMapping: { key: string; value: string }[];
}

function CallAgentProperties({ data, update, currentAgentId }: CallAgentPropertiesProps) {
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingCard, setIsFetchingCard] = useState(false);
  const [externalSkills, setExternalSkills] = useState<ExternalSkill[]>([]);
  const mode = (data.mode as string) ?? "internal";
  const allowParallel = (data.allowParallel as boolean) ?? false;
  const parallelTargets = (data.parallelTargets as ParallelTargetData[]) ?? [];
  const targetAgentId = (data.targetAgentId as string) ?? "";
  const inputMapping = (data.inputMapping as { key: string; value: string }[]) ?? [];
  const onError = (data.onError as string) ?? "continue";

  const [agentSearch, setAgentSearch] = useState("");

  useEffect(() => {
    if (mode !== "internal") return;
    setIsLoading(true);
    fetch("/api/agents")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          const filtered = (res.data as AgentOption[]).filter(
            (a) => a.id !== currentAgentId
          );
          setAgents(filtered);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [currentAgentId, mode]);

  const filteredAgents = useMemo(() => {
    if (!agentSearch.trim()) return agents;
    const q = agentSearch.toLowerCase();
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.description?.toLowerCase().includes(q) ?? false) ||
        (a.category?.toLowerCase().includes(q) ?? false) ||
        (a.tags?.some((t) => t.toLowerCase().includes(q)) ?? false)
    );
  }, [agents, agentSearch]);

  function handleAgentChange(agentId: string) {
    const agent = agents.find((a) => a.id === agentId);
    update("targetAgentId", agentId);
    update("targetAgentName", agent?.name ?? "");
  }

  function handleFetchCard() {
    const cardUrl = (data.externalCardUrl as string) ?? "";
    if (!cardUrl) return;

    setIsFetchingCard(true);
    fetch(cardUrl)
      .then((r) => r.json())
      .then((card) => {
        const skills = (card.skills ?? card.data?.skills ?? []) as ExternalSkill[];
        setExternalSkills(skills);
        if (skills.length > 0 && !data.externalSkillId) {
          update("externalSkillId", skills[0].id);
        }
      })
      .catch(() => {
        setExternalSkills([]);
      })
      .finally(() => setIsFetchingCard(false));
  }

  function addMapping() {
    update("inputMapping", [...inputMapping, { key: "", value: "" }]);
  }

  function updateMapping(index: number, field: "key" | "value", val: string) {
    const updated = inputMapping.map((m, i) =>
      i === index ? { ...m, [field]: val } : m
    );
    update("inputMapping", updated);
  }

  function removeMapping(index: number) {
    update("inputMapping", inputMapping.filter((_, i) => i !== index));
  }

  return (
    <>
      <div className="space-y-2">
        <Label>Mode</Label>
        <select
          value={mode}
          onChange={(e) => update("mode", e.target.value)}
          className="h-9 w-full rounded-md border bg-background px-3 text-sm"
        >
          <option value="internal">Internal (same instance)</option>
          <option value="external">External (A2A protocol)</option>
        </select>
      </div>

      {mode === "internal" && (
        <>
          <div className="space-y-2">
            <Label>Execution</Label>
            <select
              value={allowParallel ? "parallel" : "sequential"}
              onChange={(e) => update("allowParallel", e.target.value === "parallel")}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="sequential">Sequential (single agent)</option>
              <option value="parallel">Parallel (multiple agents)</option>
            </select>
          </div>

          {!allowParallel && (
            <div className="space-y-2">
              <Label>Target Agent</Label>
              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                <Input
                  value={agentSearch}
                  onChange={(e) => setAgentSearch(e.target.value)}
                  placeholder={isLoading ? "Loading agents..." : `Search ${agents.length} agents...`}
                  className="pl-8 h-8 text-xs"
                  disabled={isLoading}
                />
              </div>
              {/* Agent list */}
              <div className="max-h-48 overflow-y-auto rounded-md border border-border bg-background">
                {filteredAgents.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground text-center">
                    {isLoading ? "Loading..." : "No agents found"}
                  </p>
                ) : (
                  filteredAgents.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        handleAgentChange(a.id);
                        setAgentSearch("");
                      }}
                      className={`w-full flex flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-accent/50 border-b border-border/50 last:border-0 ${
                        targetAgentId === a.id ? "bg-accent" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2 w-full">
                        <span className="text-xs font-medium text-foreground truncate flex-1">
                          {a.name}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {a.knowledgeBase && <Database className="size-2.5 text-muted-foreground" />}
                          {(a.mcpServers?.length ?? 0) > 0 && <Plug className="size-2.5 text-muted-foreground" />}
                          {(a._count?.conversations ?? 0) > 0 && (
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              {a._count?.conversations}
                            </span>
                          )}
                        </div>
                      </div>
                      {a.description && (
                        <p className="text-[10px] text-muted-foreground line-clamp-1 w-full">
                          {a.description}
                        </p>
                      )}
                      {(a.category || (a.tags?.length ?? 0) > 0) && (
                        <div className="flex gap-1 mt-0.5">
                          {a.category && (
                            <span className="text-[9px] rounded-full bg-muted px-1.5 py-0 text-muted-foreground">
                              {a.category}
                            </span>
                          )}
                          {a.tags?.slice(0, 2).map((tag) => (
                            <span key={tag} className="text-[9px] rounded-full bg-muted px-1.5 py-0 text-muted-foreground">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
              {targetAgentId && (
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Zap className="size-2.5" />
                  Selected: {agents.find((a) => a.id === targetAgentId)?.name ?? targetAgentId}
                </p>
              )}
            </div>
          )}

          {allowParallel && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Agents</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  onClick={() =>
                    update("parallelTargets", [
                      ...parallelTargets,
                      { agentId: "", agentName: "", outputVariable: "", inputMapping: [] },
                    ])
                  }
                >
                  <Plus className="mr-1 size-3" /> Add
                </Button>
              </div>
              {parallelTargets.map((target, i) => (
                <div key={i} className="space-y-1 rounded border p-2">
                  <div className="flex gap-1">
                    <select
                      value={target.agentId}
                      onChange={(e) => {
                        const agent = agents.find((a) => a.id === e.target.value);
                        const updated = parallelTargets.map((t, j) =>
                          j === i
                            ? { ...t, agentId: e.target.value, agentName: agent?.name ?? "" }
                            : t
                        );
                        update("parallelTargets", updated);
                      }}
                      className="h-8 flex-1 rounded-md border bg-background px-2 text-xs"
                      disabled={isLoading}
                    >
                      <option value="">Select...</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                    <Input
                      value={target.outputVariable}
                      onChange={(e) => {
                        const updated = parallelTargets.map((t, j) =>
                          j === i ? { ...t, outputVariable: e.target.value } : t
                        );
                        update("parallelTargets", updated);
                      }}
                      placeholder="output_var"
                      className="h-8 w-28 text-xs"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0"
                      onClick={() =>
                        update(
                          "parallelTargets",
                          parallelTargets.filter((_, j) => j !== i)
                        )
                      }
                    >
                      <X className="size-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {mode === "external" && (
        <>
          <div className="space-y-2">
            <Label>Agent Card URL</Label>
            <div className="flex gap-1">
              <Input
                value={(data.externalCardUrl as string) ?? ""}
                onChange={(e) => update("externalCardUrl", e.target.value)}
                placeholder="https://example.com/api/agents/.../a2a/card"
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={handleFetchCard}
                disabled={isFetchingCard || !(data.externalCardUrl as string)}
              >
                {isFetchingCard ? "..." : "Fetch"}
              </Button>
            </div>
          </div>

          {externalSkills.length > 0 && (
            <div className="space-y-2">
              <Label>Skill</Label>
              <select
                value={(data.externalSkillId as string) ?? ""}
                onChange={(e) => update("externalSkillId", e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                {externalSkills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Input Mapping</Label>
          <Button variant="ghost" size="sm" className="h-6 px-2" onClick={addMapping}>
            <Plus className="mr-1 size-3" /> Add
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Pass variables to the sub-agent
        </p>
        {inputMapping.map((mapping, i) => (
          <div key={i} className="flex gap-1">
            <Input
              value={mapping.key}
              onChange={(e) => updateMapping(i, "key", e.target.value)}
              placeholder="param"
              className="flex-1"
            />
            <Input
              value={mapping.value}
              onChange={(e) => updateMapping(i, "value", e.target.value)}
              placeholder="{{variable}}"
              className="flex-1"
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              onClick={() => removeMapping(i)}
            >
              <X className="size-3" />
            </Button>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Label>Output Variable</Label>
        <Input
          value={(data.outputVariable as string) ?? "agent_result"}
          onChange={(e) => update("outputVariable", e.target.value)}
          placeholder="e.g. agent_result"
        />
      </div>

      <div className="space-y-2">
        <Label>Timeout (seconds)</Label>
        <Input
          type="number"
          value={(data.timeoutSeconds as number) ?? 30}
          onChange={(e) => update("timeoutSeconds", parseInt(e.target.value) || 30)}
          min={1}
          max={120}
        />
      </div>

      <div className="space-y-2">
        <Label>On Error</Label>
        <select
          value={onError}
          onChange={(e) => update("onError", e.target.value)}
          className="h-9 w-full rounded-md border bg-background px-3 text-sm"
        >
          <option value="continue">Continue flow</option>
          <option value="stop">Stop flow</option>
        </select>
      </div>
    </>
  );
}

function HumanApprovalProperties({ data, update }: SubPanelProps) {
  const onTimeout = (data.onTimeout as string) ?? "continue";

  return (
    <>
      <div className="space-y-2">
        <Label>Prompt</Label>
        <Textarea
          value={(data.prompt as string) ?? ""}
          onChange={(e) => update("prompt", e.target.value)}
          rows={3}
          placeholder="Please review and approve this response"
        />
      </div>
      <div className="space-y-2">
        <Label>Context Variable</Label>
        <Input
          value={(data.inputVariable as string) ?? ""}
          onChange={(e) => update("inputVariable", e.target.value)}
          placeholder="e.g. draft_response"
        />
        <p className="text-xs text-muted-foreground">
          Variable to show for context in the approval UI
        </p>
      </div>
      <div className="space-y-2">
        <Label>Output Variable</Label>
        <Input
          value={(data.outputVariable as string) ?? "approval_result"}
          onChange={(e) => update("outputVariable", e.target.value)}
          placeholder="e.g. approval_result"
        />
      </div>
      <div className="space-y-2">
        <Label>Timeout (minutes)</Label>
        <Input
          type="number"
          value={(data.timeoutMinutes as number) ?? 60}
          onChange={(e) => update("timeoutMinutes", parseInt(e.target.value) || 60)}
          min={1}
          max={1440}
        />
      </div>
      <div className="space-y-2">
        <Label>On Timeout</Label>
        <select
          value={onTimeout}
          onChange={(e) => update("onTimeout", e.target.value)}
          className="h-9 w-full rounded-md border bg-background px-3 text-sm"
        >
          <option value="continue">Continue flow</option>
          <option value="stop">Stop flow</option>
          <option value="use_default">Use default value</option>
        </select>
      </div>
      {onTimeout === "use_default" && (
        <div className="space-y-2">
          <Label>Default Value</Label>
          <Input
            value={(data.defaultValue as string) ?? ""}
            onChange={(e) => update("defaultValue", e.target.value)}
            placeholder="Value to use on timeout"
          />
        </div>
      )}
    </>
  );
}

function AIExtractProperties({ data, update }: SubPanelProps) {
  interface ExtractField {
    name: string;
    description: string;
    type: "string" | "number" | "boolean";
  }

  const fields = (data.fields as ExtractField[]) ?? [];

  function addField() {
    update("fields", [...fields, { name: "", description: "", type: "string" }]);
  }

  function updateField(index: number, field: string, value: string) {
    const updated = fields.map((f, i) =>
      i === index ? { ...f, [field]: value } : f
    );
    update("fields", updated);
  }

  function removeField(index: number) {
    update("fields", fields.filter((_, i) => i !== index));
  }

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Fields to Extract</Label>
          <Button variant="ghost" size="sm" className="h-6 px-2" onClick={addField}>
            <Plus className="mr-1 size-3" /> Add
          </Button>
        </div>
        {fields.map((field, i) => (
          <div key={i} className="space-y-1 rounded border p-2">
            <div className="flex gap-1">
              <Input
                value={field.name}
                onChange={(e) => updateField(i, "name", e.target.value)}
                placeholder="Field name"
                className="flex-1"
              />
              <select
                value={field.type}
                onChange={(e) => updateField(i, "type", e.target.value)}
                className="h-9 rounded-md border bg-background px-2 text-xs"
              >
                <option value="string">string</option>
                <option value="number">number</option>
                <option value="boolean">boolean</option>
              </select>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                onClick={() => removeField(i)}
              >
                <X className="size-3" />
              </Button>
            </div>
            <Input
              value={field.description}
              onChange={(e) => updateField(i, "description", e.target.value)}
              placeholder="Description"
            />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <Label>Model</Label>
        <Input
          value={(data.model as string) ?? "deepseek-chat"}
          onChange={(e) => update("model", e.target.value)}
        />
      </div>
    </>
  );
}

const LOOP_MODES = [
  { value: "count", label: "Fixed Count" },
  { value: "condition", label: "Until Condition" },
  { value: "while", label: "While Condition" },
] as const;

const LOOP_OPERATORS = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "not equals" },
  { value: "contains", label: "contains" },
  { value: "greater_than", label: "greater than" },
  { value: "less_than", label: "less than" },
  { value: "is_truthy", label: "is truthy" },
  { value: "is_falsy", label: "is falsy" },
] as const;

function LoopProperties({ data, update }: SubPanelProps) {
  const mode = (data.mode as string) ?? "count";

  return (
    <>
      <div className="space-y-2">
        <Label>Loop Mode</Label>
        <Select value={mode} onValueChange={(val) => update("mode", val)}>
          <SelectTrigger className="w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOOP_MODES.map((m) => (
              <SelectItem key={m.value} value={m.value} className="text-xs">
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Max Iterations</Label>
        <Input
          type="number"
          min={1}
          max={100}
          value={(data.maxIterations as number) ?? 10}
          onChange={(e) => update("maxIterations", Math.min(100, Math.max(1, parseInt(e.target.value) || 10)))}
        />
        <p className="text-xs text-muted-foreground">Safety limit (1-100)</p>
      </div>

      {(mode === "condition" || mode === "while") && (
        <>
          <div className="space-y-2">
            <Label>Condition Variable</Label>
            <Input
              value={(data.conditionVariable as string) ?? ""}
              onChange={(e) => update("conditionVariable", e.target.value)}
              placeholder="e.g. result_status"
            />
          </div>
          <div className="space-y-2">
            <Label>Operator</Label>
            <Select
              value={(data.conditionOperator as string) ?? "equals"}
              onValueChange={(val) => update("conditionOperator", val)}
            >
              <SelectTrigger className="w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOOP_OPERATORS.map((op) => (
                  <SelectItem key={op.value} value={op.value} className="text-xs">
                    {op.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Condition Value</Label>
            <Input
              value={(data.conditionValue as string) ?? ""}
              onChange={(e) => update("conditionValue", e.target.value)}
              placeholder="e.g. done"
            />
            <p className="text-xs text-muted-foreground">{"Supports {{variable}} templates"}</p>
          </div>
        </>
      )}

      <div className="space-y-2">
        <Label>Loop Variable Name</Label>
        <Input
          value={(data.loopVariable as string) ?? "loop_index"}
          onChange={(e) => update("loopVariable", e.target.value)}
          placeholder="loop_index"
        />
        <p className="text-xs text-muted-foreground">Stores current iteration (0-based)</p>
      </div>

      <div className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
        <p className="font-medium mb-1">Outputs:</p>
        <p><strong>Loop Body</strong> — connects to the subflow to repeat</p>
        <p><strong>Done</strong> — continues after loop completes</p>
      </div>
    </>
  );
}

interface ParallelBranch {
  branchId: string;
  label: string;
  outputVariable: string;
}

const MERGE_STRATEGIES = [
  { value: "all", label: "All must succeed" },
  { value: "any", label: "Any can succeed" },
] as const;

function ParallelProperties({ data, update }: SubPanelProps) {
  const branches = (data.branches as ParallelBranch[]) ?? [];
  const mergeStrategy = (data.mergeStrategy as string) ?? "all";

  function addBranch() {
    const id = `branch-${Date.now()}`;
    update("branches", [
      ...branches,
      { branchId: id, label: `Branch ${branches.length + 1}`, outputVariable: "" },
    ]);
  }

  function updateBranch(index: number, field: string, value: string) {
    const updated = branches.map((b, i) =>
      i === index ? { ...b, [field]: value } : b
    );
    update("branches", updated);
  }

  function removeBranch(index: number) {
    update("branches", branches.filter((_, i) => i !== index));
  }

  return (
    <>
      <div className="space-y-2">
        <Label>Merge Strategy</Label>
        <Select value={mergeStrategy} onValueChange={(val) => update("mergeStrategy", val)}>
          <SelectTrigger className="w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MERGE_STRATEGIES.map((s) => (
              <SelectItem key={s.value} value={s.value} className="text-xs">
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Timeout (seconds)</Label>
        <Input
          type="number"
          min={5}
          max={120}
          value={(data.timeoutSeconds as number) ?? 30}
          onChange={(e) => update("timeoutSeconds", Math.min(120, Math.max(5, parseInt(e.target.value) || 30)))}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Branches (max 5)</Label>
          {branches.length < 5 && (
            <Button variant="ghost" size="sm" className="h-6 px-2" onClick={addBranch}>
              <Plus className="mr-1 size-3" /> Add
            </Button>
          )}
        </div>
        {branches.map((branch, i) => (
          <div key={branch.branchId} className="space-y-1 rounded border p-2">
            <div className="flex gap-1">
              <Input
                value={branch.label}
                onChange={(e) => updateBranch(i, "label", e.target.value)}
                placeholder="Branch label"
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                onClick={() => removeBranch(i)}
              >
                <X className="size-3" />
              </Button>
            </div>
            <Input
              value={branch.outputVariable}
              onChange={(e) => updateBranch(i, "outputVariable", e.target.value)}
              placeholder="Output variable (e.g. branch_1_result)"
            />
          </div>
        ))}
        {branches.length === 0 && (
          <p className="text-xs italic text-muted-foreground">Add branches to run in parallel</p>
        )}
      </div>

      <div className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
        <p className="font-medium mb-1">Outputs:</p>
        {branches.map((b) => (
          <p key={b.branchId}><strong>{b.label}</strong> — connect to branch subflow</p>
        ))}
        <p><strong>Done</strong> — after all branches complete</p>
        <p><strong>Failed</strong> — if merge strategy fails</p>
      </div>
    </>
  );
}

function MemoryWriteProperties({ data, update }: SubPanelProps) {
  return (
    <>
      <div className="space-y-2">
        <Label>Key (template supported)</Label>
        <Input
          value={(data.key as string) ?? ""}
          onChange={(e) => update("key", e.target.value)}
          placeholder="e.g. user_preference or {{topic}}"
        />
      </div>

      <div className="space-y-2">
        <Label>Value (template supported)</Label>
        <Textarea
          value={(data.value as string) ?? ""}
          onChange={(e) => update("value", e.target.value)}
          placeholder='e.g. {{last_message}} or {"key": "value"}'
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label>Category</Label>
        <Input
          value={(data.category as string) ?? "general"}
          onChange={(e) => update("category", e.target.value)}
          placeholder="general"
        />
      </div>

      <div className="space-y-2">
        <Label>Importance (0–1)</Label>
        <Input
          type="number"
          min={0}
          max={1}
          step={0.1}
          value={Number(data.importance) || 0.5}
          onChange={(e) => update("importance", parseFloat(e.target.value) || 0.5)}
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="generateEmbedding"
          checked={(data.generateEmbedding as boolean) ?? false}
          onChange={(e) => update("generateEmbedding", e.target.checked)}
          className="rounded"
        />
        <Label htmlFor="generateEmbedding" className="text-sm font-normal">
          Generate embedding (for semantic search)
        </Label>
      </div>

      <div className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
        <p>Max 1000 memories per agent. Lowest-importance, least-accessed memories are evicted when full.</p>
      </div>
    </>
  );
}

function MemoryReadProperties({ data, update }: SubPanelProps) {
  const mode = (data.mode as string) ?? "key";

  return (
    <>
      <div className="space-y-2">
        <Label>Read Mode</Label>
        <Select value={mode} onValueChange={(v) => update("mode", v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="key">By Key</SelectItem>
            <SelectItem value="category">By Category</SelectItem>
            <SelectItem value="search">Semantic Search</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {mode === "key" && (
        <div className="space-y-2">
          <Label>Key (template supported)</Label>
          <Input
            value={(data.key as string) ?? ""}
            onChange={(e) => update("key", e.target.value)}
            placeholder="e.g. user_preference"
          />
        </div>
      )}

      {mode === "category" && (
        <div className="space-y-2">
          <Label>Category</Label>
          <Input
            value={(data.category as string) ?? ""}
            onChange={(e) => update("category", e.target.value)}
            placeholder="general"
          />
        </div>
      )}

      {mode === "search" && (
        <div className="space-y-2">
          <Label>Search Query (template supported)</Label>
          <Textarea
            value={(data.searchQuery as string) ?? ""}
            onChange={(e) => update("searchQuery", e.target.value)}
            placeholder="e.g. {{last_message}}"
            rows={2}
          />
        </div>
      )}

      {(mode === "category" || mode === "search") && (
        <div className="space-y-2">
          <Label>Max Results</Label>
          <Input
            type="number"
            min={1}
            max={50}
            value={Number(data.topK) || 5}
            onChange={(e) => update("topK", parseInt(e.target.value) || 5)}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label>Output Variable</Label>
        <Input
          value={(data.outputVariable as string) ?? "memory_result"}
          onChange={(e) => update("outputVariable", e.target.value)}
          placeholder="memory_result"
        />
      </div>

      <div className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
        {mode === "key" && <p>Returns the value for a single key, or null if not found.</p>}
        {mode === "category" && <p>Returns an array of memories in the category, sorted by importance.</p>}
        {mode === "search" && <p>Semantic search using embeddings. Requires memories with embeddings. Falls back to text search if unavailable.</p>}
      </div>
    </>
  );
}

function EvaluatorProperties({ data, update }: SubPanelProps) {
  interface Criterion {
    name: string;
    description: string;
    weight: number;
  }

  const criteria = (data.criteria as Criterion[]) ?? [];

  function updateCriterion(index: number, field: keyof Criterion, value: string | number) {
    const updated = [...criteria];
    updated[index] = { ...updated[index], [field]: value };
    update("criteria", updated);
  }

  function addCriterion() {
    update("criteria", [
      ...criteria,
      { name: "", description: "", weight: 1 },
    ]);
  }

  function removeCriterion(index: number) {
    update("criteria", criteria.filter((_, i) => i !== index));
  }

  return (
    <>
      <div className="space-y-2">
        <Label>Input Variable</Label>
        <Input
          value={(data.inputVariable as string) ?? ""}
          onChange={(e) => update("inputVariable", e.target.value)}
          placeholder="e.g. ai_response"
        />
      </div>

      <div className="space-y-2">
        <Label>Output Variable</Label>
        <Input
          value={(data.outputVariable as string) ?? "eval_result"}
          onChange={(e) => update("outputVariable", e.target.value)}
          placeholder="eval_result"
        />
      </div>

      <div className="space-y-2">
        <Label>Model</Label>
        <Input
          value={(data.model as string) ?? ""}
          onChange={(e) => update("model", e.target.value)}
          placeholder="Default: deepseek-chat"
        />
      </div>

      <div className="space-y-2">
        <Label>Passing Score (0–10)</Label>
        <Input
          type="number"
          min={0}
          max={10}
          step={0.5}
          value={Number(data.passingScore) || 7}
          onChange={(e) => update("passingScore", parseFloat(e.target.value) || 7)}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Criteria</Label>
          <Button variant="ghost" size="sm" className="h-6 px-2" onClick={addCriterion}>
            <Plus className="mr-1 size-3" /> Add
          </Button>
        </div>
        {criteria.map((c, i) => (
          <div key={i} className="space-y-1 rounded border p-2">
            <div className="flex gap-1">
              <Input
                value={c.name}
                onChange={(e) => updateCriterion(i, "name", e.target.value)}
                placeholder="Criterion name"
                className="flex-1"
              />
              <Input
                type="number"
                min={0}
                max={10}
                step={0.1}
                value={c.weight}
                onChange={(e) => updateCriterion(i, "weight", parseFloat(e.target.value) || 1)}
                className="w-16"
                placeholder="Weight"
              />
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                onClick={() => removeCriterion(i)}
              >
                <X className="size-3" />
              </Button>
            </div>
            <Input
              value={c.description}
              onChange={(e) => updateCriterion(i, "description", e.target.value)}
              placeholder="Describe what to evaluate"
            />
          </div>
        ))}
      </div>

      <div className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
        <p className="font-medium mb-1">Outputs:</p>
        <p><strong>Pass</strong> — score ≥ passing threshold</p>
        <p><strong>Fail</strong> — score below threshold</p>
      </div>
    </>
  );
}

interface CronPreview {
  description: string;
  nextRuns: string[];
  valid: boolean;
  error?: string;
}

const CRON_PRESETS = [
  { label: "Daily 9am", value: "0 9 * * *" },
  { label: "Weekdays 9am", value: "0 9 * * 1-5" },
  { label: "Hourly", value: "0 * * * *" },
  { label: "Mon 9am", value: "0 9 * * 1" },
];

const INTERVAL_PRESETS = [
  { label: "5 min", value: 5 },
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "1 hr", value: 60 },
  { label: "6 hr", value: 360 },
  { label: "12 hr", value: 720 },
  { label: "Daily", value: 1440 },
  { label: "Weekly", value: 10080 },
];

const COMMON_TIMEZONES = [
  "UTC", "America/New_York", "America/Chicago", "America/Denver",
  "America/Los_Angeles", "America/Sao_Paulo", "Europe/London",
  "Europe/Paris", "Europe/Berlin", "Europe/Belgrade", "Europe/Moscow",
  "Asia/Dubai", "Asia/Kolkata", "Asia/Shanghai", "Asia/Tokyo",
  "Asia/Seoul", "Australia/Sydney", "Pacific/Auckland",
];

const SCHEDULE_TYPE_MAP: Record<string, string> = {
  cron: "CRON",
  interval: "INTERVAL",
  manual: "MANUAL",
};

interface ScheduleTriggerPropertiesProps extends SubPanelProps {
  agentId: string;
}

interface LiveSchedule {
  id: string;
  enabled: boolean;
  failureCount: number;
  maxRetries: number;
  scheduleType: string;
  cronExpression: string | null;
  intervalMinutes: number | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  executions: Array<{
    id: string;
    status: string;
    triggeredAt: string;
    completedAt: string | null;
    durationMs: number | null;
    errorMessage: string | null;
  }>;
}

function ScheduleTriggerProperties({ data, update, agentId }: ScheduleTriggerPropertiesProps) {
  const scheduleType = (data.scheduleType as string) ?? "manual";
  const cronExpression = (data.cronExpression as string) ?? "";
  const intervalMinutes = Number(data.intervalMinutes) || 60;
  const timezone = (data.timezone as string) ?? "UTC";
  const nodeEnabled = (data.enabled as boolean) !== false; // defaults to true

  const [preview, setPreview] = useState<CronPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [schedules, setSchedules] = useState<LiveSchedule[] | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [toggleLoading, setToggleLoading] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Fetch live schedules for this agent
  useEffect(() => {
    if (!agentId) return;
    setScheduleLoading(true);
    fetch(`/api/agents/${agentId}/schedules`)
      .then((r) => r.json())
      .then((res) => { if (res.success) setSchedules(res.data as LiveSchedule[]); })
      .catch(() => {})
      .finally(() => setScheduleLoading(false));
  }, [agentId]);

  async function toggleSchedule(schedule: LiveSchedule) {
    if (!agentId || toggleLoading) return;
    setToggleLoading(schedule.id);
    try {
      const res = await fetch(`/api/agents/${agentId}/schedules/${schedule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !schedule.enabled }),
      });
      const json = await res.json() as { success: boolean; data?: LiveSchedule };
      if (json.success && json.data) {
        setSchedules((prev) =>
          prev?.map((s) => s.id === schedule.id ? { ...s, enabled: !schedule.enabled } : s) ?? null
        );
      }
    } catch {
      // ignore
    } finally {
      setToggleLoading(null);
    }
  }

  useEffect(() => {
    if (scheduleType === "manual") {
      setPreview({
        description: "Triggered manually only — no automatic runs.",
        nextRuns: [],
        valid: true,
      });
      return;
    }

    const body: Record<string, unknown> = {
      scheduleType: SCHEDULE_TYPE_MAP[scheduleType] ?? "MANUAL",
      timezone,
    };
    if (scheduleType === "cron") body.cronExpression = cronExpression;
    if (scheduleType === "interval") body.intervalMinutes = intervalMinutes;

    const timer = setTimeout(() => {
      setPreviewLoading(true);
      fetch("/api/schedules/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
        .then((res) => res.json() as Promise<{ success: boolean; data?: CronPreview; error?: string }>)
        .then((json) => {
          if (json.success && json.data) {
            setPreview(json.data);
          } else {
            setPreview({ description: "", nextRuns: [], valid: false, error: json.error ?? "Invalid schedule" });
          }
        })
        .catch(() => setPreview(null))
        .finally(() => setPreviewLoading(false));
    }, 600);

    return () => clearTimeout(timer);
  }, [scheduleType, cronExpression, intervalMinutes, timezone]);

  function formatNextRun(isoString: string): string {
    try {
      return new Date(isoString).toLocaleString("en-US", {
        timeZone: timezone || "UTC",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      });
    } catch {
      return isoString;
    }
  }

  function statusBadge(schedule: LiveSchedule) {
    const broken = schedule.failureCount >= schedule.maxRetries && !schedule.enabled;
    if (broken) return (
      <span className="rounded bg-red-900/30 px-1.5 py-0.5 text-[10px] text-red-300">circuit broken</span>
    );
    if (!schedule.enabled) return (
      <span className="rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400">disabled</span>
    );
    return (
      <span className="rounded bg-green-900/30 px-1.5 py-0.5 text-[10px] text-green-300">active</span>
    );
  }

  function execStatusColor(status: string): string {
    if (status === "COMPLETED") return "text-green-400";
    if (status === "FAILED") return "text-red-400";
    if (status === "RUNNING") return "text-blue-400";
    return "text-zinc-400";
  }

  return (
    <>
      {/* ── Enable flag stored in node data ─────────────────────────────── */}
      <div className="flex items-center justify-between">
        <Label>Enabled by default</Label>
        <button
          type="button"
          onClick={() => update("enabled", !nodeEnabled)}
          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
            nodeEnabled ? "bg-blue-600" : "bg-zinc-600"
          }`}
        >
          <span
            className={`inline-block size-4 rounded-full bg-white shadow transition-transform duration-200 ${
              nodeEnabled ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      <div className="space-y-2">
        <Label>Schedule Type</Label>
        <Select value={scheduleType} onValueChange={(v) => update("scheduleType", v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="cron">Cron Expression</SelectItem>
            <SelectItem value="interval">Fixed Interval</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {scheduleType === "cron" && (
        <div className="space-y-2">
          <Label>Cron Expression</Label>
          <Input
            value={cronExpression}
            onChange={(e) => update("cronExpression", e.target.value)}
            placeholder="0 9 * * 1-5"
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">minute · hour · day · month · weekday</p>
          <div className="flex flex-wrap gap-1">
            {CRON_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => update("cronExpression", preset.value)}
                className={`rounded border px-2 py-0.5 text-xs transition-colors ${
                  cronExpression === preset.value
                    ? "border-blue-500 bg-blue-900/30 text-blue-300"
                    : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {scheduleType === "interval" && (
        <div className="space-y-2">
          <Label>Interval (minutes)</Label>
          <Input
            type="number"
            min={1}
            max={10080}
            value={intervalMinutes}
            onChange={(e) => update("intervalMinutes", parseInt(e.target.value) || 60)}
          />
          <div className="flex flex-wrap gap-1">
            {INTERVAL_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => update("intervalMinutes", preset.value)}
                className={`rounded border px-2 py-0.5 text-xs transition-colors ${
                  intervalMinutes === preset.value
                    ? "border-blue-500 bg-blue-900/30 text-blue-300"
                    : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>Timezone</Label>
        <Input
          value={timezone}
          onChange={(e) => update("timezone", e.target.value)}
          placeholder="UTC"
          list="schedule-tz-list"
        />
        <datalist id="schedule-tz-list">
          {COMMON_TIMEZONES.map((tz) => (
            <option key={tz} value={tz} />
          ))}
        </datalist>
        <p className="text-xs text-muted-foreground">IANA timezone (e.g. Europe/Belgrade)</p>
      </div>

      {/* Live preview panel */}
      <div className="rounded-md border border-zinc-700 bg-zinc-800/50 p-3 space-y-2">
        <p className="text-xs font-medium text-zinc-400">Schedule Preview</p>
        {previewLoading && (
          <p className="text-xs text-zinc-500 animate-pulse">Computing…</p>
        )}
        {!previewLoading && preview?.valid && preview.description && (
          <p className="text-xs text-green-400">{preview.description}</p>
        )}
        {!previewLoading && preview && !preview.valid && preview.error && (
          <p className="text-xs text-red-400">{preview.error}</p>
        )}
        {!previewLoading && preview?.valid && preview.nextRuns.length > 0 && (
          <div className="space-y-1 pt-1 border-t border-zinc-700/50">
            <p className="text-xs text-zinc-500">Next runs:</p>
            {preview.nextRuns.map((run, i) => (
              <p key={i} className="text-xs font-mono text-zinc-300">
                {formatNextRun(run)}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>Output Variable</Label>
        <Input
          value={(data.outputVariable as string) ?? "trigger_info"}
          onChange={(e) => update("outputVariable", e.target.value)}
          placeholder="trigger_info"
        />
      </div>

      {/* ── Live schedules panel ─────────────────────────────────────────── */}
      {agentId && (
        <div className="rounded-md border border-zinc-700 bg-zinc-800/50 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-zinc-400">Live Schedules</p>
            {scheduleLoading && (
              <span className="text-[10px] text-zinc-500 animate-pulse">loading…</span>
            )}
          </div>

          {!scheduleLoading && schedules !== null && schedules.length === 0 && (
            <p className="text-xs text-zinc-500">
              No schedules yet — create one via the Schedules API.
            </p>
          )}

          {schedules && schedules.map((sched) => (
            <div key={sched.id} className="rounded border border-zinc-700 bg-zinc-900/50 p-2 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  {statusBadge(sched)}
                  <span className="text-[10px] font-mono text-zinc-400 truncate">
                    {sched.cronExpression ?? (sched.intervalMinutes ? `every ${sched.intervalMinutes}m` : sched.scheduleType.toLowerCase())}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={toggleLoading === sched.id}
                  onClick={() => void toggleSchedule(sched)}
                  className={`flex-shrink-0 relative inline-flex h-4 w-7 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-50 ${
                    sched.enabled ? "bg-blue-600" : "bg-zinc-600"
                  }`}
                >
                  <span
                    className={`inline-block size-3 rounded-full bg-white shadow transition-transform duration-200 ${
                      sched.enabled ? "translate-x-3" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
              {sched.nextRunAt && sched.enabled && (
                <p className="text-[10px] text-zinc-500">
                  Next: {new Date(sched.nextRunAt).toLocaleString("en-US", {
                    month: "short", day: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </p>
              )}
              {sched.executions[0] && (
                <p className={`text-[10px] ${execStatusColor(sched.executions[0].status)}`}>
                  Last: {sched.executions[0].status.toLowerCase()}
                  {sched.executions[0].durationMs
                    ? ` · ${sched.executions[0].durationMs}ms`
                    : ""}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Execution History ─────────────────────────────────────────────── */}
      {agentId && schedules && schedules.length > 0 && (
        <div className="rounded-md border border-zinc-700 bg-zinc-800/50 p-3 space-y-2">
          <button
            type="button"
            className="flex items-center justify-between w-full text-left"
            onClick={() => setHistoryOpen((v) => !v)}
          >
            <p className="text-xs font-medium text-zinc-400">Execution History</p>
            <span className="text-[10px] text-zinc-500">{historyOpen ? "▲" : "▼"}</span>
          </button>

          {historyOpen && (
            <div className="space-y-1 pt-1 border-t border-zinc-700/50">
              {schedules.flatMap((s) => s.executions).length === 0 ? (
                <p className="text-xs text-zinc-500">No executions yet.</p>
              ) : (
                schedules.flatMap((s) => s.executions).map((exec) => (
                  <div key={exec.id} className="flex items-center gap-2 text-[10px]">
                    <span className={`font-medium ${execStatusColor(exec.status)}`}>
                      {exec.status.toLowerCase()}
                    </span>
                    <span className="text-zinc-500">
                      {new Date(exec.triggeredAt).toLocaleString("en-US", {
                        month: "short", day: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                    {exec.durationMs && (
                      <span className="text-zinc-600">{exec.durationMs}ms</span>
                    )}
                    {exec.errorMessage && (
                      <span className="text-red-400 truncate max-w-[120px]" title={exec.errorMessage}>
                        {exec.errorMessage}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      <div className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
        <p>This node is a flow entry point. The scheduling system will trigger the flow based on the configured schedule. At runtime, trigger metadata is stored in the output variable.</p>
      </div>
    </>
  );
}

function EmailSendProperties({ data, update }: SubPanelProps) {
  return (
    <>
      <div className="space-y-2">
        <Label>To (template supported)</Label>
        <Input
          value={(data.to as string) ?? ""}
          onChange={(e) => update("to", e.target.value)}
          placeholder="user@example.com or {{user_email}}"
        />
        <p className="text-xs text-muted-foreground">Comma-separated for multiple recipients</p>
      </div>

      <div className="space-y-2">
        <Label>Subject (template supported)</Label>
        <Input
          value={(data.subject as string) ?? ""}
          onChange={(e) => update("subject", e.target.value)}
          placeholder="e.g. Report for {{date}}"
        />
      </div>

      <div className="space-y-2">
        <Label>Body (template supported)</Label>
        <Textarea
          value={(data.body as string) ?? ""}
          onChange={(e) => update("body", e.target.value)}
          placeholder="Email body content..."
          rows={4}
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="isHtml"
          checked={(data.isHtml as boolean) ?? false}
          onChange={(e) => update("isHtml", e.target.checked)}
          className="rounded"
        />
        <Label htmlFor="isHtml" className="text-sm font-normal">
          HTML body
        </Label>
      </div>

      <div className="space-y-2">
        <Label>From Name</Label>
        <Input
          value={(data.fromName as string) ?? "Agent Studio"}
          onChange={(e) => update("fromName", e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>Reply-To</Label>
        <Input
          value={(data.replyTo as string) ?? ""}
          onChange={(e) => update("replyTo", e.target.value)}
          placeholder="Optional reply-to address"
        />
      </div>

      <div className="space-y-2">
        <Label>Webhook URL</Label>
        <Input
          value={(data.webhookUrl as string) ?? ""}
          onChange={(e) => update("webhookUrl", e.target.value)}
          placeholder="https://your-email-api.com/send"
        />
        <p className="text-xs text-muted-foreground">Leave empty for dry-run mode (logs only)</p>
      </div>

      <div className="space-y-2">
        <Label>Output Variable</Label>
        <Input
          value={(data.outputVariable as string) ?? "email_result"}
          onChange={(e) => update("outputVariable", e.target.value)}
        />
      </div>
    </>
  );
}

function NotificationProperties({ data, update }: SubPanelProps) {
  const channel = (data.channel as string) ?? "log";

  return (
    <>
      <div className="space-y-2">
        <Label>Channel</Label>
        <Select value={channel} onValueChange={(v) => update("channel", v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="log">Log</SelectItem>
            <SelectItem value="in_app">In-App Message</SelectItem>
            <SelectItem value="webhook">Webhook (Slack/Discord/Teams)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Level</Label>
        <Select
          value={(data.level as string) ?? "info"}
          onValueChange={(v) => update("level", v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Title (template supported)</Label>
        <Input
          value={(data.title as string) ?? ""}
          onChange={(e) => update("title", e.target.value)}
          placeholder="Notification title"
        />
      </div>

      <div className="space-y-2">
        <Label>Message (template supported)</Label>
        <Textarea
          value={(data.message as string) ?? ""}
          onChange={(e) => update("message", e.target.value)}
          placeholder="Notification body..."
          rows={3}
        />
      </div>

      {channel === "webhook" && (
        <div className="space-y-2">
          <Label>Webhook URL</Label>
          <Input
            value={(data.webhookUrl as string) ?? ""}
            onChange={(e) => update("webhookUrl", e.target.value)}
            placeholder="https://hooks.slack.com/services/..."
          />
        </div>
      )}

      <div className="space-y-2">
        <Label>Output Variable</Label>
        <Input
          value={(data.outputVariable as string) ?? "notification_result"}
          onChange={(e) => update("outputVariable", e.target.value)}
        />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Format Transform Properties                                       */
/* ------------------------------------------------------------------ */

const TRANSFORM_FORMATS = [
  { value: "json_to_text", label: "JSON → Text" },
  { value: "text_to_json", label: "Text → JSON" },
  { value: "csv_to_json", label: "CSV → JSON" },
  { value: "json_to_csv", label: "JSON → CSV" },
  { value: "template", label: "Template" },
  { value: "uppercase", label: "Uppercase" },
  { value: "lowercase", label: "Lowercase" },
  { value: "trim", label: "Trim" },
  { value: "split", label: "Split" },
  { value: "join", label: "Join" },
] as const;

function FormatTransformProperties({ data, update }: SubPanelProps) {
  const format = (data.format as string) || "template";
  const showTemplate = format === "template" || format === "json_to_text";
  const showSeparator = ["csv_to_json", "json_to_csv", "split", "join"].includes(format);

  return (
    <>
      <div className="space-y-2">
        <Label>Transform Format</Label>
        <Select value={format} onValueChange={(v) => update("format", v)}>
          <SelectTrigger className="w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TRANSFORM_FORMATS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Input Variable</Label>
        <Input
          placeholder="e.g. api_result"
          value={(data.inputVariable as string) ?? ""}
          onChange={(e) => update("inputVariable", e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Leave empty to use direct input value below</p>
      </div>

      <div className="space-y-2">
        <Label>Direct Input Value</Label>
        <Textarea
          placeholder="Or enter data directly..."
          rows={3}
          value={(data.inputValue as string) ?? ""}
          onChange={(e) => update("inputValue", e.target.value)}
        />
      </div>

      {showTemplate && (
        <div className="space-y-2">
          <Label>Template</Label>
          <Textarea
            placeholder="Use {{variable}} syntax..."
            rows={3}
            value={(data.template as string) ?? ""}
            onChange={(e) => update("template", e.target.value)}
          />
        </div>
      )}

      {showSeparator && (
        <div className="space-y-2">
          <Label>Separator</Label>
          <Input
            value={(data.separator as string) ?? ","}
            onChange={(e) => update("separator", e.target.value)}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label>Output Variable</Label>
        <Input
          value={(data.outputVariable as string) ?? "transform_result"}
          onChange={(e) => update("outputVariable", e.target.value)}
        />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Switch Properties                                                  */
/* ------------------------------------------------------------------ */

interface SwitchCase {
  value: string;
  label: string;
}

function SwitchProperties({ data, update }: SubPanelProps) {
  const cases = ((data.cases as SwitchCase[]) || []).map((c) => ({
    value: c.value ?? "",
    label: c.label ?? "",
  }));

  function updateCases(newCases: SwitchCase[]) {
    update("cases", newCases);
  }

  function addCase() {
    updateCases([...cases, { value: "", label: "" }]);
  }

  function removeCase(index: number) {
    updateCases(cases.filter((_, i) => i !== index));
  }

  function updateCase(index: number, field: "value" | "label", val: string) {
    const updated = [...cases];
    updated[index] = { ...updated[index], [field]: val };
    updateCases(updated);
  }

  return (
    <>
      <div className="space-y-2">
        <Label>Variable to Match</Label>
        <Input
          placeholder="e.g. user_choice"
          value={(data.variable as string) ?? ""}
          onChange={(e) => update("variable", e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>Match Operator</Label>
        <Select
          value={(data.operator as string) || "equals"}
          onValueChange={(v) => update("operator", v)}
        >
          <SelectTrigger className="w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="equals">Equals</SelectItem>
            <SelectItem value="contains">Contains</SelectItem>
            <SelectItem value="starts_with">Starts With</SelectItem>
            <SelectItem value="ends_with">Ends With</SelectItem>
            <SelectItem value="regex">Regex</SelectItem>
            <SelectItem value="gt">Greater Than</SelectItem>
            <SelectItem value="gte">Greater or Equal</SelectItem>
            <SelectItem value="lt">Less Than</SelectItem>
            <SelectItem value="lte">Less or Equal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Cases</Label>
          <Button variant="ghost" size="sm" onClick={addCase}>
            <Plus className="mr-1 size-3" />
            Add
          </Button>
        </div>

        {cases.map((c, i) => (
          <div key={i} className="flex gap-2 items-start">
            <div className="flex-1 space-y-1">
              <Input
                placeholder={`Case ${i + 1} value`}
                value={c.value}
                onChange={(e) => updateCase(i, "value", e.target.value)}
              />
              <Input
                placeholder="Label (optional)"
                value={c.label}
                onChange={(e) => updateCase(i, "label", e.target.value)}
                className="text-xs"
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => removeCase(i)}
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        ))}

        <p className="text-xs text-muted-foreground italic">
          Unmatched values route to the &quot;default&quot; output.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Output Variable</Label>
        <Input
          value={(data.outputVariable as string) ?? "switch_result"}
          onChange={(e) => update("outputVariable", e.target.value)}
        />
      </div>
    </>
  );
}

function WebFetchProperties({ data, update }: SubPanelProps) {
  return (
    <>
      <div className="space-y-2">
        <Label>URL</Label>
        <Input
          value={(data.url as string) ?? ""}
          onChange={(e) => update("url", e.target.value)}
          placeholder="https://example.com or {{url_variable}}"
        />
        <p className="text-xs text-muted-foreground">
          Supports {"{{variable}}"} templates
        </p>
      </div>

      <div className="space-y-2">
        <Label>Provider</Label>
        <Select
          value={(data.provider as string) ?? "jina"}
          onValueChange={(val) => update("provider", val)}
        >
          <SelectTrigger className="w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="jina">Jina Reader (Markdown)</SelectItem>
            <SelectItem value="raw">Raw HTML (Cheerio)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Output Variable</Label>
        <Input
          value={(data.outputVariable as string) ?? "web_content"}
          onChange={(e) => update("outputVariable", e.target.value)}
          placeholder="web_content"
        />
      </div>

      <div className="space-y-2">
        <Label>Max Length</Label>
        <Input
          type="number"
          value={(data.maxLength as number) ?? 10000}
          onChange={(e) => update("maxLength", Number(e.target.value))}
          min={100}
          max={100000}
        />
        <p className="text-xs text-muted-foreground">
          Truncate content to this many characters
        </p>
      </div>
    </>
  );
}

const BROWSER_ACTIONS = [
  { value: "navigate", label: "Navigate" },
  { value: "click", label: "Click" },
  { value: "type", label: "Type" },
  { value: "snapshot", label: "Snapshot" },
  { value: "screenshot", label: "Screenshot" },
  { value: "wait", label: "Wait" },
  { value: "select", label: "Select Option" },
  { value: "save_pdf", label: "Save PDF" },
] as const;

interface BrowserStep {
  action: string;
  url?: string;
  selector?: string;
  text?: string;
  description?: string;
  timeout?: number;
  value?: string;
  filename?: string;
}

function BrowserActionProperties({ data, update }: SubPanelProps) {
  const actions = (data.actions as BrowserStep[]) ?? [];

  function addAction() {
    update("actions", [...actions, { action: "navigate", url: "" }]);
  }

  function updateAction(index: number, field: string, value: unknown) {
    const updated = actions.map((a, i) =>
      i === index ? { ...a, [field]: value } : a
    );
    update("actions", updated);
  }

  function removeAction(index: number) {
    update("actions", actions.filter((_, i) => i !== index));
  }

  return (
    <>
      <div className="space-y-2">
        <Label>MCP Server ID</Label>
        <Input
          value={(data.mcpServerId as string) ?? ""}
          onChange={(e) => update("mcpServerId", e.target.value)}
          placeholder="Playwright MCP Server ID"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Actions</Label>
          <Button variant="ghost" size="sm" onClick={addAction}>
            <Plus className="mr-1 size-3" />
            Add
          </Button>
        </div>

        {actions.map((step, i) => (
          <div key={i} className="space-y-1.5 rounded-md border p-2">
            <div className="flex items-center gap-2">
              <Select
                value={step.action}
                onValueChange={(val) => updateAction(i, "action", val)}
              >
                <SelectTrigger className="flex-1 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BROWSER_ACTIONS.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={() => removeAction(i)}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>

            {step.action === "navigate" && (
              <Input
                value={step.url ?? ""}
                onChange={(e) => updateAction(i, "url", e.target.value)}
                placeholder="URL"
                className="text-xs"
              />
            )}

            {(step.action === "click" || step.action === "select") && (
              <Input
                value={step.selector ?? ""}
                onChange={(e) => updateAction(i, "selector", e.target.value)}
                placeholder="Selector / ref"
                className="text-xs"
              />
            )}

            {step.action === "type" && (
              <>
                <Input
                  value={step.selector ?? ""}
                  onChange={(e) => updateAction(i, "selector", e.target.value)}
                  placeholder="Selector / ref"
                  className="text-xs"
                />
                <Input
                  value={step.text ?? ""}
                  onChange={(e) => updateAction(i, "text", e.target.value)}
                  placeholder="Text to type"
                  className="text-xs"
                />
              </>
            )}

            {step.action === "select" && (
              <Input
                value={step.value ?? ""}
                onChange={(e) => updateAction(i, "value", e.target.value)}
                placeholder="Option value"
                className="text-xs"
              />
            )}

            {step.action === "wait" && (
              <Input
                type="number"
                value={step.timeout ?? 1000}
                onChange={(e) => updateAction(i, "timeout", Number(e.target.value))}
                placeholder="Timeout (ms)"
                className="text-xs"
              />
            )}

            {step.action === "save_pdf" && (
              <Input
                value={step.filename ?? ""}
                onChange={(e) => updateAction(i, "filename", e.target.value)}
                placeholder="Filename"
                className="text-xs"
              />
            )}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Label>Output Variable</Label>
        <Input
          value={(data.outputVariable as string) ?? "browser_result"}
          onChange={(e) => update("outputVariable", e.target.value)}
        />
      </div>
    </>
  );
}

interface DesktopAction {
  appId: string;
  capabilityId: string;
  command: string;
  parameters: Record<string, string>;
}

function DesktopAppProperties({ data, update }: SubPanelProps) {
  const appId = (data.appId as string) || "";
  const actions = (data.actions as DesktopAction[]) ?? [];
  const selectedApp = appId ? getDesktopApp(appId) : undefined;

  function selectApp(id: string) {
    update("appId", id);
    update("actions", []);
  }

  function addAction() {
    if (!selectedApp || selectedApp.capabilities.length === 0) return;
    const cap = selectedApp.capabilities[0];
    const defaultParams: Record<string, string> = {};
    for (const p of cap.parameters) {
      defaultParams[p.name] = "";
    }
    update("actions", [
      ...actions,
      { appId, capabilityId: cap.id, command: cap.command, parameters: defaultParams },
    ]);
  }

  function updateAction(index: number, field: string, value: unknown) {
    const updated = actions.map((a, i) =>
      i === index ? { ...a, [field]: value } : a
    );
    update("actions", updated);
  }

  function changeCapability(index: number, capabilityId: string) {
    if (!selectedApp) return;
    const cap = selectedApp.capabilities.find((c) => c.id === capabilityId);
    if (!cap) return;
    const defaultParams: Record<string, string> = {};
    for (const p of cap.parameters) {
      defaultParams[p.name] = "";
    }
    const updated = actions.map((a, i) =>
      i === index
        ? { ...a, capabilityId, command: cap.command, parameters: defaultParams }
        : a
    );
    update("actions", updated);
  }

  function updateParam(actionIndex: number, paramName: string, value: string) {
    const action = actions[actionIndex];
    const updatedParams = { ...action.parameters, [paramName]: value };
    updateAction(actionIndex, "parameters", updatedParams);
  }

  function removeAction(index: number) {
    update("actions", actions.filter((_, i) => i !== index));
  }

  return (
    <>
      <div className="space-y-2">
        <Label>CLI Bridge Server ID</Label>
        <Input
          value={(data.mcpServerId as string) ?? ""}
          onChange={(e) => update("mcpServerId", e.target.value)}
          placeholder="CLI Bridge server ID"
        />
      </div>

      <div className="space-y-2">
        <Label>Application</Label>
        <div className="grid grid-cols-4 gap-1.5">
          {DESKTOP_APPS.map((app) => {
            const Icon = app.icon;
            const isSelected = appId === app.id;
            return (
              <button
                key={app.id}
                className={`flex flex-col items-center gap-1 rounded-md border p-2 text-center transition-colors hover:bg-accent ${
                  isSelected ? "border-primary bg-accent" : "border-transparent"
                }`}
                onClick={() => selectApp(app.id)}
                title={app.description}
              >
                <Icon className="size-5" />
                <span className="text-[10px] leading-tight">{app.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Session Mode</Label>
        <Select
          value={(data.sessionMode as string) || "new"}
          onValueChange={(val) => update("sessionMode", val)}
        >
          <SelectTrigger className="text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="new">New Session</SelectItem>
            <SelectItem value="continue">Continue Session</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {selectedApp && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Actions</Label>
            <Button variant="ghost" size="sm" onClick={addAction}>
              <Plus className="mr-1 size-3" />
              Add
            </Button>
          </div>

          {actions.map((action, i) => {
            const cap = selectedApp.capabilities.find((c) => c.id === action.capabilityId);
            return (
              <div key={i} className="space-y-1.5 rounded-md border p-2">
                <div className="flex items-center gap-2">
                  <Select
                    value={action.capabilityId}
                    onValueChange={(val) => changeCapability(i, val)}
                  >
                    <SelectTrigger className="flex-1 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedApp.capabilities.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => removeAction(i)}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>

                {cap && cap.parameters.map((param) => (
                  <div key={param.name} className="space-y-0.5">
                    <span className="text-[10px] text-muted-foreground">{param.label}</span>
                    <Input
                      value={action.parameters[param.name] ?? ""}
                      onChange={(e) => updateParam(i, param.name, e.target.value)}
                      placeholder={param.placeholder ?? "{{variable}}"}
                      className="text-xs"
                    />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-2">
        <Label>Output Variable</Label>
        <Input
          value={(data.outputVariable as string) ?? "desktop_result"}
          onChange={(e) => update("outputVariable", e.target.value)}
        />
      </div>
    </>
  );
}
