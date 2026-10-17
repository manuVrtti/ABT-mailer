"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonClasses } from "./ui";

/*
 * Toasts and confirmation dialogs, callable from anywhere on the client:
 *
 *   toast.success("Campaign scheduled");
 *   if (!(await confirmDialog({ title: "Send 5,000 emails?", confirmLabel: "Send" }))) return;
 *
 * <OverlayHost /> (mounted once in Providers) renders them. A tiny external
 * store instead of React context, so callers don't need a hook.
 */

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

type ToastTone = "success" | "error" | "info" | "warning";
type ToastItem = { id: number; tone: ToastTone; title: string; description?: string };
type ConfirmRequest = {
  id: number;
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  resolve: (ok: boolean) => void;
};

let toasts: ToastItem[] = [];
let confirmReq: ConfirmRequest | null = null;
let seq = 0;
type Snapshot = { toasts: ToastItem[]; confirmReq: ConfirmRequest | null };
// One object per change: useSyncExternalStore compares snapshots by identity.
let snapshot: Snapshot = { toasts, confirmReq };
const SERVER_SNAPSHOT: Snapshot = { toasts: [], confirmReq: null };
const listeners = new Set<() => void>();
const emit = () => {
  snapshot = { toasts, confirmReq };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function push(tone: ToastTone, title: string, description?: string) {
  const id = ++seq;
  toasts = [...toasts, { id, tone, title, description }].slice(-4);
  emit();
  setTimeout(() => dismiss(id), tone === "error" ? 7000 : 4000);
}
function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export const toast = Object.assign((title: string, description?: string) => push("info", title, description), {
  success: (title: string, description?: string) => push("success", title, description),
  error: (title: string, description?: string) => push("error", title, description),
  warning: (title: string, description?: string) => push("warning", title, description),
  info: (title: string, description?: string) => push("info", title, description),
});

/** Promise-based replacement for window.confirm. Resolves true on confirm. */
export function confirmDialog(opts: Omit<ConfirmRequest, "id" | "resolve">): Promise<boolean> {
  return new Promise((resolve) => {
    confirmReq?.resolve(false);
    confirmReq = { ...opts, id: ++seq, resolve };
    emit();
  });
}
function closeConfirm(ok: boolean) {
  confirmReq?.resolve(ok);
  confirmReq = null;
  emit();
}

// ---------------------------------------------------------------------------
// Host
// ---------------------------------------------------------------------------

export function OverlayHost() {
  const state = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => SERVER_SNAPSHOT,
  );
  return (
    <>
      <ToastStack items={state.toasts} />
      {state.confirmReq && <ConfirmModal key={state.confirmReq.id} req={state.confirmReq} />}
    </>
  );
}

const TOAST_ICON: Record<ToastTone, React.ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 text-brand-600" />,
  error: <XCircle className="h-4 w-4 text-red-600" />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-600" />,
  info: <Info className="h-4 w-4 text-sky-600" />,
};

function ToastStack({ items }: { items: ToastItem[] }) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto flex animate-slide-in-right items-start gap-3 rounded-lg border border-border bg-card p-3 text-sm shadow-pop"
        >
          <span className="mt-0.5">{TOAST_ICON[t.tone]}</span>
          <div className="min-w-0 flex-1">
            <div className="font-medium">{t.title}</div>
            {t.description && <div className="mt-0.5 text-xs text-muted-foreground">{t.description}</div>}
          </div>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

function ConfirmModal({ req }: { req: ConfirmRequest }) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeConfirm(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const danger = req.tone === "danger";
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 animate-fade-in bg-slate-950/40 backdrop-blur-[1px]" onClick={() => closeConfirm(false)} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="relative w-full max-w-md animate-pop-in rounded-xl border border-border bg-card p-5 shadow-pop"
      >
        <div className="flex gap-3">
          <span
            className={cn(
              "grid h-9 w-9 shrink-0 place-items-center rounded-full",
              danger ? "bg-red-50 text-red-600 dark:bg-red-950/50" : "bg-brand-50 text-brand-600 dark:bg-brand-950/60",
            )}
          >
            {danger ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
          </span>
          <div className="min-w-0 pt-1">
            <h2 id="confirm-title" className="text-base font-semibold">
              {req.title}
            </h2>
            {req.message && <div className="mt-1.5 text-sm text-muted-foreground">{req.message}</div>}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={buttonClasses("secondary")} onClick={() => closeConfirm(false)}>
            {req.cancelLabel ?? "Cancel"}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={buttonClasses(danger ? "destructive" : "primary")}
            onClick={() => closeConfirm(true)}
          >
            {req.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dropdown menu
// ---------------------------------------------------------------------------

export type MenuItem =
  | {
      label: React.ReactNode;
      icon?: React.ComponentType<{ className?: string }>;
      onSelect: () => void;
      danger?: boolean;
      disabled?: boolean;
    }
  | "separator";

/** A button that opens a small menu; closes on pick, outside click or Escape. */
export function DropdownMenu({
  trigger,
  items,
  align = "end",
  side = "bottom",
  className,
  label,
}: {
  trigger: React.ReactNode;
  items: MenuItem[];
  align?: "start" | "end";
  side?: "bottom" | "top";
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className={cn("relative", className)}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)} className="w-full">
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute z-50 min-w-[200px] animate-pop-in rounded-lg border border-border bg-card p-1 shadow-pop",
            align === "end" ? "right-0" : "left-0",
            side === "bottom" ? "top-full mt-1" : "bottom-full mb-1",
          )}
        >
          {items.map((it, i) =>
            it === "separator" ? (
              <div key={i} className="my-1 h-px bg-border" />
            ) : (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors disabled:opacity-50",
                  it.danger ? "text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40" : "hover:bg-muted",
                )}
              >
                {it.icon && <it.icon className="h-4 w-4 shrink-0 opacity-70" />}
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

export type ThemeChoice = "light" | "dark" | "system";
const THEME_KEY = "mailer:theme";

export function readTheme(): ThemeChoice {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(choice: ThemeChoice) {
  try {
    localStorage.setItem(THEME_KEY, choice);
  } catch {
    /* storage disabled — still apply for this page */
  }
  const dark = choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}
