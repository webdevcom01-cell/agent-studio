"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Search, Bot, MessageSquare, ArrowLeft, Zap, Database,
  Plug, Filter, SortAsc, ChevronDown, Tag, Layers, Star,
  ArrowRightLeft, Sparkles, ExternalLink,
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
import type { DiscoverAgent, DiscoverResponse } from "@/app/api/agents/discover/route";

const SORT_OPTIONS = [
  { value: "popular", label: "Most Popular", icon: Star },
  { value: "newest", label: "Newest First", icon: Sparkles },
  { value: "name", label: "Name (A-Z)", icon: SortAsc },
  { value: "most_used", label: "Most Called", icon: ArrowRightLeft },
] as const;

const SCOPE_OPTIONS = [
  { value: "all", label: "All Agents" },
  { value: "mine", label: "My Agents" },
  { value: "public", label: "Public Only" },
] as const;

const CATEGORY_META: Record<string, { emoji: string; color: string }> = {
  assistant: { emoji: "💬", color: "bg-blue-500/10 text-blue-400" },
  research: { emoji: "🔍", color: "bg-purple-500/10 text-purple-400" },
  writing: { emoji: "✍️", color: "bg-green-500/10 text-green-400" },
  coding: { emoji: "💻", color: "bg-orange-500/10 text-orange-400" },
  design: { emoji: "🎨", color: "bg-pink-500/10 text-pink-400" },
  marketing: { emoji: "📢", color: "bg-yellow-500/10 text-yellow-400" },
  support: { emoji: "🎧", color: "bg-teal-500/10 text-teal-400" },
  data: { emoji: "📊", color: "bg-cyan-500/10 text-cyan-400" },
  education: { emoji: "📚", color: "bg-amber-500/10 text-amber-400" },
  productivity: { emoji: "⚡", color: "bg-indigo-500/10 text-indigo-400" },
  specialized: { emoji: "🔧", color: "bg-gray-500/10 text-gray-400" },
};

const MODEL_LABELS: Record<string, string> = {
  "deepseek-chat": "DeepSeek",
  "gpt-4o-mini": "GPT-4o Mini",
  "gpt-4o": "GPT-4o",
  "claude-sonnet-4-20250514": "Claude Sonnet",
  "claude-haiku-4-5-20251001": "Claude Haiku",
};

