"use client";

import { useMemo, useState } from "react";
import { ListChecks, Filter, Search } from "lucide-react";
import { Button } from "@/components/ui";

type ListOption = { id: string; name: string; members: number };
type SegmentOption = { id: string; name: string; audienceSize: number | null; description: string | null };

/**
 * Recipients chooser: tick any number of lists, OR pick one segment (a segment
 * is a rule set, so it isn't combined with lists). A search box filters both.
 * Filtered-out options are hidden, not unmounted, so their selection still
 * submits with the form.
 */
export function RecipientsPicker({
  campaignId,
  lists,
  segments,
  initialListIds,
  initialSegmentId,
}: {
  campaignId: string;
  lists: ListOption[];
  segments: SegmentOption[];
  initialListIds: string[];
  initialSegmentId: string | null;
}) {
  const [query, setQuery] = useState("");
  const [listIds, setListIds] = useState<string[]>(initialListIds);
  const [segmentId, setSegmentId] = useState<string | null>(initialListIds.length > 0 ? null : initialSegmentId);

  const q = query.trim().toLowerCase();
  const matches = (name: string, extra?: string | null) =>
    !q || name.toLowerCase().includes(q) || (extra ?? "").toLowerCase().includes(q);

  const visibleLists = lists.filter((l) => matches(l.name)).length;
  const visibleSegments = segments.filter((s) => matches(s.name, s.description)).length;

  const selectedMembers = useMemo(
    () => lists.filter((l) => listIds.includes(l.id)).reduce((n, l) => n + l.members, 0),
    [lists, listIds],
  );

  function toggleList(id: string) {
    setSegmentId(null);
    setListIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function pickSegment(id: string) {
    setListIds([]);
    setSegmentId(id);
  }

  const nothingSelected = listIds.length === 0 && !segmentId;

  return (
    <div className="space-y-4">
      <input type="hidden" name="id" value={campaignId} />
      {listIds.map((id) => (
        <input key={id} type="hidden" name="listIds" value={id} />
      ))}
      {segmentId && <input type="hidden" name="segmentId" value={segmentId} />}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search lists and segments"
          aria-label="Search lists and segments"
          className="h-10 w-full rounded-xl border border-border/60 bg-white pl-9 pr-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 dark:bg-slate-900"
        />
      </div>

      {lists.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
            <span className="flex items-center gap-2">
              <ListChecks className="h-3.5 w-3.5" />
              Lists <span className="font-normal">· select one or more</span>
            </span>
            {listIds.length > 0 && (
              <button type="button" onClick={() => setListIds([])} className="font-medium text-emerald-700 hover:underline">
                Clear ({listIds.length})
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {lists.map((l) => {
              const checked = listIds.includes(l.id);
              return (
                <label
                  key={l.id}
                  className={`${matches(l.name) ? "flex" : "hidden"} cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                    checked
                      ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-500/10"
                      : "border-border/60 hover:border-emerald-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleList(l.id)}
                    className="h-4 w-4 accent-emerald-500"
                  />
                  <div>
                    <div className="text-sm font-medium">{l.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {l.members.toLocaleString()} contact{l.members === 1 ? "" : "s"}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
          {visibleLists === 0 && <div className="text-xs text-muted-foreground">No lists match &ldquo;{query}&rdquo;.</div>}
        </div>
      )}

      {segments.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            Segments <span className="font-normal">· or pick one segment instead</span>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {segments.map((s) => {
              const checked = segmentId === s.id;
              return (
                <label
                  key={s.id}
                  className={`${matches(s.name, s.description) ? "flex" : "hidden"} cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                    checked
                      ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-500/10"
                      : "border-border/60 hover:border-emerald-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  }`}
                >
                  <input
                    type="radio"
                    checked={checked}
                    onChange={() => pickSegment(s.id)}
                    className="h-4 w-4 accent-emerald-500"
                  />
                  <div>
                    <div className="text-sm font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.audienceSize != null ? `~${s.audienceSize.toLocaleString()} contacts` : "size not computed"}
                      {s.description ? ` · ${s.description}` : ""}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
          {visibleSegments === 0 && <div className="text-xs text-muted-foreground">No segments match &ldquo;{query}&rdquo;.</div>}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="text-xs text-muted-foreground">
          {listIds.length > 0 ? (
            <>
              {listIds.length} list{listIds.length === 1 ? "" : "s"} selected · up to {selectedMembers.toLocaleString()} contacts.
              {listIds.length > 1 && " People on more than one list get the email once."}
            </>
          ) : segmentId ? (
            "1 segment selected."
          ) : (
            "Nothing selected yet."
          )}
        </div>
        <div className="flex gap-2">
          <Button as="a" href={`/marketing/campaigns/${campaignId}/edit`} variant="secondary">
            Cancel
          </Button>
          <Button type="submit" disabled={nothingSelected}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
