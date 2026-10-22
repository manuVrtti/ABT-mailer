"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Activity,
  BarChart3,
  Check,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  DatabaseZap,
  FileText,
  Filter,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Mail,
  Megaphone,
  Menu,
  Monitor,
  Moon,
  Plus,
  ScrollText,
  Search,
  Send,
  Settings,
  Sun,
  Upload,
  UserCog,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@prisma/client";
import { cn } from "@/lib/utils";
import { Avatar, Kbd } from "./ui";
import { DropdownMenu, applyTheme, readTheme, type ThemeChoice } from "./overlay";
import { CommandPalette, type PaletteLink } from "./command-palette";
import type { Permission } from "@/server/access/permission-defs";

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

type NavItem = { href: string; label: string; icon: LucideIcon; live?: keyof NavCounts; needs?: Permission };
type NavSection = { label?: string; items: NavItem[] };

const SECTIONS: NavSection[] = [
  { items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    label: "Marketing",
    items: [
      { href: "/marketing/campaigns", label: "Campaigns", icon: Megaphone, live: "campaignsSending" },
      { href: "/marketing/personal", label: "Personal mails", icon: Send },
      { href: "/marketing/contacts", label: "Contacts", icon: Users },
      { href: "/marketing/segments", label: "Segments", icon: Filter },
      { href: "/marketing/templates", label: "Templates", icon: FileText },
      { href: "/marketing/analytics", label: "Analytics", icon: BarChart3, needs: "analytics.view" },
    ],
  },
  {
    label: "Transactional",
    items: [
      { href: "/transactional/realtime", label: "Real time", icon: Activity, needs: "logs.view" },
      { href: "/transactional/templates", label: "Templates", icon: Mail },
      { href: "/transactional/events", label: "Events", icon: Zap },
      { href: "/transactional/logs", label: "Logs", icon: ScrollText, needs: "logs.view" },
      { href: "/transactional/analytics", label: "Analytics", icon: BarChart3, needs: "analytics.view" },
    ],
  },
];

const CREATE: { label: string; href: string; icon: LucideIcon; needs: Permission }[] = [
  { label: "Campaign", href: "/marketing/campaigns/new", icon: Megaphone, needs: "campaigns.manage" },
  { label: "Personal mails", href: "/marketing/personal/new", icon: Send, needs: "personal.manage" },
  {
    label: "Klymb list",
    href: "/marketing/contacts/lists/klymb/new",
    icon: DatabaseZap,
    needs: "contacts.manage",
  },
  {
    label: "Contact list",
    href: "/marketing/contacts/lists/new",
    icon: ListChecks,
    needs: "contacts.manage",
  },
  { label: "Import contacts", href: "/marketing/contacts/import", icon: Upload, needs: "contacts.manage" },
  { label: "Template", href: "/marketing/templates/new", icon: FileText, needs: "templates.manage" },
];

const PALETTE_LINKS: PaletteLink[] = [
  ...SECTIONS.flatMap((s) =>
    s.items.map((i) => ({
      label: i.label,
      href: i.href,
      icon: i.icon,
      group: s.label ? `Go to · ${s.label}` : "Go to",
    })),
  ),
  { label: "Contact lists", href: "/marketing/contacts/lists", icon: ListChecks, group: "Go to · Marketing" },
  { label: "Settings", href: "/settings", icon: Settings, group: "Go to" },
  {
    label: "Senders",
    href: "/settings/senders",
    icon: Mail,
    group: "Go to · Settings",
    keywords: "domain brand ses",
  },
  {
    label: "Suppressions",
    href: "/settings/suppressions",
    icon: X,
    group: "Go to · Settings",
    keywords: "unsubscribe bounce block",
  },
  {
    label: "Users",
    href: "/settings/users",
    icon: UserCog,
    group: "Go to · Settings",
    keywords: "team members",
  },
  ...CREATE.map((c) => ({
    label: `New ${c.label.toLowerCase()}`,
    href: c.href,
    icon: Plus,
    group: "Create",
    keywords: "add create new",
  })),
];

// Path segment → breadcrumb label. Group-only segments ("marketing") are skipped.
const CRUMB: Record<string, string | null> = {
  dashboard: "Dashboard",
  marketing: null,
  transactional: null,
  campaigns: "Campaigns",
  personal: "Personal mails",
  contacts: "Contacts",
  lists: "Lists",
  klymb: "Klymb list",
  import: "Import",
  imports: "Imports",
  segments: "Segments",
  templates: "Templates",
  analytics: "Analytics",
  conversions: "Conversions",
  realtime: "Real time",
  events: "Events",
  logs: "Logs",
  settings: "Settings",
  senders: "Senders",
  suppressions: "Suppressions",
  users: "Users",
  permissions: "Roles & permissions",
  audit: "Audit log",
  account: "Account",
  new: "New",
  edit: "Edit",
  filter: "Filter",
};

