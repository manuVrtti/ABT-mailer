"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, ListChecks, FolderClock } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/marketing/contacts", label: "All contacts", icon: Users, matchExact: true },
  { href: "/marketing/contacts/lists", label: "Lists", icon: ListChecks },
  { href: "/marketing/contacts/imports", label: "Imports", icon: FolderClock },
];

export function ContactsTabs() {
  const pathname = usePathname();
  return (
    <div className="mb-6 flex flex-wrap items-center gap-1 rounded-2xl border border-border/60 bg-white p-1 shadow-sm dark:bg-slate-900/60">
      {TABS.map((t) => {
        const Icon = t.icon;
        const active = t.matchExact
          ? pathname === t.href
          : pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm transition",
              active
                ? "bg-gradient-to-r from-emerald-500 to-teal-600 font-medium text-white shadow-sm"
                : "text-muted-foreground hover:bg-slate-50 hover:text-foreground dark:hover:bg-slate-800/40",
            )}
          >
            <Icon className="h-4 w-4" />
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