export default function DiscoverPage() {
  const router = useRouter();
  const [data, setData] = useState<DiscoverResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [sort, setSort] = useState<string>("popular");
  const [scope, setScope] = useState<string>("all");

  // Debounce search
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
        toast.error(json.error || "Failed to load agents");
      }
    } catch {
      toast.error("Failed to load agent catalog");
    } finally {
      setIsLoading(false);
    }
  }, [debouncedQuery, activeCategory, activeTags, sort, scope]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const toggleTag = (tag: string) => {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const currentSort = useMemo(
    () => SORT_OPTIONS.find((s) => s.value === sort) ?? SORT_OPTIONS[0],
    [sort]
  );

  const hasActiveFilters = activeCategory || activeTags.length > 0 || debouncedQuery;

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon-sm" asChild>
              <Link href="/">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-sm font-medium tracking-tight">Agent Marketplace</h1>
              <p className="text-xs text-muted-foreground">
                Discover, search, and use agents
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Scope toggle */}
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
                    className={scope === opt.value ? "bg-accent" : ""}
                  >
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Sort toggle */}
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
                    className={sort === opt.value ? "bg-accent" : ""}
                  >
                    <opt.icon className="size-3.5" />
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex gap-8">
          {/* ── Sidebar ──────────────────────────────────────────── */}
          <aside className="hidden lg:block w-56 shrink-0 space-y-6">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search agents..."
                className="pl-9 text-sm h-8"
              />
            </div>

            {/* Categories */}
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Categories
              </h3>
              <div className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => setActiveCategory(null)}
                  className={`w-full flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                    !activeCategory
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  }`}
                >
                  <Layers className="size-3.5" />
                  All Categories
                  {data && (
                    <span className="ml-auto text-[10px] tabular-nums">
                      {data.total}
                    </span>
                  )}
                </button>

                {data?.categories.map((cat) => {
                  const meta = CATEGORY_META[cat.name];
                  return (
                    <button
                      key={cat.name}
                      type="button"
                      onClick={() =>
                        setActiveCategory(
                          activeCategory === cat.name ? null : cat.name
                        )
                      }
                      className={`w-full flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                        activeCategory === cat.name
                          ? "bg-accent text-accent-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                      }`}
                    >
                      <span className="text-sm leading-none">
                        {meta?.emoji ?? "📁"}
                      </span>
                      <span className="capitalize">{cat.name}</span>
                      <span className="ml-auto text-[10px] tabular-nums">
                        {cat.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Popular tags */}
            {data && data.popularTags.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Popular Tags
                </h3>
                <div className="flex flex-wrap gap-1">
                  {data.popularTags.slice(0, 12).map((tag) => (
                    <button
                      key={tag.name}
                      type="button"
                      onClick={() => toggleTag(tag.name)}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                        activeTags.includes(tag.name)
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      <Tag className="size-2.5" />
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Clear filters */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs"
                onClick={() => {
                  setSearchQuery("");
                  setActiveCategory(null);
                  setActiveTags([]);
                }}
              >
                Clear all filters
              </Button>
            )}
          </aside>

          {/* ── Main Content ─────────────────────────────────────── */}
          <main className="flex-1 min-w-0">
            {/* Mobile search */}
            <div className="lg:hidden mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search agents..."
                  className="pl-9 text-sm"
                />
              </div>
            </div>

            {/* Results header */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-muted-foreground">
                {isLoading
                  ? "Searching..."
                  : `${data?.total ?? 0} agent${(data?.total ?? 0) !== 1 ? "s" : ""} found`}
              </p>

              {/* Active filter pills */}
              {(activeCategory || activeTags.length > 0) && (
                <div className="flex items-center gap-1">
                  {activeCategory && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-medium">
                      {CATEGORY_META[activeCategory]?.emoji} {activeCategory}
                      <button
                        type="button"
                        onClick={() => setActiveCategory(null)}
                        className="ml-0.5 hover:text-primary/70"
                      >
                        ×
                      </button>
                    </span>
                  )}
                  {activeTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-medium"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className="ml-0.5 hover:text-primary/70"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Agent grid */}
            {isLoading ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="animate-pulse rounded-lg border border-border bg-card p-5 space-y-3"
                  >
                    <div className="h-4 w-28 rounded bg-muted" />
                    <div className="h-3 w-40 rounded bg-muted" />
                    <div className="h-3 w-20 rounded bg-muted" />
                    <div className="flex gap-2 pt-2">
                      <div className="h-6 w-16 rounded bg-muted" />
                      <div className="h-6 w-16 rounded bg-muted" />
                    </div>
                  </div>
                ))}
              </div>
            ) : !data || data.agents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="rounded-full border border-border p-4 mb-5">
                  <Bot className="size-6 text-muted-foreground" />
                </div>
                <h2 className="text-base font-medium mb-1">No agents found</h2>
                <p className="text-sm text-muted-foreground mb-6 max-w-xs">
                  {hasActiveFilters
                    ? "Try adjusting your filters or search query."
                    : "Create your first agent to get started."}
                </p>
                {hasActiveFilters ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearchQuery("");
                      setActiveCategory(null);
                      setActiveTags([]);
                    }}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => router.push("/")}>
                    Go to Dashboard
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {data.agents.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} />
                ))}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

// ─── Agent Card Component ─────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: DiscoverAgent }) {
  const catMeta = agent.category ? CATEGORY_META[agent.category] : null;
  const modelLabel = MODEL_LABELS[agent.model] ?? agent.model;
  const totalUsage = agent.stats.conversationCount + agent.stats.callsReceived;

  return (
    <div className="group relative flex flex-col rounded-lg border border-border bg-card p-5 transition-all duration-200 hover:border-foreground/20 hover:shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {catMeta && (
            <span className="text-lg leading-none shrink-0">{catMeta.emoji}</span>
          )}
          <h3 className="text-sm font-medium leading-snug text-foreground truncate">
            {agent.name}
          </h3>
        </div>

        {agent.isPublic && (
          <span className="shrink-0 ml-2 inline-flex items-center rounded-full bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-500">
            Public
          </span>
        )}
      </div>

      {/* Description */}
      {agent.description ? (
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-3 flex-1">
          {agent.description}
        </p>
      ) : (
        <div className="flex-1 mb-3" />
      )}

      {/* Category + tags */}
      <div className="flex flex-wrap gap-1 mb-3">
        {agent.category && catMeta && (
          <span
            className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${catMeta.color}`}
          >
            {agent.category}
          </span>
        )}
        {agent.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
          >
            <Tag className="size-2" />
            {tag}
          </span>
        ))}
        {agent.tags.length > 3 && (
          <span className="text-[10px] text-muted-foreground">
            +{agent.tags.length - 3}
          </span>
        )}
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mb-4">
        <span className="flex items-center gap-1" title="Conversations">
          <MessageSquare className="size-3" />
          {agent.stats.conversationCount}
        </span>
        {agent.stats.skillCount > 0 && (
          <span className="flex items-center gap-1" title="Skills">
            <Zap className="size-3" />
            {agent.stats.skillCount}
          </span>
        )}
        {agent.stats.hasKnowledgeBase && (
          <span className="flex items-center gap-1" title="Has Knowledge Base">
            <Database className="size-3" />
            KB
          </span>
        )}
        {agent.stats.hasMCPTools && (
          <span className="flex items-center gap-1" title="Has MCP Tools">
            <Plug className="size-3" />
            MCP
          </span>
        )}
        {totalUsage > 0 && (
          <span className="flex items-center gap-1 ml-auto" title="Total usage">
            <Star className="size-3" />
            {totalUsage}
          </span>
        )}
      </div>

      {/* Model badge */}
      <div className="flex items-center justify-between mb-3">
        <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {modelLabel}
        </span>
        {agent.owner && (
          <div className="flex items-center gap-1.5">
            {agent.owner.image && (
              <Image
                src={agent.owner.image}
                alt=""
                width={14}
                height={14}
                className="rounded-full"
              />
            )}
            <span className="text-[10px] text-muted-foreground truncate max-w-20">
              {agent.owner.name ?? "User"}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-1.5">
        <Button size="sm" variant="outline" asChild className="flex-1 h-7 text-xs font-normal">
          <Link href={`/builder/${agent.id}`}>
            <ExternalLink className="size-3 mr-1" />
            View
          </Link>
        </Button>
        <Button size="sm" asChild className="flex-1 h-7 text-xs font-normal">
          <Link href={`/chat/${agent.id}`}>
            <MessageSquare className="size-3 mr-1" />
            Chat
          </Link>
        </Button>
      </div>
    </div>
  );
}
