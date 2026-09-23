"use client";

import { useEffect, useState } from "react";
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
  Activity,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@prisma/client";
import { TopBar } from "./top-bar";

type NavGroup = "top" | "marketing" | "transactional" | "system";
type NavItem = {
  href: string;
  label: string;
  group: NavGroup;
  icon: React.ComponentType<{ className?: string }>;
  badgeKey?: keyof NavCounts;
};

export type NavCounts = {
  campaigns: number;
  campaignsSending: number;
  contacts: number;
  lists: number;
  segments: number;
  templates: number;
  transactionalTemplates: number;
  eventRules: number;
  deliveryLogs: number;
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", group: "top", icon: LayoutDashboard },

  { href: "/marketing/campaigns", label: "Campaigns", group: "marketing", icon: Megaphone, badgeKey: "campaignsSending" },
  { href: "/marketing/contacts", label: "Contacts", group: "marketing", icon: Users, badgeKey: "contacts" },
  { href: "/marketing/segments", label: "Segments", group: "marketing", icon: Filter, badgeKey: "segments" },
  { href: "/marketing/templates", label: "Templates", group: "marketing", icon: Palette, badgeKey: "templates" },
  { href: "/marketing/analytics", label: "Analytics", group: "marketing", icon: BarChart3 },

  { href: "/transactional/realtime", label: "Real time", group: "transactional", icon: Activity },
  { href: "/transactional/templates", label: "Templates", group: "transactional", icon: Mail, badgeKey: "transactionalTemplates" },
  { href: "/transactional/events", label: "Events", group: "transactional", icon: Zap, badgeKey: "eventRules" },
  { href: "/transactional/logs", label: "Delivery Logs", group: "transactional", icon: ScrollText },
  { href: "/transactional/analytics", label: "Analytics", group: "transactional", icon: BarChart3 },

  { href: "/settings", label: "Settings", group: "system", icon: Settings },
];

const GROUP_LABEL: Record<NavGroup, string> = {
  top: "",
  marketing: "Marketing",
  transactional: "Transactional",
  system: "System",
};

const COLLAPSE_KEY = "abt-mailer:sidebar-collapse";

function formatBadge(n: number): string {
  if (n === 0) return "";
  if (n < 1000) return n.toString();
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.floor(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function AppShell({
  user,
  counts,
  children,
}: {
  user: { name?: string | null; email?: string | null; role: Role };
  counts: NavCounts;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const groupsInOrder: NavGroup[] = ["top", "marketing", "transactional", "system"];

  // Per-group collapsed state, persisted in localStorage.
  const [collapsed, setCollapsed] = useState<Record<NavGroup, boolean>>({
    top: false,
    marketing: false,
    transactional: false,
    system: false,
  });
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COLLAPSE_KEY);
      if (raw) setCollapsed((c) => ({ ...c, ...JSON.parse(raw) }));
    } catch {
      /* private-mode / disabled storage */
    }
  }, []);
  const toggle = (g: NavGroup) => {
    setCollapsed((c) => {
      const next = { ...c, [g]: !c[g] };
      try {
        window.localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
      } catch {
        /* noop */
      }
      return next;
    });
  };

  const initials =
    (user.name ?? user.email ?? "?")
      .split(/\s+|@/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Ambient background bubbles */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-emerald-200/20 blur-3xl dark:bg-emerald-900/10" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[400px] translate-x-1/4 translate-y-1/4 rounded-full bg-teal-200/20 blur-3xl dark:bg-teal-900/10" />
      </div>
      <aside className="relative z-10 hidden w-72 shrink-0 flex-col border-r border-border/60 bg-white/90 backdrop-blur-sm dark:bg-slate-900/60 md:flex">
        {/* Brand */}
        <div className="flex items-center gap-3.5 px-6 py-6">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-base font-bold text-white shadow-lg shadow-emerald-500/25">
            AB
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">ABTalks</div>
            <div className="-mt-0.5 text-base font-bold">Mailer</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-6 px-4 pb-6">
          {groupsInOrder.map((g) => {
            const items = NAV.filter((n) => n.group === g);
            if (items.length === 0) return null;
            const isCollapsed = collapsed[g];
            const groupLabel = GROUP_LABEL[g];
            return (
              <div key={g}>
                {groupLabel ? (
                  <button
                    type="button"
                    onClick={() => toggle(g)}
                    className="mb-2 flex w-full items-center justify-between px-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/80 transition hover:text-foreground"
                  >
                    <span>{groupLabel}</span>
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform duration-200",
                        isCollapsed && "-rotate-90",
                      )}
                    />
                  </button>
                ) : null}
                <ul
                  className={cn(
                    "space-y-1.5 overflow-hidden transition-all duration-200",
                    isCollapsed ? "max-h-0 opacity-0" : "max-h-[500px] opacity-100",
                  )}
                  aria-hidden={isCollapsed}
                >
                  {items.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    const Icon = item.icon;
                    const badgeValue = item.badgeKey ? counts[item.badgeKey] : 0;
                    const badgeText = formatBadge(badgeValue);
                    return (
                      <li key={item.href} className="relative">
                        {active && (
                          <span
                            aria-hidden
                            className="absolute -left-1 top-1/2 h-8 w-1.5 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-emerald-500 to-teal-600 shadow-[0_0_12px_rgba(16,185,129,0.7)]"
                          />
                        )}
                        <Link
                          href={item.href}
                          className={cn(
                            "group relative flex items-center gap-3.5 rounded-2xl px-3.5 py-3.5 text-[15px] font-semibold transition-all duration-200",
                            active
                              ? "bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30 scale-[1.02]"
                              : "text-foreground/80 hover:translate-x-1 hover:bg-emerald-50/80 hover:text-foreground hover:shadow-sm dark:hover:bg-emerald-950/30",
                          )}
                        >
                          <span
                            className={cn(
                              "grid h-10 w-10 shrink-0 place-items-center rounded-xl transition",
                              active
                                ? "bg-white/20 shadow-inner"
                                : "bg-slate-100 group-hover:bg-emerald-100 group-hover:scale-110 dark:bg-slate-800/60 dark:group-hover:bg-emerald-900/40",
                            )}
                          >
                            <Icon
                              className={cn(
                                "h-5 w-5 transition-all duration-200",
                                active
                                  ? "text-white"
                                  : "text-muted-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-300",
                              )}
                            />
                          </span>
                          <span className="flex-1 truncate">{item.label}</span>
                          {badgeText && (
                            <span
                              className={cn(
                                "min-w-[26px] rounded-full px-2 py-0.5 text-center text-[11px] font-bold tabular-nums transition",
                                active
                                  ? "bg-white/25 text-white shadow-sm"
                                  : "bg-emerald-100 text-emerald-700 group-hover:scale-110 group-hover:bg-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300",
                              )}
                            >
                              {badgeText}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        {/* User pill */}
        <div className="border-t border-border/60 p-4">
          <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-slate-50 to-emerald-50/50 p-3 shadow-sm dark:from-slate-800/40 dark:to-emerald-950/20">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-sm font-bold text-white shadow-lg shadow-emerald-500/30">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold">{user.email}</div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{user.role}</div>
            </div>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="rounded-lg p-2 text-muted-foreground transition hover:bg-white hover:text-rose-500 hover:shadow-sm dark:hover:bg-slate-900"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <TopBar workspace={user.name ?? "ABTalks"} planLabel="Sandbox" />
        <main className="flex-1">
          <div className="container max-w-6xl px-6 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
