"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  Briefcase,
  Building2,
  CalendarRange,
  ChevronDown,
  Filter,
  GraduationCap,
  Loader2,
  Mail,
  MapPin,
  Megaphone,
  Mic,
  Plus,
  Presentation,
  Sparkles,
  Trophy,
  UserX,
  Users,
  Video,
  X,
  BadgeCheck,
  Check,
  School,
} from "lucide-react";
import { Button, Input } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  COHORT_STATUSES,
  SOURCE_LABELS,
  USER_TYPES,
  USER_TYPE_LABELS,
  describeKlymbFilter,
  formatYears,
  klymbFilterSchema,
  type KlymbFilter,
  type KlymbSource,
  type SourceKind,
  type UserType,
} from "@/server/klymb/filter";
import type { KlymbFilterOptions, KlymbOption } from "@/server/klymb/options";
import type { KlymbPreview } from "@/server/klymb/people";
import { CONTACT_LIST_COLORS } from "../_constants";
import { createKlymbList, previewKlymbListFilter, suggestKlymbFilterValues, updateKlymbList } from "../klymb-actions";

// ---------------------------------------------------------------------------
// Static copy
// ---------------------------------------------------------------------------

type Icon = React.ComponentType<{ className?: string }>;

const SOURCE_META: Record<SourceKind, { icon: Icon; hint: string }> = {
  all_users: { icon: Users, hint: "Everyone with a Klymb account" },
  hackathon: { icon: Trophy, hint: "Registered for a hackathon" },
  workshop: { icon: Presentation, hint: "Registered for a workshop" },
  cohort: { icon: GraduationCap, hint: "Enrolled in a cohort or challenge" },
  videothon: { icon: Video, hint: "Registered for a VideoThon" },
  newsletter: { icon: Mail, hint: "Subscribed to the newsletter" },
  mock_interview: { icon: Mic, hint: "Took a mock interview" },
  job_applicants: { icon: Briefcase, hint: "Applied to a job on Klymb" },
};
const SOURCE_ORDER: SourceKind[] = [
  "all_users",
  "hackathon",
  "workshop",
  "cohort",
  "videothon",
  "newsletter",
  "mock_interview",
  "job_applicants",
];

const TYPE_DOT: Record<UserType, string> = {
  STUDENT: "bg-emerald-500",
  PROFESSIONAL: "bg-sky-500",
  RECRUITER: "bg-violet-500",
  UNKNOWN: "bg-slate-400",
};

const SWATCH: Record<string, string> = {
  emerald: "bg-emerald-500",
  teal: "bg-teal-500",
  sky: "bg-sky-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  violet: "bg-violet-500",
  slate: "bg-slate-500",
};

type ExtraKey = "grad" | "college" | "company" | "city" | "signup" | "utm" | "openToWork";
const EXTRAS: { key: ExtraKey; label: string; icon: Icon }[] = [
  { key: "grad", label: "Graduation year", icon: GraduationCap },
  { key: "college", label: "College", icon: School },
  { key: "company", label: "Company", icon: Building2 },
  { key: "city", label: "City / state", icon: MapPin },
  { key: "signup", label: "Signup date", icon: CalendarRange },
  { key: "utm", label: "Came from campaign (UTM)", icon: Megaphone },
  { key: "openToWork", label: "Open to work", icon: BadgeCheck },
];

function extraIsSet(f: KlymbFilter, k: ExtraKey): boolean {
  switch (k) {
    case "grad":
      return f.graduationYears.length > 0;
    case "college":
      return f.colleges.include.length + f.colleges.exclude.length > 0;
    case "company":
      return f.companies.include.length + f.companies.exclude.length > 0;
    case "city":
      return f.cities.length > 0;
    case "signup":
      return Boolean(f.signedUpFrom || f.signedUpTo);
    case "utm":
      return f.utmSources.length + f.utmCampaigns.length > 0;
    case "openToWork":
      return f.openToWork;
  }
}

function clearExtra(f: KlymbFilter, k: ExtraKey): Partial<KlymbFilter> {
  switch (k) {
    case "grad":
      return { graduationYears: [] };
    case "college":
      return { colleges: { include: [], exclude: [] } };
    case "company":
      return { companies: { include: [], exclude: [] } };
    case "city":
      return { cities: [] };
    case "signup":
      return { signedUpFrom: undefined, signedUpTo: undefined };
    case "utm":
      return { utmSources: [], utmCampaigns: [] };
    case "openToWork":
      return { openToWork: false };
  }
}

function newSource(kind: SourceKind): KlymbSource {
  switch (kind) {
    case "hackathon":
      return { kind, eventIds: [], submitted: "any", leadersOnly: false };
    case "videothon":
      return { kind, eventIds: [], submitted: "any", employment: "any" };
    case "workshop":
      return { kind, eventIds: [] };
    case "cohort":
      return { kind, cohortIds: [], statuses: [] };
    default:
      return { kind } as KlymbSource;
  }
}

