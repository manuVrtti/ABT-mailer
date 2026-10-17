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
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
      {TABS.map((t) => {
        const active = t.matchExact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors",
              active
                ? "border-brand-600 font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            <t.icon className={cn("h-4 w-4", active ? "text-brand-600 dark:text-brand-300" : "")} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
