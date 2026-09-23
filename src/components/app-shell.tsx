"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Megaphone,
  Users,
  Filter,
  Palette,
  BarChart3,
  Zap,
  Mail,
  ScrollText,
  Settings,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@prisma/client";

type NavItem = {
  href: string;
  label: string;
  group: "top" | "marketing" | "transactional" | "system";
  icon: React.ComponentType<{ className?: string }>;
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", group: "top", icon: LayoutDashboard },

  { href: "/marketing/campaigns", label: "Campaigns", group: "marketing", icon: Megaphone },
  { href: "/marketing/contacts", label: "Contacts", group: "marketing", icon: Users },
  { href: "/marketing/segments", label: "Segments", group: "marketing", icon: Filter },
  { href: "/marketing/templates", label: "Templates", group: "marketing", icon: Palette },
  { href: "/marketing/analytics", label: "Analytics", group: "marketing", icon: BarChart3 },

  { href: "/transactional/templates", label: "Templates", group: "transactional", icon: Mail },
  { href: "/transactional/events", label: "Events", group: "transactional", icon: Zap },
  { href: "/transactional/logs", label: "Delivery Logs", group: "transactional", icon: ScrollText },
  { href: "/transactional/analytics", label: "Analytics", group: "transactional", icon: BarChart3 },

  { href: "/settings", label: "Settings", group: "system", icon: Settings },
];

const GROUP_LABEL: Record<NavItem["group"], string> = {
  top: "",
  marketing: "Marketing",
  transactional: "Transactional",
  system: "System",
};

export function AppShell({
  user,
  children,
}: {
  user: { name?: string | null; email?: string | null; role: Role };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const groupsInOrder: NavItem["group"][] = ["top", "marketing", "transactional", "system"];
  const initials =
    (user.name ?? user.email ?? "?")
      .split(/\s+|@/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border/60 bg-white dark:bg-slate-900/50 md:flex">
        {/* Brand */}
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-semibold text-white shadow-sm">
            AB
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">ABTalks</div>
            <div className="-mt-0.5 text-sm font-semibold">Mailer</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-5 px-3 pb-4">
          {groupsInOrder.map((g) => {
            const items = NAV.filter((n) => n.group === g);
            if (items.length === 0) return null;
            return (
              <div key={g}>
                {GROUP_LABEL[g] && (
                  <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {GROUP_LABEL[g]}
                  </div>
                )}
                <ul className="space-y-0.5">
                  {items.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    const Icon = item.icon;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={cn(
                            "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition",
                            active
                              ? "bg-gradient-to-r from-indigo-500 to-violet-600 font-medium text-white shadow-sm"
                              : "text-foreground/75 hover:bg-slate-100 hover:text-foreground dark:hover:bg-slate-800/50",
                          )}
                        >
                          <Icon
                            className={cn(
                              "h-4 w-4 shrink-0 transition",
                              active ? "text-white" : "text-muted-foreground group-hover:text-foreground",
                            )}
                          />
                          <span>{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        {/* User */}
        <div className="border-t border-border/60 p-3">
          <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/40">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-xs font-semibold text-white">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{user.email}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{user.role}</div>
            </div>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-white hover:text-destructive dark:hover:bg-slate-900"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1">
        <div className="container max-w-6xl py-8">{children}</div>
      </main>
    </div>
  );
}
