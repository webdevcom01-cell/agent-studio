"use client";

import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DESKTOP_APPS } from "@/lib/constants/desktop-apps";
import { cn } from "@/lib/utils";

interface AppSelectorProps {
  selectedApp: string | null;
  onSelect: (appId: string) => void;
}

export function AppSelector({
  selectedApp,
  onSelect,
}: AppSelectorProps): React.JSX.Element {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return DESKTOP_APPS;
    const q = search.toLowerCase();
    return DESKTOP_APPS.filter(
      (app) =>
        app.label.toLowerCase().includes(q) ||
        app.description.toLowerCase().includes(q) ||
        app.id.toLowerCase().includes(q),
    );
  }, [search]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search applications..."
          className="pl-9 text-sm h-8"
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto pr-1">
        {filtered.map((app) => {
          const Icon = app.icon;
          const isSelected = selectedApp === app.id;
          return (
            <button
              key={app.id}
              type="button"
              onClick={() => onSelect(app.id)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-all hover:border-foreground/20",
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card",
              )}
            >
              <Icon className="size-5 text-muted-foreground" />
              <span className="text-xs font-medium truncate w-full">
                {app.label}
              </span>
              <span className="text-[10px] text-muted-foreground line-clamp-1">
                {app.capabilities.length} capabilities
              </span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-3 py-6 text-center text-sm text-muted-foreground">
            No applications found
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Or enter a custom application name below
      </p>
    </div>
  );
}