const P = (raw: unknown) => klymbFilterSchema.parse(raw);
const PRESETS: { label: string; hint: string; filter: () => KlymbFilter }[] = [
  { label: "Everyone", hint: "All Klymb users", filter: () => P({ sources: [{ kind: "all_users" }] }) },
  { label: "All students", hint: "Students only", filter: () => P({ sources: [{ kind: "all_users" }], userTypes: ["STUDENT"] }) },
  { label: "Professionals", hint: "Working people", filter: () => P({ sources: [{ kind: "all_users" }], userTypes: ["PROFESSIONAL"] }) },
  {
    label: "Hackathon — didn't submit",
    hint: "Registered, no submission",
    filter: () => P({ sources: [{ kind: "hackathon", submitted: "no" }], userTypes: ["STUDENT"] }),
  },
  { label: "Workshop people", hint: "Any workshop", filter: () => P({ sources: [{ kind: "workshop" }] }) },
  {
    label: "Newsletter",
    hint: "Opted-in subscribers",
    filter: () => P({ sources: [{ kind: "newsletter" }], consent: "only_opted_in" }),
  },
];

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

export function KlymbListForm({
  options,
  initialFilter,
  list,
}: {
  options: KlymbFilterOptions;
  initialFilter: KlymbFilter;
  /** Set when editing an existing list. */
  list?: { id: string; name: string; description: string | null; color: string };
}) {
  const [filter, setFilter] = useState<KlymbFilter>(initialFilter);
  const [name, setName] = useState(list?.name ?? "");
  const [description, setDescription] = useState(list?.description ?? "");
  const [showDescription, setShowDescription] = useState(Boolean(list?.description));
  const [color, setColor] = useState(list?.color ?? "sky");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  // Filters the user opened but hasn't filled in yet still show.
  const [openExtras, setOpenExtras] = useState<ExtraKey[]>([]);

  const [preview, setPreview] = useState<KlymbPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const seq = useRef(0);
  const filterJson = useMemo(() => JSON.stringify(filter), [filter]);

  // Re-count 600 ms after the last change; an older answer never overwrites a newer one.
  useEffect(() => {
    const mine = ++seq.current;
    setPreviewing(true);
    const t = setTimeout(async () => {
      const res = await previewKlymbListFilter(filterJson);
      if (mine !== seq.current) return;
      setPreviewing(false);
      if (res.ok) {
        setPreview(res.preview);
        setPreviewError(null);
      } else setPreviewError(res.error);
    }, 600);
    return () => clearTimeout(t);
  }, [filterJson]);

  const update = (patch: Partial<KlymbFilter>) => setFilter((f) => ({ ...f, ...patch }));
  const cohortNames = useMemo(() => Object.fromEntries(options.cohorts.map((c) => [c.id, c.label])), [options.cohorts]);
  const activeExtras = EXTRAS.filter((e) => extraIsSet(filter, e.key) || openExtras.includes(e.key));
  const activePreset = PRESETS.find((p) => JSON.stringify(p.filter()) === filterJson)?.label;

  function save() {
    setSaveError(null);
    const fd = new FormData();
    if (list) fd.set("id", list.id);
    fd.set("name", name);
    fd.set("description", showDescription ? description : "");
    fd.set("color", color);
    fd.set("filter", filterJson);
    startSave(async () => {
      const res = list ? await updateKlymbList(fd) : await createKlymbList(fd);
      if (res && !res.ok) setSaveError(res.error);
    });
  }

  return (
    <div className="grid gap-6 pb-24 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5">
        {/* Name */}
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[240px] flex-1">
              <label htmlFor="name" className="mb-1 block text-xs font-medium text-muted-foreground">
                List name
              </label>
              <Input
                id="name"
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Hackathon Oct — students who didn't submit"
                className="text-base"
              />
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Colour</div>
              <div className="flex gap-1.5">
                {CONTACT_LIST_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={c}
                    onClick={() => setColor(c)}
                    className={cn(
                      "h-7 w-7 rounded-full transition",
                      SWATCH[c],
                      color === c ? "ring-2 ring-emerald-500 ring-offset-2 dark:ring-offset-slate-900" : "opacity-60 hover:opacity-100",
                    )}
                  />
                ))}
              </div>
            </div>
          </div>
          {showDescription ? (
            <textarea
              rows={2}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this list for?"
              className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowDescription(true)}
              className="mt-2 text-xs text-emerald-700 hover:underline dark:text-emerald-300"
            >
              + Add a description
            </button>
          )}
        </section>

        {/* Quick start */}
        {!list && (
          <section>
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" /> Quick start — pick one, then adjust below
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setFilter(p.filter());
                    setOpenExtras([]);
                  }}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-left transition",
                    activePreset === p.label
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40"
                      : "border-border/70 bg-white hover:border-emerald-300 hover:bg-emerald-50/40",
                  )}
                >
                  <div className="text-sm font-medium">{p.label}</div>
                  <div className="text-xs text-muted-foreground">{p.hint}</div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* 1. Include */}
        <Step n={1} title="Who should get it?" hint="People in any of these groups.">
          <SourceGroups
            sources={filter.sources}
            options={options}
            onChange={(sources) => update({ sources })}
            addLabel="Add another group"
            joiner="or"
            minOne
          />
        </Step>

        {/* 2. Exclude */}
        <Step
          n={2}
          title="Leave anyone out?"
          hint="Optional — e.g. people who already registered for this week's workshop."
          icon={UserX}
        >
          <SourceGroups
            sources={filter.exclude}
            options={options}
            onChange={(exclude) => update({ exclude })}
            addLabel={filter.exclude.length ? "Leave out another group" : "Leave out a group"}
            joiner="or"
            tone="exclude"
          />
        </Step>

        {/* 3. Filters */}
        <Step n={3} title="Narrow it down" hint="Optional. Every filter you add must match." icon={Filter}>
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-xs font-medium text-muted-foreground">Type of person</div>
              <div className="flex flex-wrap gap-2">
                <TypeChip active={filter.userTypes.length === 0} onClick={() => update({ userTypes: [] })}>
                  Everyone
                </TypeChip>
                {USER_TYPES.map((t) => (
                  <TypeChip
                    key={t}
                    active={filter.userTypes.includes(t)}
                    onClick={() => update({ userTypes: toggle(filter.userTypes, t) })}
                  >
                    <span className={cn("mr-1.5 inline-block h-2 w-2 rounded-full", TYPE_DOT[t])} />
                    {USER_TYPE_LABELS[t]}
                    {preview && <span className="ml-1.5 tabular-nums opacity-60">{preview.byType[t].toLocaleString()}</span>}
                  </TypeChip>
                ))}
              </div>
            </div>

            {activeExtras.map((e) => (
              <ExtraFilter
                key={e.key}
                meta={e}
                onRemove={() => {
                  update(clearExtra(filter, e.key));
                  setOpenExtras((o) => o.filter((k) => k !== e.key));
                }}
              >
                <ExtraFilterBody k={e.key} filter={filter} update={update} options={options} />
              </ExtraFilter>
            ))}

            <AddMenu
              label="Add a filter"
              items={EXTRAS.filter((e) => !activeExtras.some((a) => a.key === e.key)).map((e) => ({
                key: e.key,
                label: e.label,
                icon: e.icon,
              }))}
              onPick={(k) => {
                const key = k as ExtraKey;
                if (key === "openToWork") update({ openToWork: true });
                setOpenExtras((o) => [...o, key]);
              }}
            />
          </div>
        </Step>

        {/* 4. Consent */}
        <Step n={4} title="Newsletter consent" icon={Mail}>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["exclude_opted_out", "Everyone except unsubscribed", "Best for event, workshop and hackathon mail."],
                ["only_opted_in", "Only newsletter subscribers", "Best for pure promotions."],
              ] as const
            ).map(([value, title, hint]) => (
              <button
                key={value}
                type="button"
                onClick={() => update({ consent: value })}
                className={cn(
                  "rounded-xl border p-3 text-left transition",
                  filter.consent === value
                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40"
                    : "border-border/70 hover:border-emerald-300",
                )}
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span
                    className={cn(
                      "grid h-4 w-4 place-items-center rounded-full border",
                      filter.consent === value ? "border-emerald-500" : "border-slate-300",
                    )}
                  >
                    {filter.consent === value && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                  </span>
                  {title}
                </div>
                <div className="mt-0.5 pl-6 text-xs text-muted-foreground">{hint}</div>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            People who unsubscribed in Klymb, and anyone on this app&apos;s suppression list, are never emailed.
          </p>
        </Step>
      </div>

      <PreviewPanel
        preview={preview}
        error={previewError}
        loading={previewing}
        summary={describeKlymbFilter(filter, cohortNames)}
      />

      {/* Sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-white/90 backdrop-blur dark:bg-slate-950/90 md:left-[var(--sidebar-w,15rem)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-2 text-sm">
            {previewing ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <Users className="h-4 w-4 text-emerald-600" />
            )}
            {preview ? (
              <span>
                <b className="tabular-nums">{preview.total.toLocaleString()}</b> people
                {preview.byType.PROFESSIONAL + preview.byType.RECRUITER > 0 && (
                  <span className="ml-2 text-amber-700 dark:text-amber-300">
                    · incl. {preview.byType.PROFESSIONAL} professionals, {preview.byType.RECRUITER} recruiters
                  </span>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">Counting…</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {saveError && <span className="text-sm text-destructive">{saveError}</span>}
            <Button
              as="a"
              variant="secondary"
              href={list ? `/marketing/contacts/lists/${list.id}` : "/marketing/contacts/lists"}
            >
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={saving || !name.trim()}>
              {saving ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Saving…
                </>
              ) : list ? (
                "Save & refresh"
              ) : (
                "Create list"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function Step({
  n,
  title,
  hint,
  icon: StepIcon,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  icon?: Icon;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-xs font-semibold text-white">
          {n}
        </span>
        <div className="flex-1">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            {title}
            {StepIcon && <StepIcon className="h-4 w-4 text-muted-foreground" />}
          </h2>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

function TypeChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1.5 text-sm transition",
        active
          ? "border-emerald-500 bg-emerald-50 font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
          : "border-border bg-white text-muted-foreground hover:border-emerald-300 dark:bg-slate-900",
      )}
    >
      {children}
    </button>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-border bg-slate-50 p-0.5 dark:bg-slate-800/60">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            "rounded-md px-3 py-1 text-xs transition",
            value === v ? "bg-white font-medium shadow-sm dark:bg-slate-900" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Dropdown of things to add — closes on pick or outside click. */
function AddMenu({
  label,
  items,
  onPick,
  tone = "default",
}: {
  label: string;
  items: { key: string; label: string; hint?: string; icon: Icon }[];
  onPick: (key: string) => void;
  tone?: "default" | "exclude";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  if (items.length === 0) return null;
  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-sm transition",
          tone === "exclude"
            ? "border-rose-300 text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/30"
            : "border-emerald-400 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30",
        )}
      >
        <Plus className="h-4 w-4" /> {label}
        <ChevronDown className={cn("h-3.5 w-3.5 transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 w-72 rounded-xl border border-border bg-white p-1 shadow-lg dark:bg-slate-900">
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              onClick={() => {
                onPick(it.key);
                setOpen(false);
              }}
              className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <it.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span>
                <span className="block text-sm">{it.label}</span>
                {it.hint && <span className="block text-xs text-muted-foreground">{it.hint}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Source groups (include / exclude)
// ---------------------------------------------------------------------------

function SourceGroups({
  sources,
  options,
  onChange,
  addLabel,
  joiner,
  minOne,
  tone = "default",
}: {
  sources: KlymbSource[];
  options: KlymbFilterOptions;
  onChange: (s: KlymbSource[]) => void;
  addLabel: string;
  joiner: string;
  minOne?: boolean;
  tone?: "default" | "exclude";
}) {
  // A newly added group opens so its options are visible straight away.
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  // "All users" can't be left out, and is pointless to add twice.
  const items = SOURCE_ORDER.filter(
    (k) => !(k === "all_users" && (tone === "exclude" || sources.some((s) => s.kind === "all_users"))),
  ).map(
    (k) => ({ key: k, label: SOURCE_LABELS[k], hint: SOURCE_META[k].hint, icon: SOURCE_META[k].icon }),
  );
  return (
    <div className="space-y-2">
      {sources.length === 0 && tone === "exclude" && (
        <p className="text-sm text-muted-foreground">Nobody is left out.</p>
      )}
      {sources.map((s, i) => (
        <div key={i}>
          {i > 0 && (
            <div className="my-1 pl-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{joiner}</div>
          )}
          <SourceCard
            source={s}
            options={options}
            tone={tone}
            open={openIndex === i}
            onToggle={() => setOpenIndex(openIndex === i ? null : i)}
            onChange={(next) => onChange(sources.map((x, j) => (j === i ? next : x)))}
            onRemove={minOne && sources.length === 1 ? undefined : () => {
              onChange(sources.filter((_, j) => j !== i));
              setOpenIndex(null);
            }}
          />
        </div>
      ))}
      <div className="pt-1">
        <AddMenu
          label={addLabel}
          items={items}
          tone={tone}
          onPick={(k) => {
            const kind = k as SourceKind;
            // "All users" already covers every account — replace rather than OR it.
            const next =
              tone === "default" && sources.length === 1 && sources[0]!.kind === "all_users"
                ? [newSource(kind)]
                : [...sources, newSource(kind)];
            onChange(next);
            setOpenIndex(hasOptions(kind) ? next.length - 1 : null);
          }}
        />
      </div>
    </div>
  );
}

function hasOptions(kind: SourceKind): boolean {
  return kind === "hackathon" || kind === "videothon" || kind === "workshop" || kind === "cohort";
}

function sourceSummary(s: KlymbSource, options: KlymbFilterOptions): string {
  const names = (ids: string[], opts: KlymbOption[], noun: string) => {
    if (ids.length === 0) return `Any ${noun}`;
    const labels = ids.map((id) => opts.find((o) => o.id === id)?.label ?? id);
    return labels.length <= 2 ? labels.join(", ") : `${labels.slice(0, 2).join(", ")} +${labels.length - 2} more`;
  };
  const submitted = (v: "any" | "yes" | "no") => (v === "yes" ? "submitted" : v === "no" ? "did NOT submit" : "");
  switch (s.kind) {
    case "hackathon":
      return [names(s.eventIds, options.hackathons, "hackathon"), submitted(s.submitted), s.leadersOnly ? "leaders only" : ""]
        .filter(Boolean)
        .join(" · ");
    case "videothon":
      return [
        names(s.eventIds, options.videothons, "VideoThon"),
        s.employment === "WORKING" ? "working" : s.employment === "LEARNER" ? "learners" : "",
        submitted(s.submitted),
      ]
        .filter(Boolean)
        .join(" · ");
    case "workshop":
      return names(s.eventIds, options.workshops, "workshop");
    case "cohort":
      return [names(s.cohortIds, options.cohorts, "cohort"), s.statuses.map((x) => x.toLowerCase()).join("/")]
        .filter(Boolean)
        .join(" · ");
    default:
      return SOURCE_META[s.kind].hint;
  }
}

function SourceCard({
  source: s,
  options,
  tone,
  open,
  onToggle,
  onChange,
  onRemove,
}: {
  source: KlymbSource;
  options: KlymbFilterOptions;
  tone: "default" | "exclude";
  open: boolean;
  onToggle: () => void;
  onChange: (s: KlymbSource) => void;
  onRemove?: () => void;
}) {
  const SIcon = SOURCE_META[s.kind].icon;
  const editable = hasOptions(s.kind);
  return (
    <div
      className={cn(
        "rounded-xl border transition",
        tone === "exclude" ? "border-rose-200 bg-rose-50/40 dark:border-rose-900/60 dark:bg-rose-950/20" : "border-border/70",
        open && "shadow-sm",
      )}
    >
      <div className="flex items-center gap-3 p-3">
        <span
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
            tone === "exclude"
              ? "bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300"
              : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300",
          )}
        >
          <SIcon className="h-4 w-4" />
        </span>
        <button
          type="button"
          onClick={editable ? onToggle : undefined}
          className={cn("min-w-0 flex-1 text-left", !editable && "cursor-default")}
        >
          <div className="text-sm font-medium">{SOURCE_LABELS[s.kind]}</div>
          <div className="truncate text-xs text-muted-foreground">{sourceSummary(s, options)}</div>
        </button>
        {editable && (
          <button
            type="button"
            onClick={onToggle}
            className="rounded-md px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
          >
            {open ? "Done" : "Edit"}
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            title="Remove"
            className="rounded-md p-1 text-muted-foreground hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/30"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {open && editable && (
        <div className="space-y-4 border-t border-border/60 p-4">
          <SourceOptions source={s} options={options} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

function SourceOptions({
  source: s,
  options,
  onChange,
}: {
  source: KlymbSource;
  options: KlymbFilterOptions;
  onChange: (s: KlymbSource) => void;
}) {
  const submission = (value: "any" | "yes" | "no", set: (v: "any" | "yes" | "no") => void) => (
    <Field label="Submission">
      <Segmented
        value={value}
        onChange={set}
        options={[
          ["any", "Anyone"],
          ["yes", "Submitted"],
          ["no", "Didn't submit"],
        ]}
      />
    </Field>
  );
  switch (s.kind) {
    case "hackathon":
      return (
        <>
          <Field label="Which hackathons?">
            <PillPicker options={options.hackathons} value={s.eventIds} onChange={(eventIds) => onChange({ ...s, eventIds })} />
          </Field>
          <div className="flex flex-wrap items-end gap-6">
            {submission(s.submitted, (submitted) => onChange({ ...s, submitted }))}
            <Field label="Team role">
              <Segmented
                value={s.leadersOnly ? "leaders" : "all"}
                onChange={(v) => onChange({ ...s, leadersOnly: v === "leaders" })}
                options={[
                  ["all", "All members"],
                  ["leaders", "Leaders only"],
                ]}
              />
            </Field>
          </div>
        </>
      );
    case "videothon":
      return (
        <>
          <Field label="Which VideoThons?">
            <PillPicker options={options.videothons} value={s.eventIds} onChange={(eventIds) => onChange({ ...s, eventIds })} />
          </Field>
          <div className="flex flex-wrap items-end gap-6">
            {submission(s.submitted, (submitted) => onChange({ ...s, submitted }))}
            <Field label="Working or learning">
              <Segmented
                value={s.employment}
                onChange={(employment) => onChange({ ...s, employment })}
                options={[
                  ["any", "Both"],
                  ["LEARNER", "Learners"],
                  ["WORKING", "Working"],
                ]}
              />
            </Field>
          </div>
        </>
      );
    case "workshop":
      return (
        <Field label="Which workshops?">
          <PillPicker options={options.workshops} value={s.eventIds} onChange={(eventIds) => onChange({ ...s, eventIds })} />
        </Field>
      );
    case "cohort":
      return (
        <>
          <Field label="Which cohorts?">
            <PillPicker options={options.cohorts} value={s.cohortIds} onChange={(cohortIds) => onChange({ ...s, cohortIds })} searchable />
          </Field>
          <Field label="Status">
            <div className="flex flex-wrap gap-1.5">
              <TypeChip active={s.statuses.length === 0} onClick={() => onChange({ ...s, statuses: [] })}>
                Any
              </TypeChip>
              {COHORT_STATUSES.map((st) => (
                <TypeChip key={st} active={s.statuses.includes(st)} onClick={() => onChange({ ...s, statuses: toggle(s.statuses, st) })}>
                  {st[0] + st.slice(1).toLowerCase()}
                </TypeChip>
              ))}
            </div>
          </Field>
        </>
      );
    default:
      return null;
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

/** Selectable pills with counts. Nothing selected = any. */
function PillPicker({
  options,
  value,
  onChange,
  searchable,
}: {
  options: KlymbOption[];
  value: string[];
  onChange: (v: string[]) => void;
  searchable?: boolean;
}) {
  const [q, setQ] = useState("");
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  if (options.length === 0) return <p className="text-xs text-muted-foreground">None in Klymb yet.</p>;
  return (
    <div className="space-y-2">
      {searchable && options.length > 6 && (
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-8 max-w-xs py-1 text-xs" />
      )}
      <div className="flex flex-wrap gap-1.5">
        <TypeChip active={value.length === 0} onClick={() => onChange([])}>
          Any
        </TypeChip>
        {shown.map((o) => (
          <TypeChip key={o.id} active={value.includes(o.id)} onClick={() => onChange(toggle(value, o.id))}>
            {o.label}
            <span className="ml-1.5 tabular-nums opacity-60">{o.count.toLocaleString()}</span>
          </TypeChip>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Extra filters
// ---------------------------------------------------------------------------

function ExtraFilter({
  meta,
  onRemove,
  children,
}: {
  meta: { label: string; icon: Icon };
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/70 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <meta.icon className="h-4 w-4 text-muted-foreground" />
          {meta.label}
        </div>
        <button
          type="button"
          onClick={onRemove}
          title="Remove filter"
          className="rounded-md p-1 text-muted-foreground hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/30"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {children}
    </div>
  );
}

function ExtraFilterBody({
  k,
  filter,
  update,
  options,
}: {
  k: ExtraKey;
  filter: KlymbFilter;
  update: (p: Partial<KlymbFilter>) => void;
  options: KlymbFilterOptions;
}) {
  switch (k) {
    case "grad":
      return (
        <GradYears
          value={filter.graduationYears}
          years={options.graduationYears}
          onChange={(graduationYears) => update({ graduationYears })}
        />
      );
    case "college":
      return (
        <IncludeExclude
          field="college"
          value={filter.colleges}
          onChange={(colleges) => update({ colleges })}
          placeholder="Type a college, e.g. abes"
        />
      );
    case "company":
      return (
        <IncludeExclude
          field="company"
          value={filter.companies}
          onChange={(companies) => update({ companies })}
          placeholder="Type a company, e.g. exl"
        />
      );
    case "city":
      return (
        <MultiSuggest
          field="city"
          value={filter.cities}
          onChange={(cities) => update({ cities })}
          placeholder="Type a city or state, e.g. noida"
        />
      );
    case "signup":
      return (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">From</span>
          <Input
            type="date"
            value={filter.signedUpFrom ?? ""}
            onChange={(e) => update({ signedUpFrom: e.target.value || undefined })}
            className="w-auto"
          />
          <span className="text-muted-foreground">to</span>
          <Input
            type="date"
            value={filter.signedUpTo ?? ""}
            onChange={(e) => update({ signedUpTo: e.target.value || undefined })}
            className="w-auto"
          />
        </div>
      );
    case "utm":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Source">
            <MultiSuggest
              field="utm_source"
              value={filter.utmSources}
              onChange={(utmSources) => update({ utmSources })}
              placeholder="e.g. instagram"
            />
          </Field>
          <Field label="Campaign">
            <MultiSuggest
              field="utm_campaign"
              value={filter.utmCampaigns}
              onChange={(utmCampaigns) => update({ utmCampaigns })}
              placeholder="e.g. oct-hackathon"
            />
          </Field>
        </div>
      );
    case "openToWork":
      return <p className="text-xs text-muted-foreground">Only people who marked themselves as open to work.</p>;
  }
}

/** Graduation years: tick years in a searchable list, or use a quick pick. */
function GradYears({ value, years, onChange }: { value: number[]; years: number[]; onChange: (v: number[]) => void }) {
  const thisYear = new Date().getFullYear();
  const range = (lo: number, hi: number) => years.filter((y) => y >= lo && y <= hi);
  const quick: [string, number[]][] = [
    [`${thisYear}`, [thisYear]],
    [`${thisYear + 1}`, [thisYear + 1]],
    [`${thisYear}–${thisYear + 2}`, range(thisYear, thisYear + 2)],
    ["Already graduated", range(0, thisYear - 1)],
  ];
  const same = (a: number[], b: number[]) => a.length === b.length && a.every((y) => b.includes(y));
  const yearOptions = useMemo(() => [...years].sort((a, b) => b - a).map((y) => ({ value: String(y) })), [years]);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {quick.map(([label, ys]) => (
          <TypeChip
            key={label}
            active={value.length > 0 && same(value, ys)}
            onClick={() => onChange(same(value, ys) ? [] : ys)}
          >
            {label}
          </TypeChip>
        ))}
      </div>
      <MultiSuggest
        value={value.map(String)}
        onChange={(v) => onChange(v.map(Number).filter(Number.isFinite).sort((a, b) => b - a))}
        staticOptions={yearOptions}
        placeholder="Or pick years — type e.g. 2026"
        allowCustom={false}
      />
      {value.length > 0 && <p className="text-xs text-muted-foreground">Selected: {formatYears(value)}</p>}
    </div>
  );
}

function IncludeExclude({
  field,
  value,
  onChange,
  placeholder,
}: {
  field: SuggestFieldName;
  value: { include: string[]; exclude: string[] };
  onChange: (v: { include: string[]; exclude: string[] }) => void;
  placeholder: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Any of these">
        <MultiSuggest
          field={field}
          value={value.include}
          onChange={(include) => onChange({ ...value, include })}
          placeholder={placeholder}
        />
      </Field>
      <Field label="But not these">
        <MultiSuggest
          field={field}
          value={value.exclude}
          onChange={(exclude) => onChange({ ...value, exclude })}
          placeholder="optional"
          tone="exclude"
        />
      </Field>
    </div>
  );
}

type SuggestFieldName = "college" | "company" | "city" | "utm_source" | "utm_campaign";
type SuggestRow = { value: string; count?: number };

/**
 * Multi-select with search. Type 2+ letters and matching values from Klymb
 * (with how many people have each) appear with checkboxes; tick as many as
 * you like. With `staticOptions` the list is local and opens on focus.
 * Selected values match any name that contains them, ignoring case.
 */
function MultiSuggest({
  field,
  value,
  onChange,
  placeholder,
  tone = "default",
  staticOptions,
  allowCustom = true,
}: {
  field?: SuggestFieldName;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  tone?: "default" | "exclude";
  staticOptions?: SuggestRow[];
  allowCustom?: boolean;
}) {
  const MIN = staticOptions ? 0 : 2;
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<SuggestRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const q = text.trim();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  // Fetch matches 250 ms after typing stops; a slower, older answer is dropped.
  useEffect(() => {
    setActive(0);
    if (staticOptions) {
      setRows(q ? staticOptions.filter((o) => o.value.toLowerCase().includes(q.toLowerCase())) : staticOptions);
      return;
    }
    if (q.length < MIN || !field) {
      seq.current++;
      setRows([]);
      setLoading(false);
      return;
    }
    const mine = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const res = await suggestKlymbFilterValues(field, q);
      if (mine !== seq.current) return;
      setRows(res);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q, field, staticOptions, MIN]);

  const isOn = (v: string) => value.some((x) => x.toLowerCase() === v.toLowerCase());
  const toggleValue = (v: string) =>
    onChange(isOn(v) ? value.filter((x) => x.toLowerCase() !== v.toLowerCase()) : [...value, v]);
  const showCustom =
    allowCustom && q.length >= Math.max(MIN, 1) && !rows.some((r) => r.value.toLowerCase() === q.toLowerCase());
  // Keyboard order: the "anything containing" row first, then the matches.
  const entries: SuggestRow[] = [...(showCustom ? [{ value: q }] : []), ...rows];

  const chip =
    tone === "exclude"
      ? "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200"
      : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200";

  return (
    <div ref={boxRef} className="relative">
      <div
        onClick={() => {
          inputRef.current?.focus();
          setOpen(true);
        }}
        className={cn(
          "flex min-h-[40px] cursor-text flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1",
          open ? "border-emerald-500 ring-2 ring-emerald-500/20" : "border-input",
        )}
      >
        {value.map((v) => (
          <span key={v} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs", chip)}>
            {v}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(value.filter((x) => x !== v));
              }}
              aria-label={`Remove ${v}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={text}
          placeholder={value.length ? "Add more…" : placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, Math.max(entries.length - 1, 0)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const pick = entries[active];
              if (pick) toggleValue(pick.value);
            } else if (e.key === "Escape") {
              setOpen(false);
            } else if (e.key === "Backspace" && !text && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          className="min-w-[140px] flex-1 bg-transparent py-1 text-sm outline-none"
        />
        {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
      </div>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-xl border border-border bg-white shadow-lg dark:bg-slate-900">
          {q.length < MIN ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">Type at least {MIN} letters to search Klymb.</div>
          ) : (
            <ul className="max-h-64 overflow-y-auto py-1">
              {entries.map((r, i) => {
                const custom = showCustom && i === 0;
                const on = isOn(r.value);
                return (
                  <li key={`${custom ? "custom:" : ""}${r.value}`}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => toggleValue(r.value)}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm",
                        i === active && "bg-slate-50 dark:bg-slate-800",
                      )}
                    >
                      <span
                        className={cn(
                          "grid h-4 w-4 shrink-0 place-items-center rounded border",
                          on
                            ? tone === "exclude"
                              ? "border-rose-500 bg-rose-500 text-white"
                              : "border-emerald-500 bg-emerald-500 text-white"
                            : "border-slate-300 dark:border-slate-600",
                        )}
                      >
                        {on && <Check className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {custom ? (
                          <>
                            Anything containing &ldquo;<b>{r.value}</b>&rdquo;
                          </>
                        ) : (
                          r.value
                        )}
                      </span>
                      {r.count !== undefined && (
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {r.count.toLocaleString()} {r.count === 1 ? "person" : "people"}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
              {loading && rows.length === 0 && (
                <li className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching Klymb…
                </li>
              )}
              {!loading && entries.length === 0 && (
                <li className="px-3 py-2 text-xs text-muted-foreground">No matches in Klymb.</li>
              )}
            </ul>
          )}
          <div className="flex items-center justify-between border-t border-border/60 bg-slate-50/80 px-3 py-1.5 text-xs text-muted-foreground dark:bg-slate-800/40">
            <span>
              {value.length} selected
              {value.length > 0 && (
                <button type="button" onClick={() => onChange([])} className="ml-2 text-rose-600 hover:underline">
                  Clear
                </button>
              )}
            </span>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setText("");
              }}
              className="font-medium text-emerald-700 hover:underline dark:text-emerald-300"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

function initials(name: string | null, email: string): string {
  const src = (name ?? email).trim();
  const parts = src.split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]![0] : "")).toUpperCase() || "?";
}

function PreviewPanel({
  preview,
  error,
  loading,
  summary,
}: {
  preview: KlymbPreview | null;
  error: string | null;
  loading: boolean;
  summary: string[];
}) {
  const [tab, setTab] = useState<"people" | "colleges" | "companies">("people");
  const [showAll, setShowAll] = useState(false);
  const sensitive = preview ? preview.byType.PROFESSIONAL + preview.byType.RECRUITER : 0;

  return (
    <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-5 text-white">
          <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-white/80">
            This list reaches
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
          <div className={cn("mt-1 flex items-baseline gap-2 transition-opacity", loading && "opacity-70")}>
            <span className="text-4xl font-semibold tabular-nums">{preview ? preview.total.toLocaleString() : "—"}</span>
            <span className="text-sm text-white/80">people</span>
          </div>
          {preview && preview.total > 0 && (
            <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-white/20">
              {USER_TYPES.map((t) =>
                preview.byType[t] > 0 ? (
                  <div
                    key={t}
                    className={TYPE_DOT[t]}
                    style={{ width: `${(preview.byType[t] / preview.total) * 100}%` }}
                    title={`${USER_TYPE_LABELS[t]}: ${preview.byType[t]}`}
                  />
                ) : null,
              )}
            </div>
          )}
        </div>

        <div className="space-y-4 p-4">
          {error && (
            <div className="rounded-md bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>
          )}

          {preview && (
            <div className="grid grid-cols-2 gap-2">
              {USER_TYPES.map((t) => (
                <div key={t} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className={cn("h-2 w-2 rounded-full", TYPE_DOT[t])} />
                    {USER_TYPE_LABELS[t]}
                  </div>
                  <div className="text-lg font-semibold tabular-nums">{preview.byType[t].toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}

          {sensitive > 0 && preview && (
            <div className="flex gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                Includes <b>{preview.byType.PROFESSIONAL}</b> professionals and <b>{preview.byType.RECRUITER}</b> recruiters.
                If this mail is only for students, choose <b>Students</b> under &quot;Type of person&quot;.
              </span>
            </div>
          )}

          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">In plain words</div>
            <ul className="space-y-1 text-xs">
              {summary.map((line) => (
                <li key={line} className="flex gap-1.5">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-500" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {preview && preview.total > 0 && (
        <div className="rounded-lg border border-border bg-card shadow-sm">
          <div className="flex border-b border-border/60 px-2 pt-2">
            {(
              [
                ["people", "Newest people"],
                ["colleges", "Colleges"],
                ["companies", "Companies"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={cn(
                  "-mb-px border-b-2 px-3 py-2 text-xs transition",
                  tab === k
                    ? "border-emerald-500 font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="p-3">
            {tab === "people" && (
              <>
                <ul className="space-y-2">
                  {(showAll ? preview.sample : preview.sample.slice(0, 6)).map((p) => (
                    <li key={p.email} className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          "grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white",
                          TYPE_DOT[p.userType],
                        )}
                      >
                        {initials(p.name, p.email)}
                      </span>
                      <div className="min-w-0 text-xs">
                        <div className="truncate font-medium">{p.name ?? p.email}</div>
                        <div className="truncate text-muted-foreground">
                          {p.company ?? p.college ?? p.email}
                          {p.graduationYear ? ` · ${p.graduationYear}` : ""}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                {preview.sample.length > 6 && (
                  <button
                    type="button"
                    onClick={() => setShowAll((s) => !s)}
                    className="mt-2 text-xs text-emerald-700 hover:underline dark:text-emerald-300"
                  >
                    {showAll ? "Show fewer" : `Show ${preview.sample.length - 6} more`}
                  </button>
                )}
              </>
            )}
            {tab !== "people" && (
              <TopBars rows={tab === "colleges" ? preview.topColleges : preview.topCompanies} total={preview.total} />
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

function TopBars({ rows, total }: { rows: { name: string; count: number }[]; total: number }) {
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">Not known for these people.</p>;
  const max = rows[0]!.count;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.name} className="text-xs">
          <div className="flex justify-between gap-2">
            <span className="truncate">{r.name}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {r.count.toLocaleString()} · {Math.round((r.count / total) * 100)}%
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${(r.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
