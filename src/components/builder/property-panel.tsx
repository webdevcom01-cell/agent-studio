"use client";

import { useEffect, useState } from "react";
import { type Node } from "@xyflow/react";
import { Trash2, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface PropertyPanelProps {
  node: Node;
  allNodes: Node[];
  agentId?: string;
  onUpdateData: (nodeId: string, data: Record<string, unknown>) => void;
  onDeleteNode: (nodeId: string) => void;
  onClose: () => void;
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

  function update(key: string, value: unknown) {
    onUpdateData(node.id, { [key]: value });
  }

  return (
    <div className="flex w-80 flex-col border-l bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="text-sm font-semibold">Properties</h3>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={onClose}
        >
          <X className="size-4" />
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
              <Input
                value={(data.model as string) ?? "deepseek-chat"}
                onChange={(e) => update("model", e.target.value)}
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
      </div>

      <div className="border-t p-4">
        <Button
          variant="destructive"
          size="sm"
          className="w-full"
          onClick={() => onDeleteNode(node.id)}
        >
          <Trash2 className="mr-2 size-4" />
          Delete Node
        </Button>
      </div>
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
              <select
                value={targetAgentId}
                onChange={(e) => handleAgentChange(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                disabled={isLoading}
              >
                <option value="">{isLoading ? "Loading..." : "Select an agent..."}</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
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
