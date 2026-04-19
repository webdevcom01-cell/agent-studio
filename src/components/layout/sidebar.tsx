"use client";

import { useCallback, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { useSession, signOut } from "next-auth/react";
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
  Brain,
  ChevronRight,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  icon: React.ElementType;
  label: string;
  href: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Main",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", href: "/" },
      { icon: Compass, label: "Discover", href: "/discover" },
      { icon: FlaskConical, label: "Evals", href: "/evals" },
    ],
  },
  {
    label: "Tools",
    items: [
      { icon: Terminal, label: "CLI Generator", href: "/cli-generator" },
      { icon: Layers, label: "Templates", href: "/templates" },
      { icon: Zap, label: "Skills", href: "/skills" },
      { icon: Brain, label: "Learning", href: "/ecc" },
      { icon: Webhook, label: "Webhooks", href: "/webhooks" },
    ],
  },
  {
    label: "System",
    items: [
      { icon: BarChart3, label: "Analytics", href: "/analytics" },
      { icon: Settings, label: "Settings", href: "/settings" },
      { icon: Shield, label: "Admin", href: "/admin" },
    ],
  },
];

const SIDEBAR_WIDTH_EXPANDED = 224;
const SIDEBAR_WIDTH_COLLAPSED = 56;

interface SidebarProps {
  collapsed: boolean;
  onCollapsedChange: (value: boolean) => void;
  onOpenCommand: () => void;
}

interface NavItemButtonProps {
  item: NavItem;
  collapsed: boolean;
  isActive: boolean;
}

function NavItemButton({ item, collapsed, isActive }: NavItemButtonProps): React.ReactElement {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={cn(
        "relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors duration-100",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        collapsed && "justify-center px-0",
        isActive
          ? "bg-white/5 text-foreground font-medium"
          : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground"
      )}
    >
      <Icon size={15} className="shrink-0" />
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.15, ease: "easeInOut" }}
            className="overflow-hidden whitespace-nowrap"
          >
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>
      {isActive && (
        <motion.div
          layoutId="nav-indicator"
          className="absolute left-0 top-1/2 -translate-y-1/2 h-3.5 w-[2px] rounded-full bg-foreground/40"
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
        />
      )}
    </Link>
  );
}

export function Sidebar({ collapsed, onCollapsedChange, onOpenCommand }: SidebarProps): React.ReactElement {
  const pathname = usePathname();
  const { data: session } = useSession();

  const toggleCollapse = useCallback(() => {
    onCollapsedChange(!collapsed);
  }, [collapsed, onCollapsedChange]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        toggleCollapse();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleCollapse]);

  const isActive = (href: string): boolean => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const userInitial = session?.user?.name?.[0]?.toUpperCase() ?? "U";
  const userName = session?.user?.name ?? "User";

  return (
    <motion.aside
      animate={{ width: collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED }}
      initial={false}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      className="relative flex h-screen shrink-0 flex-col border-r border-border bg-background overflow-hidden"
    >
      {/* Logo */}
      <div
        className={cn(
          "flex h-[52px] shrink-0 items-center border-b border-border",
          collapsed ? "justify-center px-0" : "gap-2.5 px-3"
        )}
      >
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-card">
          <ChevronRight size={12} className="text-muted-foreground" />
        </div>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.15, ease: "easeInOut" }}
              className="overflow-hidden whitespace-nowrap text-sm font-medium tracking-tight text-foreground"
            >
              Agent Studio
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Search / Command trigger */}
      <div className="shrink-0 border-b border-border px-2 py-2">
        <button
          onClick={onOpenCommand}
          className={cn(
            "flex w-full items-center rounded-md border border-border bg-card/50 px-2 py-1.5 text-sm text-muted-foreground/40 transition-colors hover:text-muted-foreground",
            collapsed ? "justify-center" : "gap-2"
          )}
        >
          <Search size={13} className="shrink-0" />
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.15, ease: "easeInOut" }}
                className="flex flex-1 items-center justify-between overflow-hidden whitespace-nowrap"
              >
                <span className="text-xs">Search...</span>
                <kbd className="rounded border border-border bg-background px-1 py-0.5 text-[10px]">
                  ⌘K
                </kbd>
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* Nav sections */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden px-2 py-2">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-1">
            <AnimatePresence initial={false}>
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.15 }}
                  className="px-2.5 pb-1 pt-2.5"
                >
                  <span className="text-[10px] font-medium uppercase tracking-widest text-foreground/20">
                    {section.label}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
            {collapsed && <div className="h-2" />}
            <div className="flex flex-col gap-px">
              {section.items.map((item) => (
                <NavItemButton
                  key={item.href}
                  item={item}
                  collapsed={collapsed}
                  isActive={isActive(item.href)}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom: user + collapse toggle */}
      <div className={cn(
        "flex shrink-0 flex-col gap-1 border-t border-border p-2",
      )}>
        {/* User row */}
        <div className={cn(
          "flex items-center rounded-md px-2 py-1.5 text-sm",
          collapsed ? "justify-center" : "gap-2.5"
        )}>
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-card text-[10px] font-medium text-muted-foreground">
            {userInitial}
          </div>
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.15 }}
                className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden"
              >
                <span className="truncate text-xs text-muted-foreground">{userName}</span>
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground/40 transition-colors hover:text-muted-foreground"
                  title="Sign out"
                >
                  <LogOut size={12} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={toggleCollapse}
          title={collapsed ? "Expand sidebar (⌘B)" : "Collapse sidebar (⌘B)"}
          className={cn(
            "flex items-center rounded-md px-2 py-1.5 text-xs text-muted-foreground/40 transition-colors hover:text-muted-foreground",
            collapsed ? "justify-center" : "gap-2"
          )}
        >
          {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden whitespace-nowrap"
              >
                Collapse
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.aside>
  );
}
