"use client";

import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  emoji: string;
  color: string;
  vibe: string;
  systemPrompt: string;
  tags?: string[];
}

const COLOR_CLASSES: Record<string, string> = {
  blue:   "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  green:  "bg-green-500/10 text-green-600 dark:text-green-400",
  red:    "bg-red-500/10 text-red-600 dark:text-red-400",
  yellow: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  purple: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  orange: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  amber:  "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  pink:   "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  teal:   "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  cyan:   "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  gray:   "bg-gray-500/10 text-gray-600 dark:text-gray-400",
  // Extended colors for new categories
  indigo:  "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  slate:   "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  lime:    "bg-lime-500/10 text-lime-600 dark:text-lime-400",
  sky:     "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  violet:  "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  rose:    "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  fuchsia: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400",
};

const CATEGORY_LABELS: Record<string, string> = {
  // Original template categories
  design:             "Design",
  engineering:        "Engineering",
  "game-development": "Game Dev",
  marketing:          "Marketing",
  "paid-media":       "Paid Media",
  product:            "Product",
  "project-management": "Project Mgmt",
  "spatial-computing": "Spatial",
  specialized:        "Specialized",
  support:            "Support",
  testing:            "Testing",
  // Previously marketplace-only categories
  assistant:          "Assistant",
  research:           "Research",
  writing:            "Writing",
  coding:             "Coding",
  data:               "Data",
  education:          "Education",
  productivity:       "Productivity",
  "desktop-automation": "Desktop Auto",
  "developer-agents":  "Dev Agents",
  // 2026 business verticals
  finance:            "Finance",
  hr:                 "HR & Recruiting",
  sales:              "Sales & CRM",
};

interface TemplateGalleryProps {
  templates: AgentTemplate[];
  categories: string[];
  onSelect: (template: AgentTemplate) => void;
}

export function TemplateGallery({
  templates,
  categories,
  onSelect,
}: TemplateGalleryProps): React.JSX.Element {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let result = templates;

    if (activeCategory) {
      result = result.filter((t) => t.category === activeCategory);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.vibe.toLowerCase().includes(q) ||
          t.tags?.some((tag) => tag.toLowerCase().includes(q))
      );
    }

    return result;
  }, [templates, activeCategory, search]);

  return (
    <div className="flex flex-col gap-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates..."
          className="pl-9 text-sm h-8"
        />
      </div>

      {/* Category filters */}
      <div className="flex flex-wrap gap-1">
        <Button
          variant={activeCategory === null ? "default" : "ghost"}
          size="sm"
          className="h-6 px-2.5 text-xs"
          onClick={() => setActiveCategory(null)}
        >
          All
        </Button>
        {categories.map((cat) => (
          <Button
            key={cat}
            variant={activeCategory === cat ? "default" : "ghost"}
            size="sm"
            className="h-6 px-2.5 text-xs"
            onClick={() => setActiveCategory(cat)}
          >
            {CATEGORY_LABELS[cat] ?? cat}
          </Button>
        ))}
      </div>

      {/* Results count */}
      <p className="text-xs text-muted-foreground">
        {filtered.length} template{filtered.length !== 1 ? "s" : ""}
      </p>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[400px] overflow-y-auto pr-1">
        {filtered.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => onSelect(template)}
            className="group flex flex-col items-start rounded-lg border border-border bg-card p-3 text-left transition-all hover:border-foreground/20 hover:shadow-sm"
          >
            {/* Header */}
            <div className="flex items-center gap-2 mb-1.5 w-full">
              <span className="text-lg leading-none">{template.emoji}</span>
              <span className="text-sm font-medium text-foreground truncate flex-1">
                {template.name}
              </span>
            </div>

            {/* Category badge */}
            <div className="flex items-center gap-1 mb-2">
              <span
                className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full ${COLOR_CLASSES[template.color] ?? COLOR_CLASSES.gray}`}
              >
                {CATEGORY_LABELS[template.category] ?? template.category}
              </span>
              {template.category === "desktop-automation" && (
                <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  CLI Required
                </span>
              )}
            </div>

            {/* Vibe / description */}
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {template.vibe || template.description}
            </p>
          </button>
        ))}

        {filtered.length === 0 && (
          <div className="col-span-2 py-8 text-center text-sm text-muted-foreground">
            No templates found
          </div>
        )}
      </div>
    </div>
  );
}
