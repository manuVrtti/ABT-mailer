"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CornerDownLeft,
  FileText,
  Filter,
  ListChecks,
  Loader2,
  Megaphone,
  Search,
  Send,
  User,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { globalSearch, type SearchHit } from "@/app/(app)/search-actions";
import { Kbd } from "./ui";

export type PaletteLink = { label: string; href: string; icon: LucideIcon; group: string; keywords?: string };

const HIT_ICON: Record<SearchHit["kind"], LucideIcon> = {
  campaign: Megaphone,
  personal: Send,
  list: ListChecks,
  template: FileText,
  segment: Filter,
  contact: User,
};
const HIT_GROUP: Record<SearchHit["kind"], string> = {
  campaign: "Campaigns",
  personal: "Personal mails",
  list: "Lists",
  template: "Templates",
  segment: "Segments",
  contact: "Contacts",
};

type Entry = { key: string; group: string; label: string; sub?: string; href: string; icon: LucideIcon };

/**
 * Ctrl/⌘+K: jump to any page or action, or find a campaign, batch, list,
 * template, segment or contact by name.
 */
export function CommandPalette({
  open,
  onClose,
  links,
}: {
  open: boolean;
  onClose: () => void;
  links: PaletteLink[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setHits([]);
    setActive(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    setActive(0);
    if (term.length < 2) {
      seq.current++;
      setHits([]);
      setLoading(false);
      return;
    }
    const mine = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const res = await globalSearch(term).catch(() => []);
      if (mine !== seq.current) return;
      setHits(res);
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const entries: Entry[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    const pageEntries = links
      .filter((l) => !term || `${l.label} ${l.group} ${l.keywords ?? ""}`.toLowerCase().includes(term))
      .map((l) => ({ key: `link:${l.href}`, group: l.group, label: l.label, href: l.href, icon: l.icon }));
    const hitEntries = hits.map((h, i) => ({
      key: `hit:${i}:${h.href}`,
      group: HIT_GROUP[h.kind],
      label: h.title,
      sub: h.subtitle,
      href: h.href,
      icon: HIT_ICON[h.kind],
    }));
    return term ? [...hitEntries, ...pageEntries] : pageEntries;
  }, [links, hits, q]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const go = (e: Entry | undefined) => {
    if (!e) return;
    onClose();
    router.push(e.href);
  };

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center p-4 pt-[12vh]">
      <div className="absolute inset-0 animate-fade-in bg-slate-950/40 backdrop-blur-[1px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="relative w-full max-w-xl animate-pop-in overflow-hidden rounded-xl border border-border bg-card shadow-pop"
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          {loading ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, entries.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(entries[active]);
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
            placeholder="Search campaigns, lists, contacts… or jump to a page"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
          {entries.length === 0 && !loading && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">No results for “{q}”.</div>
          )}
          {entries.map((e, i) => {
            const header = e.group !== lastGroup ? e.group : null;
            lastGroup = e.group;
            return (
              <div key={e.key}>
                {header && <div className="px-2.5 pb-1 pt-2.5 text-2xs font-medium uppercase tracking-wider text-muted-foreground">{header}</div>}
                <button
                  type="button"
                  data-index={i}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(e)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm",
                    i === active ? "bg-muted" : "",
                  )}
                >
                  <e.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{e.label}</span>
                    {e.sub && <span className="block truncate text-xs text-muted-foreground">{e.sub}</span>}
                  </span>
                  {i === active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-3 border-t border-border bg-muted/40 px-4 py-2 text-2xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> open
          </span>
        </div>
      </div>
    </div>
  );
}
