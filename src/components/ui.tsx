import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border/60 bg-white p-4 shadow-sm dark:bg-slate-900/60", className)}>
      {children}
    </div>
  );
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
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  size?: "sm" | "md";
  as?: "button" | "a";
  href?: string;
}) {
  const base =
    "inline-flex items-center justify-center rounded-md font-medium transition disabled:opacity-60 disabled:pointer-events-none";
  const sizes = { sm: "px-2.5 py-1 text-xs", md: "px-4 py-2 text-sm" } as const;
  const variants = {
    primary:
      "bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-sm hover:shadow-md",
    secondary: "border border-border bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800",
    ghost: "hover:bg-slate-100 dark:hover:bg-slate-800",
    destructive: "bg-gradient-to-r from-rose-500 to-red-600 text-white shadow-sm hover:shadow-md",
  } as const;
  const classes = cn(base, sizes[size], variants[variant], className);
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

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring",
        props.className,
      )}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring",
        props.className,
      )}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring",
        props.className,
      )}
    />
  );
}

export function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-muted-foreground">
      {children}
    </label>
  );
}

export function Badge({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "success" | "warning" | "destructive" | "info";
}) {
  const tones = {
    muted: "bg-muted text-muted-foreground",
    success: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
    warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    destructive: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
    info: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  } as const;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", tones[tone])}>
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
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border/70 bg-white p-10 text-center shadow-sm dark:bg-slate-900/40">
      {Icon && (
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-100 dark:from-indigo-950/40 dark:to-violet-950/30">
          <Icon className="h-7 w-7 text-indigo-500 dark:text-indigo-300" />
        </div>
      )}
      <div className="text-sm font-medium">{title}</div>
      {description && <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-white shadow-sm dark:bg-slate-900/60">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}
export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="bg-slate-50/80 text-[10px] uppercase tracking-wider text-muted-foreground dark:bg-slate-800/40">
      {children}
    </thead>
  );
}
export function TR({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tr className={cn("border-t border-border first:border-t-0", className)}>{children}</tr>;
}
export function TH({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={cn("px-3 py-2 text-left font-medium", className)}>{children ?? null}</th>;
}
export function TD({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("px-3 py-2 align-middle", className)}>{children ?? null}</td>;
}
