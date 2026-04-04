"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Search, Code2, Tag, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

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

const LANGUAGE_COLORS: Record<string, string> = {
  typescript: "bg-blue-500/10 text-blue-400",
  javascript: "bg-yellow-500/10 text-yellow-400",
  python: "bg-green-500/10 text-green-400",
  go: "bg-cyan-500/10 text-cyan-400",
  rust: "bg-orange-500/10 text-orange-400",
  java: "bg-red-500/10 text-red-400",
  swift: "bg-pink-500/10 text-pink-400",
  cpp: "bg-purple-500/10 text-purple-400",
};

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
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Skills Browser</h1>
              <p className="text-sm text-muted-foreground">
                {total} skills from everything-claude-code
              </p>
            </div>
          </div>
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search skills by name, description, or tag..."
            value={query}
            onChange={(e): void => {
              setQuery(e.target.value);
              setPage(1);
            }}
            className="pl-10"
          />
        </div>

        <div className="flex gap-6">
          <aside className="w-56 shrink-0 space-y-6">
            {languages.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Language
                </h3>
                <div className="space-y-1">
                  {languages.map((f) => (
                    <button
                      key={f.value}
                      onClick={(): void => handleFilterLanguage(f.value)}
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-sm transition-colors ${
                        language === f.value
                          ? "bg-fuchsia-500/10 text-fuchsia-400"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Code2 className="h-3.5 w-3.5" />
                        {f.value}
                      </span>
                      <span className="text-xs opacity-60">{f.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {categories.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Category
                </h3>
                <div className="space-y-1">
                  {categories.map((f) => (
                    <button
                      key={f.value}
                      onClick={(): void => handleFilterCategory(f.value)}
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-sm transition-colors ${
                        category === f.value
                          ? "bg-fuchsia-500/10 text-fuchsia-400"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Tag className="h-3.5 w-3.5" />
                        {f.value}
                      </span>
                      <span className="text-xs opacity-60">{f.count}</span>
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

          <main className="flex-1 min-w-0">
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-40 rounded-lg" />
                ))}
              </div>
            ) : skills.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground">
                <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-40" />
                <p className="text-lg font-medium">No skills found</p>
                <p className="text-sm mt-1">Try adjusting your search or filters</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {skills.map((skill) => (
                    <SkillCard key={skill.id} skill={skill} />
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-8">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={(): void => setPage(page - 1)}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {page} of {totalPages}
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
    </div>
  );
}

function SkillCard({ skill }: { skill: SkillSummary }): React.JSX.Element {
  const langColor = skill.language
    ? LANGUAGE_COLORS[skill.language] ?? "bg-gray-500/10 text-gray-400"
    : null;

  return (
    <div className="border rounded-lg p-4 hover:border-fuchsia-500/30 transition-colors bg-card">
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-semibold text-sm leading-tight">{skill.name}</h3>
        <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
          v{skill.version}
        </span>
      </div>

      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
        {skill.description}
      </p>

      <div className="flex flex-wrap gap-1.5">
        {skill.language && langColor && (
          <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${langColor}`}>
            {skill.language}
          </Badge>
        )}
        {skill.category && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {skill.category}
          </Badge>
        )}
        {skill.compositionLayer && skill.compositionLayer !== "execution" && (
          <Badge
            variant="secondary"
            className={`text-[10px] px-1.5 py-0 ${
              skill.compositionLayer === "guarantee"
                ? "bg-red-900/40 text-red-300 border-red-800"
                : "bg-sky-900/40 text-sky-300 border-sky-800"
            }`}
          >
            {skill.compositionLayer}
          </Badge>
        )}
        {skill.tags.slice(0, 3).map((tag) => (
          <Badge
            key={tag}
            variant="outline"
            className="text-[10px] px-1.5 py-0 text-muted-foreground"
          >
            {tag}
          </Badge>
        ))}
        {skill.tags.length > 3 && (
          <span className="text-[10px] text-muted-foreground">
            +{skill.tags.length - 3}
          </span>
        )}
      </div>

      {skill.eccOrigin && (
        <div className="mt-3 pt-2 border-t flex items-center gap-1 text-[10px] text-fuchsia-400">
          <span>ECC</span>
        </div>
      )}
    </div>
  );
}
