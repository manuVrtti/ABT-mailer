"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import type { Role } from "@prisma/client";

type NavItem = { href: string; label: string; group: "top" | "marketing" | "transactional" | "system" };

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", group: "top" },

  { href: "/marketing/campaigns", label: "Campaigns", group: "marketing" },
  { href: "/marketing/contacts", label: "Contacts", group: "marketing" },
  { href: "/marketing/segments", label: "Segments", group: "marketing" },
  { href: "/marketing/templates", label: "Templates", group: "marketing" },
  { href: "/marketing/analytics", label: "Analytics", group: "marketing" },

  { href: "/transactional/templates", label: "Templates", group: "transactional" },
  { href: "/transactional/events", label: "Events", group: "transactional" },
  { href: "/transactional/logs", label: "Delivery Logs", group: "transactional" },
  { href: "/transactional/analytics", label: "Analytics", group: "transactional" },

  { href: "/settings", label: "Settings", group: "system" },
];

export function AppShell({
  user,
  children,
}: {
  user: { name?: string | null; email?: string | null; role: Role };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const groupsInOrder: NavItem["group"][] = ["top", "marketing", "transactional", "system"];
  const groupLabels: Record<NavItem["group"], string> = {
    top: "",
    marketing: "Marketing",
    transactional: "Transactional",
    system: "System",
  };

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-muted/40 md:flex">
        <div className="px-4 py-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">ABTalks</div>
          <div className="text-sm font-semibold">Mailer</div>
        </div>
        <nav className="flex-1 space-y-6 px-2 pb-4">
          {groupsInOrder.map((g) => {
            const items = NAV.filter((n) => n.group === g);
            if (items.length === 0) return null;
            return (
              <div key={g}>
                {groupLabels[g] && (
                  <div className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {groupLabels[g]}
                  </div>
                )}
                <ul className="space-y-0.5">
                  {items.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={cn(
                            "block rounded-md px-2 py-1.5 text-sm transition",
                            active
                              ? "bg-primary text-primary-foreground"
                              : "text-foreground/80 hover:bg-accent hover:text-accent-foreground",
                          )}
                        >
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <div className="mb-2 truncate text-xs text-muted-foreground">
            {user.email} · <span className="uppercase">{user.role}</span>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs hover:bg-accent"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1">
        <div className="container max-w-6xl py-8">{children}</div>
      </main>
    </div>
  );
}
