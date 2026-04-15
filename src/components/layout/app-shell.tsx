"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { CommandPalette } from "./command-palette";

const SIDEBAR_EXCLUDED_PATHS = ["/login", "/onboarding", "/embed"];

function isSidebarExcluded(pathname: string): boolean {
  return SIDEBAR_EXCLUDED_PATHS.some((path) => pathname.startsWith(path));
}

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps): React.ReactElement {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  const openCmd = useCallback(() => setCmdOpen(true), []);
  const closeCmd = useCallback(() => setCmdOpen(false), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (isSidebarExcluded(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        onOpenCommand={openCmd}
      />
      <main className="flex flex-1 flex-col overflow-hidden">
        {children}
      </main>
      <CommandPalette open={cmdOpen} onClose={closeCmd} />
    </div>
  );
}
