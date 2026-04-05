"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Plug,
  Loader2,
  ChevronDown,
  ChevronRight,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface MCPServer {
  id: string;
  name: string;
  url: string;
  transport: "STREAMABLE_HTTP" | "SSE";
  enabled: boolean;
  toolsCache: string[] | null;
}

interface AgentMCPLink {
  id: string;
  mcpServerId: string;
  enabledTools: string[] | null;
  mcpServer: MCPServer;
}

interface AgentMCPSelectorProps {
  agentId: string;
}

const serversFetcher = (url: string): Promise<{ success: boolean; data: MCPServer[] }> =>
  fetch(url).then((r) => r.json());

const linksFetcher = (url: string): Promise<{ success: boolean; data: AgentMCPLink[] }> =>
  fetch(url).then((r) => r.json());

export function AgentMCPSelector({ agentId }: AgentMCPSelectorProps): React.ReactElement {
  const { data: serversData } = useSWR("/api/mcp-servers", serversFetcher);
  const { data: linksData, mutate: mutateLinks } = useSWR(
    `/api/agents/${agentId}/mcp`,
    linksFetcher
  );

  const servers = serversData?.data ?? [];
  const links = linksData?.data ?? [];
  const isLoading = !serversData || !linksData;

  const linkedServerIds = new Set(links.map((l) => l.mcpServerId));

  async function handleToggleServer(serverId: string, isLinked: boolean): Promise<void> {
    try {
      if (isLinked) {
        const res = await fetch(`/api/agents/${agentId}/mcp`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mcpServerId: serverId }),
        });
        const json = await res.json();
        if (!json.success) {
          toast.error(json.error || "Failed to unlink server");
          return;
        }
        toast.success("Server unlinked");
      } else {
        const res = await fetch(`/api/agents/${agentId}/mcp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mcpServerId: serverId }),
        });
        const json = await res.json();
        if (!json.success) {
          toast.error(json.error || "Failed to link server");
          return;
        }
        toast.success("Server linked");
      }
      mutateLinks();
    } catch {
      toast.error("Failed to update server link");
    }
  }

  async function handleToolFilter(
    serverId: string,
    enabledTools: string[] | null
  ): Promise<void> {
    const link = links.find((l) => l.mcpServerId === serverId);
    if (!link) return;

    try {
      await fetch(`/api/agents/${agentId}/mcp`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mcpServerId: serverId }),
      });

      await fetch(`/api/agents/${agentId}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mcpServerId: serverId,
          enabledTools: enabledTools && enabledTools.length > 0 ? enabledTools : undefined,
        }),
      });

      mutateLinks();
    } catch {
      toast.error("Failed to update tool filter");
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (servers.length === 0) {
    return (
      <div className="flex flex-col items-center py-6 text-center">
        <Plug className="size-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">
          No MCP servers configured.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Add servers in MCP Settings from the dashboard.
        </p>
      </div>
    );
  }

  const activeToolCount = links.reduce((sum, link) => {
    if (link.enabledTools) return sum + link.enabledTools.length;
    const cache = link.mcpServer.toolsCache;
    return sum + (cache?.length ?? 0);
  }, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plug className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">MCP Servers</span>
        </div>
        {activeToolCount > 0 && (
          <Badge className="bg-muted/20 text-foreground/70">
            {activeToolCount} tool{activeToolCount !== 1 ? "s" : ""} active
          </Badge>
        )}
      </div>

      <div className="space-y-2">
        {servers.map((server) => {
          const isLinked = linkedServerIds.has(server.id);
          const link = links.find((l) => l.mcpServerId === server.id);
          return (
            <ServerToggleItem
              key={server.id}
              server={server}
              isLinked={isLinked}
              link={link ?? null}
              onToggle={() => handleToggleServer(server.id, isLinked)}
              onToolFilter={(tools) => handleToolFilter(server.id, tools)}
            />
          );
        })}
      </div>
    </div>
  );
}

interface ServerToggleItemProps {
  server: MCPServer;
  isLinked: boolean;
  link: AgentMCPLink | null;
  onToggle: () => void;
  onToolFilter: (tools: string[] | null) => void;
}

function ServerToggleItem({
  server,
  isLinked,
  link,
  onToggle,
  onToolFilter,
}: ServerToggleItemProps): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);
  const toolsCache = server.toolsCache ?? [];
  const enabledTools = link?.enabledTools ?? null;
  const hasToolFilter = enabledTools !== null && enabledTools.length > 0;

  function handleToolToggle(toolName: string): void {
    const current = enabledTools ?? [...toolsCache];
    const isEnabled = current.includes(toolName);
    const updated = isEnabled
      ? current.filter((t) => t !== toolName)
      : [...current, toolName];

    if (updated.length === toolsCache.length) {
      onToolFilter(null);
    } else {
      onToolFilter(updated);
    }
  }

  return (
    <div className="rounded-md border">
      <div className="flex items-center gap-2 p-2">
        <input
          type="checkbox"
          checked={isLinked}
          onChange={onToggle}
          className="size-4 rounded border-border accent-primary"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm truncate">{server.name}</span>
            {!server.enabled && (
              <Badge variant="secondary" className="text-[10px]">
                Disabled
              </Badge>
            )}
          </div>
        </div>
        {isLinked && toolsCache.length > 0 && (
          <>
            <Badge variant="outline" className="text-[10px] shrink-0">
              {hasToolFilter ? enabledTools.length : toolsCache.length} tool
              {(hasToolFilter ? enabledTools.length : toolsCache.length) !== 1 ? "s" : ""}
            </Badge>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
            </Button>
          </>
        )}
      </div>

      {isLinked && isExpanded && toolsCache.length > 0 && (
        <div className="border-t px-2 py-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Tool Filter
            </span>
            {hasToolFilter && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-[10px]"
                onClick={() => onToolFilter(null)}
              >
                <X className="mr-0.5 size-2.5" />
                Reset
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {toolsCache.map((tool) => {
              const isEnabled = enabledTools
                ? enabledTools.includes(tool)
                : true;
              return (
                <button
                  key={tool}
                  onClick={() => handleToolToggle(tool)}
                  className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                    isEnabled
                      ? "bg-muted/20 text-foreground/70"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {tool}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