function breadcrumbs(pathname: string): { label: string; href: string }[] {
  const parts = pathname.split("/").filter(Boolean);
  const out: { label: string; href: string }[] = [];
  parts.forEach((p, i) => {
    const href = `/${parts.slice(0, i + 1).join("/")}`;
    const known = CRUMB[p];
    if (known === null) return;
    out.push({ label: known ?? (p.length > 12 ? "Details" : decodeURIComponent(p)), href });
  });
  return out;
}

const SIDEBAR_KEY = "mailer:sidebar";

export function AppShell({
  user,
  counts,
  permissions,
  children,
}: {
  user: { name?: string | null; email?: string | null; role: Role };
  counts: NavCounts;
  /** What this person's role may do; hides nav items and create actions. */
  permissions: Permission[];
  children: React.ReactNode;
}) {
  const can = (p?: Permission) => !p || permissions.includes(p);
  const createItems = CREATE.filter((c) => can(c.needs));
  const navSections = SECTIONS.map((sec) => ({
    ...sec,
    items: sec.items.filter((i) => can(i.needs)),
  })).filter((sec) => sec.items.length > 0);
  const hidden = new Set(
    [...SECTIONS.flatMap((x) => x.items), ...CREATE].filter((i) => !can(i.needs)).map((i) => i.href),
  );
  const paletteLinks = PALETTE_LINKS.filter((l) => !hidden.has(l.href));
  const pathname = usePathname();
  const router = useRouter();
  const [compact, setCompact] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeChoice>("system");

  useEffect(() => {
    setTheme(readTheme());
    try {
      setCompact(localStorage.getItem(SIDEBAR_KEY) === "compact");
    } catch {
      /* storage disabled */
    }
  }, []);
  // Sticky bars on some pages offset themselves by the sidebar width.
  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-w", compact ? "4rem" : "15rem");
  }, [compact]);
  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // "System" follows the OS live.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const toggleCompact = () =>
    setCompact((c) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, c ? "full" : "compact");
      } catch {
        /* noop */
      }
      return !c;
    });
  const chooseTheme = (t: ThemeChoice) => {
    applyTheme(t);
    setTheme(t);
  };

  const crumbs = breadcrumbs(pathname);
  const canCreate = createItems.length > 0;
  const displayName = user.name?.trim() || user.email || "Account";

  const sidebar = (isCompact: boolean) => (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div
        className={cn(
          "flex h-14 shrink-0 items-center gap-2.5 border-b border-border",
          isCompact ? "justify-center px-2" : "px-4",
        )}
      >
        <Link href="/dashboard" className="flex items-center gap-2.5" title="Mailer">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-brand-600 text-white shadow-xs">
            <Mail className="h-4 w-4" strokeWidth={2.25} />
          </span>
          {!isCompact && <span className="text-[15px] font-semibold tracking-tight">Mailer</span>}
        </Link>
      </div>

      {/* Create — not for read-only viewers */}
      {canCreate && (
        <div className={cn("shrink-0 pt-3", isCompact ? "px-2" : "px-3")}>
          <DropdownMenu
            label="Create"
            align="start"
            trigger={
              <span
                className={cn(
                  "flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-brand-600 text-sm font-medium text-white shadow-xs transition-colors hover:bg-brand-700",
                )}
                title="Create"
              >
                <Plus className="h-4 w-4" />
                {!isCompact && "Create"}
              </span>
            }
            items={createItems.map((c) => ({
              label: c.label,
              icon: c.icon,
              onSelect: () => router.push(c.href),
            }))}
          />
        </div>
      )}

      {/* Nav */}
      <nav className={cn("flex-1 space-y-5 overflow-y-auto py-4", isCompact ? "px-2" : "px-3")}>
        {navSections.map((section, si) => (
          <div key={si}>
            {section.label &&
              (isCompact ? (
                <div className="mx-auto mb-2 h-px w-6 bg-border" />
              ) : (
                <div className="mb-1 px-2.5 text-2xs font-medium uppercase tracking-wider text-muted-foreground/80">
                  {section.label}
                </div>
              ))}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const live = item.live ? counts[item.live] : 0;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={isCompact ? item.label : undefined}
                      className={cn(
                        "group relative flex h-8 items-center gap-2.5 rounded-md text-sm transition-colors",
                        isCompact ? "justify-center" : "px-2.5",
                        active
                          ? "bg-brand-50 font-medium text-brand-800 dark:bg-brand-950/60 dark:text-brand-200"
                          : "text-foreground/75 hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <item.icon
                        className={cn(
                          "h-4 w-4 shrink-0",
                          active
                            ? "text-brand-600 dark:text-brand-300"
                            : "text-muted-foreground group-hover:text-foreground",
                        )}
                      />
                      {!isCompact && <span className="flex-1 truncate">{item.label}</span>}
                      {live > 0 &&
                        (isCompact ? (
                          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-brand-500" />
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-1.5 text-2xs font-medium text-brand-800 dark:bg-brand-900 dark:text-brand-100"
                            title={`${live} sending or scheduled`}
                          >
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />
                            {live}
                          </span>
                        ))}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer: settings + account */}
      <div className={cn("shrink-0 space-y-0.5 border-t border-border py-2", isCompact ? "px-2" : "px-3")}>
        <Link
          href="/settings"
          title={isCompact ? "Settings" : undefined}
          className={cn(
            "flex h-8 items-center gap-2.5 rounded-md text-sm transition-colors",
            isCompact ? "justify-center" : "px-2.5",
            pathname.startsWith("/settings")
              ? "bg-brand-50 font-medium text-brand-800 dark:bg-brand-950/60 dark:text-brand-200"
              : "text-foreground/75 hover:bg-muted hover:text-foreground",
          )}
        >
          <Settings className="h-4 w-4 shrink-0 text-muted-foreground" />
          {!isCompact && "Settings"}
        </Link>
        <DropdownMenu
          label="Account"
          align="start"
          side="top"
          trigger={
            <span
              className={cn(
                "flex items-center gap-2.5 rounded-md py-1.5 text-left transition-colors hover:bg-muted",
                isCompact ? "justify-center" : "px-2",
              )}
            >
              <Avatar name={displayName} className="h-7 w-7 text-[11px]" />
              {!isCompact && (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{displayName}</span>
                  <span className="block truncate text-2xs capitalize text-muted-foreground">
                    {user.role.toLowerCase()}
                  </span>
                </span>
              )}
            </span>
          }
          items={[
            {
              label: user.email ?? "Account",
              icon: UserCog,
              onSelect: () => router.push("/settings/account"),
            },
            "separator",
            {
              label: <ThemeLabel name="Light" on={theme === "light"} />,
              icon: Sun,
              onSelect: () => chooseTheme("light"),
            },
            {
              label: <ThemeLabel name="Dark" on={theme === "dark"} />,
              icon: Moon,
              onSelect: () => chooseTheme("dark"),
            },
            {
              label: <ThemeLabel name="System" on={theme === "system"} />,
              icon: Monitor,
              onSelect: () => chooseTheme("system"),
            },
            "separator",
            {
              label: "Sign out",
              icon: LogOut,
              danger: true,
              onSelect: () => signOut({ callbackUrl: "/login" }),
            },
          ]}
        />
        <button
          type="button"
          onClick={toggleCompact}
          className={cn(
            "hidden h-8 w-full items-center gap-2.5 rounded-md text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:flex",
            isCompact ? "justify-center" : "px-2.5",
          )}
          title={isCompact ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCompact ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          {!isCompact && "Collapse"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden border-r border-border bg-background transition-[width] duration-200 md:block",
          compact ? "w-16" : "w-60",
        )}
      >
        {sidebar(compact)}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-slate-950/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 animate-slide-in-right border-r border-border bg-background shadow-pop">
            {sidebar(false)}
          </aside>
        </div>
      )}

      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col transition-[padding] duration-200",
          compact ? "md:pl-16" : "md:pl-60",
        )}
      >
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 lg:px-8">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="-ml-1 rounded-md p-1.5 text-muted-foreground hover:bg-muted md:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm">
            {crumbs.map((c, i) => (
              <span key={c.href} className="flex min-w-0 items-center gap-1">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />}
                {i === crumbs.length - 1 ? (
                  <span className="truncate font-medium">{c.label}</span>
                ) : (
                  <Link href={c.href} className="truncate text-muted-foreground hover:text-foreground">
                    {c.label}
                  </Link>
                )}
              </span>
            ))}
          </nav>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="hidden h-8 w-64 items-center gap-2 rounded-md border border-input bg-background px-2.5 text-sm text-muted-foreground shadow-xs transition-colors hover:bg-muted sm:flex"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="flex-1 text-left">Search…</span>
            <Kbd>Ctrl</Kbd>
            <Kbd>K</Kbd>
          </button>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted sm:hidden"
            aria-label="Search"
          >
            <Search className="h-5 w-5" />
          </button>
        </header>

        <main className="flex-1">
          <div className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} links={paletteLinks} />
    </div>
  );
}

function ThemeLabel({ name, on }: { name: string; on: boolean }) {
  return (
    <span className="flex flex-1 items-center justify-between gap-6">
      {name}
      {on && <Check className="h-3.5 w-3.5 text-brand-600" />}
    </span>
  );
}
