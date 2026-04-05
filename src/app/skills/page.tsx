"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Search, Code2, Tag, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface SkillSummary {
  id: string;
  name: string;
  slug: string;
  version: string;
  description: string;
  tags: string[];
  category: string | null;
  language: string | null;
  eccOrigin: boolean;
  compositionLayer: string;
  createdAt: string;
}

interface Facet {
  value: string;
  count: number;
}

interface SkillsResponse {
  success: boolean;
  data: {
    skills: SkillSummary[];
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
    facets: {
      languages: Facet[];
      categories: Facet[];
    };
  };
}

export default function SkillsPage(): React.JSX.Element {
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("");
  const [category, setCategory] = useState("");
  const [languages, setLanguages] = useState<Facet[]>([]);
  const [categories, setCategories] = useState<Facet[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSkills = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (language) params.set("language", language);
      if (category) params.set("category", category);
      params.set("page", String(page));
      params.set("pageSize", "24");

      const res = await fetch(`/api/skills?${params}`);
      if (!res.ok) return;

      const json: SkillsResponse = await res.json();
      if (!json.success) return;

      setSkills(json.data.skills);
      setTotal(json.data.pagination.total);
      setTotalPages(json.data.pagination.totalPages);
      setLanguages(json.data.facets.languages);
      setCategories(json.data.facets.categories);
    } finally {
      setIsLoading(false);
    }
  }, [query, language, category, page]);

  useEffect(() => {
    const timer = setTimeout(fetchSkills, 300);
    return (): void => clearTimeout(timer);
  }, [fetchSkills]);

  function handleFilterLanguage(lang: string): void {
    setLanguage(language === lang ? "" : lang);
    setPage(1);
  }

  function handleFilterCategory(cat: string): void {
    setCategory(category === cat ? "" : cat);
    setPage(1);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-border px-3">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href="/"><ArrowLeft className="size-3.5" /></Link>
        </Button>
        <Code2 className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Skills Browser</span>
        <span className="text-xs text-muted-foreground/40 ml-auto">
          {total} skills
        </span>
      </div>

      {/* Search */}
      <div className="shrink-0 border-b border-border px-4 py-2.5">
        <div className="relative max-w-2xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/40" />
          <Input
            placeholder="Search skills by name, description, or tag…"
            value={query}
            onChange={(e): void => {
              setQuery(e.target.value);
              setPage(1);
            }}
            className="pl-9 h-8 text-sm"
          />
        </div>
      </div>

      {/* Filter sidebar + grid */}
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-52 shrink-0 border-r border-border overflow-y-auto px-3 py-4 space-y-5">
          {languages.length > 0 && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-widest text-foreground/20 mb-2 px-1">
                Language
              </p>
              <div className="space-y-0.5">
                {languages.map((f) => (
                  <button
                    key={f.value}
                    onClick={(): void => handleFilterLanguage(f.value)}
                    className={cn(
                      "w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors",
                      language === f.value
                        ? "bg-foreground/5 text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <Code2 className="size-3.5" />
                      {f.value}
                    </span>
                    <span className="opacity-40">{f.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {categories.length > 0 && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-widest text-foreground/20 mb-2 px-1">
                Category
              </p>
              <div className="space-y-0.5">
                {categories.map((f) => (
                  <button
                    key={f.value}
                    onClick={(): void => handleFilterCategory(f.value)}
                    className={cn(
                      "w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors",
                      category === f.value
                        ? "bg-foreground/5 text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <Tag className="size-3.5" />
                      {f.value}
                    </span>
                    <span className="opacity-40">{f.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(language || category) && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={(): void => {
                setLanguage("");
                setCategory("");
                setPage(1);
              }}
            >
              Clear filters
            </Button>
          )}
        </aside>

        <main className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-40 rounded-lg" />
              ))}
            </div>
          ) : skills.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <BookOpen className="size-10 text-muted-foreground/20 mb-4" />
              <p className="text-sm font-medium text-muted-foreground">No skills found</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Try adjusting your search or filters
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {skills.map((skill) => (
                  <SkillCard key={skill.id} skill={skill} />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-6">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={(): void => setPage(page - 1)}
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={(): void => setPage(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function SkillCard({ skill }: { skill: SkillSummary }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-card p-4 hover:border-border/80 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-sm font-semibold leading-tight">{skill.name}</h3>
        <span className="text-[10px] text-muted-foreground/40 shrink-0 ml-2 font-mono">
          v{skill.version}
        </span>
      </div>

      <p className="text-xs text-muted-foreground/60 line-clamp-2 mb-3">
        {skill.description}
      </p>

      <div className="flex flex-wrap gap-1.5">
        {skill.language && (
          <span className="inline-flex items-center rounded-full border border-border px-1.5 py-px text-[10px] font-medium text-muted-foreground/60">
            {skill.language}
          </span>
        )}
        {skill.category && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {skill.category}
          </Badge>
        )}
        {skill.compositionLayer && skill.compositionLayer !== "execution" && (
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-1.5 py-px text-[10px] font-medium",
              skill.compositionLayer === "guarantee"
                ? "border-destructive/30 text-destructive/60"
                : "border-border text-muted-foreground/60"
            )}
          >
            {skill.compositionLayer}
          </span>
        )}
        {skill.tags.slice(0, 3).map((tag) => (
          <Badge
            key={tag}
            variant="outline"
            className="text-[10px] px-1.5 py-0 text-muted-foreground/40"
          >
            {tag}
          </Badge>
        ))}
        {skill.tags.length > 3 && (
          <span className="text-[10px] text-muted-foreground/40">
            +{skill.tags.length - 3}
          </span>
        )}
      </div>

      {skill.eccOrigin && (
        <div className="mt-3 pt-2 border-t border-border flex items-center gap-1 text-[10px] text-muted-foreground/40">
          <span>ECC</span>
        </div>
      )}
    </div>
  );
}
