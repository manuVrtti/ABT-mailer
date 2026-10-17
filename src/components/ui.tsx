import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/*
 * The app's component kit. Server-safe (no hooks, no "use client"), so pages
 * render these on the server. Interactive pieces (toasts, dialogs, menus)
 * live in ./overlay.tsx.
 *
 * Visual language: white cards on a light grey canvas, 1px borders, very soft
 * shadows, one accent (brand green), 36px controls, 8px radius.
 */

type IconType = React.ComponentType<{ className?: string }>;

// ---------------------------------------------------------------------------
// Page structure
// ---------------------------------------------------------------------------

export function PageHeader({
  title,
  description,
  actions,
  icon: Icon,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: IconType;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <div className="mt-0.5 hidden h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-card text-brand-700 shadow-xs dark:text-brand-300 sm:grid">
            <Icon className="h-[18px] w-[18px]" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-8 tracking-tight">{title}</h1>
          {description && <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A heading inside a page: title, optional hint, optional actions on the right. */
export function SectionHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex flex-wrap items-end justify-between gap-3", className)}>
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-5 text-card-foreground shadow-card", className)}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50";
const BUTTON_SIZES = { sm: "h-8 px-3 text-xs", md: "h-9 px-4 text-sm", icon: "h-9 w-9" } as const;
const BUTTON_VARIANTS = {
  primary: "bg-brand-600 text-white shadow-xs hover:bg-brand-700 active:bg-brand-800",
  secondary:
    "border border-input bg-background text-foreground shadow-xs hover:bg-muted active:bg-muted/80",
  ghost: "text-foreground hover:bg-muted",
  destructive: "bg-red-600 text-white shadow-xs hover:bg-red-700 active:bg-red-800",
} as const;

export function buttonClasses(
  variant: keyof typeof BUTTON_VARIANTS = "primary",
  size: keyof typeof BUTTON_SIZES = "md",
  className?: string,
) {
  return cn(BUTTON_BASE, BUTTON_SIZES[size], BUTTON_VARIANTS[variant], className);
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  as,
  href,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
  as?: "button" | "a";
  href?: string;
}) {
  const classes = buttonClasses(variant, size, className);
  if (as === "a" && href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}

const FIELD =
  "w-full rounded-md border border-input bg-background text-sm text-foreground shadow-xs transition-colors placeholder:text-muted-foreground/70 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-60";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(FIELD, "h-9 px-3", props.className)} />;
}

export function Textarea({ mono, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean }) {
  return (
    <textarea
      {...props}
      className={cn(FIELD, "px-3 py-2", mono ? "font-mono text-xs leading-relaxed" : "", props.className)}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(FIELD, "h-9 cursor-pointer pl-3 pr-8", props.className)} />;
}

export function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-foreground/80">
      {children}
    </label>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-muted px-1 font-sans text-2xs font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

const BADGE_TONES = {
  muted: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
  success: "bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-950/60 dark:text-brand-300 dark:ring-brand-900",
  warning: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900",
  destructive: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-900",
  info: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-900",
} as const;
const BADGE_DOTS = {
  muted: "bg-slate-400",
  success: "bg-brand-500",
  warning: "bg-amber-500",
  destructive: "bg-red-500",
  info: "bg-sky-500",
} as const;

export function Badge({
  children,
  tone = "muted",
  dot,
}: {
  children: React.ReactNode;
  tone?: keyof typeof BADGE_TONES;
  /** Leading status dot. */
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-2xs font-medium ring-1 ring-inset",
        BADGE_TONES[tone],
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", BADGE_DOTS[tone])} />}
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: IconType;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center">
      {Icon && (
        <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-full bg-brand-50 text-brand-600 ring-8 ring-brand-50/50 dark:bg-brand-950/60 dark:text-brand-300 dark:ring-brand-950/30">
          <Icon className="h-5 w-5" />
        </div>
      )}
      <div className="text-sm font-semibold">{title}</div>
      {description && <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/**
 * KPI tile: label, big number, optional context line and change vs. the
 * previous period (green up / red down; `invert` for metrics where down is good).
 */
export function StatCard({
  label,
  value,
  sub,
  delta,
  invert,
  icon: Icon,
  href,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  /** Fractional change, e.g. 0.12 for +12%. */
  delta?: number | null;
  invert?: boolean;
  icon?: IconType;
  href?: string;
  className?: string;
}) {
  const good = delta == null ? null : invert ? delta < 0 : delta > 0;
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground/70" />}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight tabular">{value}</span>
        {delta != null && Number.isFinite(delta) && (
          <span
            className={cn(
              "rounded px-1 py-0.5 text-2xs font-medium tabular",
              delta === 0
                ? "bg-muted text-muted-foreground"
                : good
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300"
                  : "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300",
            )}
          >
            {delta > 0 ? "▲" : delta < 0 ? "▼" : ""} {Math.abs(Math.round(delta * 100))}%
          </span>
        )}
      </div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </>
  );
  const cls = cn("block rounded-lg border border-border bg-card p-4 shadow-card", href && "transition hover:border-brand-300", className);
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Underlined tabs driven by links (server-rendered pages). */
export function Tabs({
  items,
  className,
}: {
  items: { href: string; label: React.ReactNode; active?: boolean; count?: number }[];
  className?: string;
}) {
  return (
    <nav className={cn("mb-5 flex gap-1 overflow-x-auto border-b border-border", className)}>
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            "-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors",
            t.active
              ? "border-brand-600 font-medium text-foreground"
              : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className="rounded-full bg-muted px-1.5 py-px text-2xs font-medium tabular text-muted-foreground">
              {t.count.toLocaleString()}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials =
    name
      .split(/\s+|@|\./)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?";
  return (
    <span
      className={cn(
        "grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800 dark:bg-brand-900 dark:text-brand-100",
        className,
      )}
    >
      {initials}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">{children}</table>
      </div>
    </div>
  );
}
export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">{children}</thead>;
}
export function TR({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <tr className={cn("border-t border-border transition-colors first:border-t-0 hover:bg-muted/40", className)}>{children}</tr>
  );
}
export function TH({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={cn("h-10 whitespace-nowrap px-4 text-left align-middle font-medium", className)}>{children ?? null}</th>;
}
export function TD({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 align-middle", className)}>{children ?? null}</td>;
}
