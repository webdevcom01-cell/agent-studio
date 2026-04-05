"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Compass,
  Terminal,
  Layers,
  Zap,
  BarChart3,
  Settings,
  Shield,
  FlaskConical,
  Webhook,
  Search,
  Bot,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CommandItem {
  id: string;
  label: string;
  href: string;
  section: string;
  icon: LucideIcon;
}

const NAV_COMMANDS: CommandItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/", section: "Pages", icon: LayoutDashboard },
  { id: "discover", label: "Discover", href: "/discover", section: "Pages", icon: Compass },
  { id: "evals", label: "Evals", href: "/evals", section: "Pages", icon: FlaskConical },
  { id: "cli-generator", label: "CLI Generator", href: "/cli-generator", section: "Pages", icon: Terminal },
  { id: "templates", label: "Templates", href: "/templates", section: "Pages", icon: Layers },
  { id: "skills", label: "Skills", href: "/skills", section: "Pages", icon: Zap },
  { id: "webhooks", label: "Webhooks", href: "/webhooks", section: "Pages", icon: Webhook },
  { id: "analytics", label: "Analytics", href: "/analytics", section: "Pages", icon: BarChart3 },
  { id: "settings", label: "Settings", href: "/settings", section: "Pages", icon: Settings },
  { id: "admin", label: "Admin", href: "/admin", section: "Pages", icon: Shield },
];

interface AgentItem {
  id: string;
  name: string;
}

function toCommandItem(agent: AgentItem): CommandItem {
  return {
    id: `agent-${agent.id}`,
    label: agent.name,
    href: `/builder/${agent.id}`,
    section: "Agents",
    icon: Bot,
  };
}

function groupItems(items: CommandItem[]): Record<string, CommandItem[]> {
  return items.reduce<Record<string, CommandItem[]>>((acc, item) => {
    if (!acc[item.section]) acc[item.section] = [];
    acc[item.section].push(item);
    return acc;
  }, {});
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps): React.ReactElement | null {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [agents, setAgents] = useState<AgentItem[]>([]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/agents")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setAgents(json.data as AgentItem[]);
      })
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const allItems: CommandItem[] = [
    ...agents.map(toCommandItem),
    ...NAV_COMMANDS,
  ];

  const filtered = query.trim()
    ? allItems.filter((item) =>
        item.label.toLowerCase().includes(query.toLowerCase())
      )
    : allItems;

  const flat = Object.values(groupItems(filtered)).flat();

  const handleSelect = useCallback(
    (item: CommandItem) => {
      onClose();
      router.push(item.href);
    },
    [onClose, router]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, flat.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      } else if (e.key === "Enter" && flat[selected]) {
        handleSelect(flat[selected]);
      }
    },
    [flat, selected, handleSelect]
  );

  if (!open) return null;

  const grouped = groupItems(filtered);
  let flatIdx = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm pt-28"
      onClick={onClose}
    >
      <div
        className="w-[520px] overflow-hidden rounded-xl border border-white/[0.06] bg-[#111] shadow-[0_25px_60px_rgba(0,0,0,0.7)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
          <Search size={15} className="shrink-0 text-muted-foreground/30" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search agents, pages, actions..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none"
          />
          <kbd className="rounded border border-border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground/40">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[360px] overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground/30">
              No results for &quot;{query}&quot;
            </p>
          ) : (
            Object.entries(grouped).map(([section, items]) => (
              <div key={section}>
                <p className="px-4 pb-1 pt-3 text-[10px] font-medium uppercase tracking-widest text-foreground/[0.12]">
                  {section}
                </p>
                {items.map((item) => {
                  const idx = flatIdx++;
                  const isActive = idx === selected;
                  const Icon = item.icon;

                  return (
                    <button
                      key={item.id}
                      onMouseEnter={() => setSelected(idx)}
                      onClick={() => handleSelect(item)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-2 text-left transition-colors duration-75",
                        isActive ? "bg-white/[0.04]" : "bg-transparent"
                      )}
                    >
                      <span className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-[11px] transition-colors duration-75",
                        isActive
                          ? "border-border bg-card text-muted-foreground"
                          : "border-white/[0.04] bg-white/[0.02] text-muted-foreground/30"
                      )}>
                        <Icon size={12} />
                      </span>
                      <span className={cn(
                        "text-sm tracking-tight transition-colors duration-75",
                        isActive
                          ? "font-medium text-foreground"
                          : "text-muted-foreground"
                      )}>
                        {item.label}
                      </span>
                      {isActive && (
                        <kbd className="ml-auto rounded border border-border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground/40">
                          ↵
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 border-t border-white/[0.04] px-4 py-2">
          {(
            [
              ["↑↓", "navigate"],
              ["↵", "open"],
              ["esc", "close"],
            ] as [string, string][]
          ).map(([key, desc]) => (
            <div key={key} className="flex items-center gap-1.5">
              <kbd className="rounded border border-border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground/40">
                {key}
              </kbd>
              <span className="text-[11px] text-foreground/20">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
