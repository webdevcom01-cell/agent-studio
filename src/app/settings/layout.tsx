import Link from "next/link";
import { ArrowLeft, Key, User } from "lucide-react";

const NAV_ITEMS = [
  { href: "/settings/api-keys", label: "API Keys", icon: Key },
  { href: "/settings/profile", label: "Profile", icon: User },
] as const;

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Top bar */}
      <header className="flex h-[52px] shrink-0 items-center border-b border-border px-6 gap-4">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Dashboard
        </Link>
        <span className="text-border select-none">/</span>
        <span className="text-sm font-medium">Settings</span>
      </header>

      <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8 flex gap-8">
        {/* Sidebar nav */}
        <nav className="w-48 shrink-0">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-2">
            Account
          </p>
          <ul className="space-y-0.5">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <Icon className="size-4 shrink-0" />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Page content */}
        <main className="flex-1 min-w-0">{children}</main>
      </div>
      </div>
    </div>
  );
}
