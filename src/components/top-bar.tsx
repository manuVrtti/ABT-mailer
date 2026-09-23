"use client";

import Link from "next/link";
import { Bell, HelpCircle, Settings, ChevronDown, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Top header bar — Brevo-parity: workspace pill on the left, then a growing
 * spacer, then plan indicator + icon buttons on the right. Sticky so it stays
 * put on scroll.
 */
export function TopBar({
  workspace = "ABTalks",
  planLabel = "Sandbox",
}: {
  workspace?: string;
  planLabel?: string;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/60 bg-white/80 px-6 backdrop-blur-md dark:bg-slate-900/70">
      {/* Workspace pill */}
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-white px-3 py-1.5 text-xs font-medium shadow-sm transition hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800"
      >
        <span className="grid h-5 w-5 place-items-center rounded-md bg-gradient-to-br from-emerald-500 to-teal-600 text-[10px] font-semibold text-white">
          AB
        </span>
        <span>{workspace}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      <div className="flex-1" />

      {/* Plan indicator */}
      <Link
        href="/settings"
        className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/60"
      >
        <Zap className="h-3.5 w-3.5" />
        Plan: {planLabel}
      </Link>

      {/* Icon buttons */}
      <IconButton title="Help" href="/settings">
        <HelpCircle className="h-4 w-4" />
      </IconButton>
      <IconButton title="Notifications">
        <Bell className="h-4 w-4" />
        <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-rose-500" />
      </IconButton>
      <IconButton title="Settings" href="/settings">
        <Settings className="h-4 w-4" />
      </IconButton>
    </header>
  );
}

function IconButton({
  children,
  title,
  href,
}: {
  children: React.ReactNode;
  title: string;
  href?: string;
}) {
  const cls = cn(
    "relative inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-slate-100 hover:text-foreground dark:hover:bg-slate-800",
  );
  if (href) {
    return (
      <Link href={href} className={cls} title={title}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} title={title}>
      {children}
    </button>
  );
}
