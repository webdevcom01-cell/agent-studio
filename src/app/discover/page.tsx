"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Search, Bot, MessageSquare, Zap, Database,
  Plug, Filter, SortAsc, ChevronDown, Tag, Layers, Star,
  ArrowRightLeft, Sparkles, ExternalLink, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { DiscoverAgent, DiscoverResponse } from "@/app/api/agents/discover/route";

const SORT_OPTIONS = [
  { value: "popular", label: "Most Popular", icon: Star },
  { value: "newest", label: "Newest", icon: Sparkles },
  { value: "name", label: "Name (A–Z)", icon: SortAsc },
  { value: "most_used", label: "Most Called", icon: ArrowRightLeft },
] as const;

const SCOPE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "mine", label: "Mine" },
  { value: "public", label: "Public" },
] as const;

const MODEL_LABELS: Record<string, string> = {
  "deepseek-chat": "DeepSeek",
  "gpt-4o-mini": "GPT-4o Mini",
  "gpt-4o": "GPT-4o",
  "claude-sonnet-4-20250514": "Claude Sonnet",
  "claude-haiku-4-5-20251001": "Claude Haiku",
};

export default function DiscoverPage(): React.ReactElement {
  const router = useRouter();
  const [data, setData] = useState<DiscoverResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [sort, setSort] = useState<string>("popular");
  const [scope, setScope] = useState<string>("all");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchAgents = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedQuery) params.set("q", debouncedQuery);
      if (activeCategory) params.set("category", activeCategory);
      if (activeTags.length > 0) params.set("tags", activeTags.join(","));
      params.set("sort", sort);
      params.set("scope", scope);
      params.set("limit", "60");

      const res = await fetch(`/api/agents/discover?${params}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        toast.error(json.error ?? "Failed to load agents");
      }
    } catch {
      toast.error("Failed to load agent catalog");
    } finally {
      setIsLoading(false);
    }
  }, [debouncedQuery, activeCategory, activeTags, sort, scope]);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const toggleTag = (tag: string): void => {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const clearFilters = (): void => {
    setSearchQuery("");
    setActiveCategory(null);
    setActiveTags([]);
  };

  const currentSort = useMemo(
    () => SORT_OPTIONS.find((s) => s.value === sort) ?? SORT_OPTIONS[0],
    [sort]
  );

  const hasActiveFilters = activeCategory !== null || activeTags.length > 0 || debouncedQuery !== "";

  return (
    <div className="flex h-full flex-col overflow-hidden">

      {/* Page header */}
      <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-border px-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/40" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search agents…"
            className="h-8 pl-9 text-sm"
          />
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          {/* Scope */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                <Filter className="size-3" />
                {SCOPE_OPTIONS.find((s) => s.value === scope)?.label}
                <ChevronDown className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {SCOPE_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => setScope(opt.value)}
                  className={cn(scope === opt.value && "bg-accent")}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Sort */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                <currentSort.icon className="size-3" />
                {currentSort.label}
                <ChevronDown className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {SORT_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => setSort(opt.value)}
                  className={cn(sort === opt.value && "bg-accent")}
                >
                  <opt.icon className="size-3.5" />
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Filter sidebar */}
        <aside className="hidden w-52 shrink-0 flex-col gap-5 overflow-y-auto border-r border-border px-3 py-4 lg:flex">

          {/* Categories */}
          <div>
            <p className="mb-2 px-1 text-[10px] font-medium uppercase tracking-widest text-foreground/20">
              Categories
            </p>
            <div className="flex flex-col gap-px">
              <button
                type="button"
                onClick={() => setActiveCategory(null)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors",
                  !activeCategory
                    ? "bg-white/[0.06] font-medium text-foreground"
                    : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground"
                )}
              >
                <Layers className="size-3.5 shrink-0" />
                <span>All</span>
                {data && (
                  <span className="ml-auto tabular-nums text-muted-foreground/40">
                    {data.total}
                  </span>
                )}
              </button>

              {data?.categories.map((cat) => (
                <button
                  key={cat.name}
                  type="button"
                  onClick={() => setActiveCategory(activeCategory === cat.name ? null : cat.name)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors",
                    activeCategory === cat.name
                      ? "bg-white/[0.06] font-medium text-foreground"
                      : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground"
                  )}
                >
                  <Tag className="size-3.5 shrink-0" />
                  <span className="capitalize">{cat.name}</span>
                  <span className="ml-auto tabular-nums text-muted-foreground/40">
                    {cat.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Popular tags */}
          {data && data.popularTags.length > 0 && (
            <div>
              <p className="mb-2 px-1 text-[10px] font-medium uppercase tracking-widest text-foreground/20">
                Tags
              </p>
              <div className="flex flex-wrap gap-1">
                {data.popularTags.slice(0, 12).map((tag) => (
                  <button
                    key={tag.name}
                    type="button"
                    onClick={() => toggleTag(tag.name)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] transition-colors",
                      activeTags.includes(tag.name)
                        ? "border-border bg-white/[0.08] text-foreground"
                        : "border-transparent text-muted-foreground/40 hover:border-border hover:text-muted-foreground"
                    )}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground/40 transition-colors hover:text-muted-foreground"
            >
              <X className="size-3" />
              Clear filters
            </button>
          )}
        </aside>

        {/* Main content */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">

          {/* Results bar */}
          <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-4">
            <span className="text-xs text-muted-foreground/40">
              {isLoading
                ? "Searching…"
                : `${data?.total ?? 0} agent${(data?.total ?? 0) !== 1 ? "s" : ""}`
              }
            </span>

            {(activeCategory ?? activeTags.length > 0) && (
              <div className="flex items-center gap-1">
                {activeCategory && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-border bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {activeCategory}
                    <button type="button" onClick={() => setActiveCategory(null)}>
                      <X className="size-2.5" />
                    </button>
                  </span>
                )}
                {activeTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {tag}
                    <button type="button" onClick={() => toggleTag(tag)}>
                      <X className="size-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {isLoading ? (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="animate-pulse space-y-3 rounded-lg border border-border bg-card p-4">
                    <div className="h-3.5 w-32 rounded bg-muted" />
                    <div className="h-3 w-48 rounded bg-muted" />
                    <div className="h-3 w-24 rounded bg-muted" />
                    <div className="flex gap-2 pt-1">
                      <div className="h-6 w-14 rounded bg-muted" />
                      <div className="h-6 w-14 rounded bg-muted" />
                    </div>
                  </div>
                ))}
              </div>
            ) : !data || data.agents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="mb-5 rounded-full border border-border p-4">
                  <Bot className="size-5 text-muted-foreground/40" />
                </div>
                <h2 className="mb-1 text-sm font-medium">No agents found</h2>
                <p className="mb-6 max-w-xs text-sm text-muted-foreground">
                  {hasActiveFilters
                    ? "Try adjusting your filters or search query."
                    : "Create your first agent to get started."
                  }
                </p>
                {hasActiveFilters ? (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => router.push("/")}>
                    Go to Dashboard
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {data.agents.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function AgentCard({ agent }: { agent: DiscoverAgent }): React.ReactElement {
  const modelLabel = MODEL_LABELS[agent.model] ?? agent.model;
  const totalUsage = agent.stats.conversationCount + agent.stats.callsReceived;

  return (
    <div className="group flex flex-col rounded-lg border border-border bg-card p-4 transition-colors duration-150 hover:border-border/80 hover:bg-card/80">
      {/* Header */}
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <h3 className="flex-1 truncate text-sm font-medium leading-snug text-foreground">
          {agent.name}
        </h3>
        {agent.isPublic && (
          <span className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground/40">
            Public
          </span>
        )}
      </div>

      {/* Description */}
      {agent.description ? (
        <p className="mb-3 line-clamp-2 flex-1 text-xs leading-relaxed text-muted-foreground">
          {agent.description}
        </p>
      ) : (
        <div className="mb-3 flex-1" />
      )}

      {/* Category + tags */}
      {(agent.category ?? agent.tags.length > 0) && (
        <div className="mb-3 flex flex-wrap gap-1">
          {agent.category && (
            <span className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground/60">
              <Tag className="size-2.5" />
              {agent.category}
            </span>
          )}
          {agent.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-md border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground/40"
            >
              {tag}
            </span>
          ))}
          {agent.tags.length > 2 && (
            <span className="text-[10px] text-muted-foreground/30">
              +{agent.tags.length - 2}
            </span>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="mb-3 flex items-center gap-3 text-[11px] text-muted-foreground/40">
        <span className="flex items-center gap-1">
          <MessageSquare className="size-3" />
          {agent.stats.conversationCount}
        </span>
        {agent.stats.skillCount > 0 && (
          <span className="flex items-center gap-1">
            <Zap className="size-3" />
            {agent.stats.skillCount}
          </span>
        )}
        {agent.stats.hasKnowledgeBase && (
          <span className="flex items-center gap-1">
            <Database className="size-3" />
            KB
          </span>
        )}
        {agent.stats.hasMCPTools && (
          <span className="flex items-center gap-1">
            <Plug className="size-3" />
            MCP
          </span>
        )}
        {totalUsage > 0 && (
          <span className="ml-auto flex items-center gap-1">
            <Star className="size-3" />
            {totalUsage}
          </span>
        )}
      </div>

      {/* Footer: model + owner + actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/30">
            {modelLabel}
          </span>
          {agent.owner && (
            <div className="flex items-center gap-1 min-w-0">
              {agent.owner.image && (
                <Image
                  src={agent.owner.image}
                  alt=""
                  width={12}
                  height={12}
                  className="rounded-full"
                />
              )}
              <span className="truncate text-[10px] text-muted-foreground/30 max-w-[80px]">
                {agent.owner.name ?? "User"}
              </span>
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-1.5">
          <Button size="sm" variant="outline" asChild className="h-7 text-xs font-normal">
            <Link href={`/builder/${agent.id}`}>
              <ExternalLink className="size-3" />
              View
            </Link>
          </Button>
          <Button size="sm" asChild className="h-7 text-xs font-normal">
            <Link href={`/chat/${agent.id}`}>
              <MessageSquare className="size-3" />
              Chat
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
