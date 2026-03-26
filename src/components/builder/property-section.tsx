"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PropertySectionProps {
  title: string;
  icon?: React.ReactNode;
  /** Default collapsed state — true means open, false means closed */
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * Collapsible section for the property panel.
 * Follows ARIA accordion pattern (aria-expanded + aria-controls).
 */
export function PropertySection({
  title,
  icon,
  defaultOpen = true,
  children,
  className,
}: PropertySectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  // Stable IDs derived from title — safe because panel only has one instance
  const slug = title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const headingId = `ps-heading-${slug}`;
  const panelId = `ps-panel-${slug}`;

  return (
    <div className={cn("rounded-md border border-border/50", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        id={headingId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-accent/40 transition-colors rounded-md"
      >
        {open ? (
          <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
        )}
        {icon && <span aria-hidden="true">{icon}</span>}
        <span>{title}</span>
      </button>

      {open && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={headingId}
          className="px-3 pb-3 pt-1 space-y-3"
        >
          {children}
        </div>
      )}
    </div>
  );
}
