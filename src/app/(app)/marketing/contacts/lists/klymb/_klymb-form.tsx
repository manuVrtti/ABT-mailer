"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, Loader2, Plus, Trash2, Users } from "lucide-react";
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  COHORT_STATUSES,
  SOURCE_LABELS,
  USER_TYPES,
  USER_TYPE_LABELS,
  type KlymbFilter,
  type KlymbSource,
  type SourceKind,
  type UserType,
} from "@/server/klymb/filter";
import type { KlymbFilterOptions, KlymbOption } from "@/server/klymb/options";
import type { KlymbPreview } from "@/server/klymb/people";
import { ColorPicker } from "../new/_color-picker";
import { CONTACT_LIST_COLORS } from "../_constants";
import { createKlymbList, previewKlymbListFilter, updateKlymbList } from "../klymb-actions";

const SOURCE_KINDS = Object.keys(SOURCE_LABELS) as SourceKind[];

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

const TYPE_TONE: Record<UserType, string> = {
  STUDENT: "bg-emerald-500",
  PROFESSIONAL: "bg-sky-500",
  RECRUITER: "bg-violet-500",
  UNKNOWN: "bg-slate-400",
};

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
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const [preview, setPreview] = useState<KlymbPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const seq = useRef(0);
  const filterJson = useMemo(() => JSON.stringify(filter), [filter]);

  // Re-count 700 ms after the last change; a slower, older answer never
  // overwrites a newer one.
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
      } else {
        setPreviewError(res.error);
      }
    }, 700);
    return () => clearTimeout(t);
  }, [filterJson]);

  const update = (patch: Partial<KlymbFilter>) => setFilter((f) => ({ ...f, ...patch }));

  function save(formData: FormData) {
    setSaveError(null);
    formData.set("filter", filterJson);
    startSave(async () => {
      const res = list ? await updateKlymbList(formData) : await createKlymbList(formData);
      if (res && !res.ok) setSaveError(res.error);
    });
  }

  return (
    <form action={save} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      {list && <input type="hidden" name="id" value={list.id} />}
      <div className="space-y-4">
        <Card className="space-y-4">
          <div>
            <Label htmlFor="name">List name</Label>
            <Input
              id="name"
              name="name"
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Hackathon Oct 2026 — students who didn't submit"
            />
          </div>
          <div>
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              name="description"
              rows={2}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="font-sans text-sm"
            />
          </div>
          <div>
            <Label>Color</Label>
            <ColorPicker options={[...CONTACT_LIST_COLORS]} defaultValue={list?.color ?? "sky"} />
          </div>
        </Card>

        <Card className="space-y-3">
          <SectionTitle step="1" title="Start from" hint="Everyone in ANY of these groups." />
          <SourceList
            sources={filter.sources}
            options={options}
            onChange={(sources) => update({ sources })}
            minOne
          />
        </Card>

        <Card className="space-y-3">
          <SectionTitle
            step="2"
            title="But leave out anyone who is"
            hint="e.g. everyone who already registered for this week's workshop."
          />
          <SourceList sources={filter.exclude} options={options} onChange={(exclude) => update({ exclude })} />
        </Card>

        <Card className="space-y-5">
          <SectionTitle step="3" title="Narrow down" hint="Every rule you fill in must match. Leave blank to skip it." />

          <div>
            <Label>Type of person</Label>
            <div className="flex flex-wrap gap-2">
              {USER_TYPES.map((t) => (
                <Chip
                  key={t}
                  active={filter.userTypes.includes(t)}
                  onClick={() => update({ userTypes: toggle(filter.userTypes, t) })}
                >
                  <span className={cn("mr-1.5 inline-block h-2 w-2 rounded-full", TYPE_TONE[t])} />
                  {USER_TYPE_LABELS[t]}
                </Chip>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              None ticked = every type. Recruiters are counted separately in the preview.
            </p>
          </div>

          <div>
            <Label>Graduation year</Label>
            <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
              {options.graduationYears.map((y) => (
                <Chip
                  key={y}
                  small
                  active={filter.graduationYears.includes(y)}
                  onClick={() => update({ graduationYears: toggle(filter.graduationYears, y) })}
                >
                  {y}
                </Chip>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TermsField
              label="College contains"
              value={filter.colleges.include}
              onChange={(include) => update({ colleges: { ...filter.colleges, include } })}
              placeholder="ABES, KIET"
            />
            <TermsField
              label="College does NOT contain"
              value={filter.colleges.exclude}
              onChange={(exclude) => update({ colleges: { ...filter.colleges, exclude } })}
            />
            <TermsField
              label="Company contains"
              value={filter.companies.include}
              onChange={(include) => update({ companies: { ...filter.companies, include } })}
              placeholder="EXL, Accenture"
            />
            <TermsField
              label="Company does NOT contain"
              value={filter.companies.exclude}
              onChange={(exclude) => update({ companies: { ...filter.companies, exclude } })}
            />
            <TermsField
              label="City or state contains"
              value={filter.cities}
              onChange={(cities) => update({ cities })}
              placeholder="Noida, Delhi"
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Signed up from</Label>
                <Input
                  type="date"
                  value={filter.signedUpFrom ?? ""}
                  onChange={(e) => update({ signedUpFrom: e.target.value || undefined })}
                />
              </div>
              <div>
                <Label>Signed up to</Label>
                <Input
                  type="date"
                  value={filter.signedUpTo ?? ""}
                  onChange={(e) => update({ signedUpTo: e.target.value || undefined })}
                />
              </div>
            </div>
            <TermsField
              label="Came from UTM source"
              value={filter.utmSources}
              onChange={(utmSources) => update({ utmSources })}
              suggestions={options.utmSources}
            />
            <TermsField
              label="Came from UTM campaign"
              value={filter.utmCampaigns}
              onChange={(utmCampaigns) => update({ utmCampaigns })}
              suggestions={options.utmCampaigns}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={filter.openToWork}
              onChange={(e) => update({ openToWork: e.target.checked })}
            />
            Only people marked &quot;open to work&quot;
          </label>
        </Card>

        <Card className="space-y-2">
          <SectionTitle step="4" title="Newsletter consent" />
          {(
            [
              ["exclude_opted_out", "Everyone except people who unsubscribed", "Use for event, workshop and hackathon mail."],
              ["only_opted_in", "Only people subscribed to the newsletter", "Use for pure promotions."],
            ] as const
          ).map(([value, title, hint]) => (
            <label key={value} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="consent"
                className="mt-1 h-4 w-4"
                checked={filter.consent === value}
                onChange={() => update({ consent: value })}
              />
              <span>
                {title}
                <span className="block text-xs text-muted-foreground">{hint}</span>
              </span>
            </label>
          ))}
          <p className="text-xs text-muted-foreground">
            People who unsubscribed in Klymb, and anyone on this app&apos;s suppression list, are never mailed.
          </p>
        </Card>

        <div className="flex items-center justify-end gap-3">
          {saveError && <span className="text-sm text-destructive">{saveError}</span>}
          <Button as="a" variant="secondary" href={list ? `/marketing/contacts/lists/${list.id}` : "/marketing/contacts/lists"}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Saving &amp; loading people…
              </>
            ) : list ? (
              "Save & refresh list"
            ) : (
              "Create list"
            )}
          </Button>
        </div>
      </div>

      <PreviewPanel preview={preview} error={previewError} loading={previewing} />
    </form>
  );
}

function SectionTitle({ step, title, hint }: { step: string; title: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
        {step}
      </span>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  small,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center rounded-full border transition",
        small ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
        active
          ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
          : "border-border bg-white text-muted-foreground hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800",
      )}
    >
      {children}
    </button>
  );
}

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

/** Comma-separated words, kept as typed until the field loses focus. */
function TermsField({
  label,
  value,
  onChange,
  placeholder,
  suggestions,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  suggestions?: KlymbOption[];
}) {
  const [text, setText] = useState(value.join(", "));
  const listId = useMemo(() => `dl-${label.replace(/\W+/g, "-")}`, [label]);
  const commit = (t: string) =>
    onChange(Array.from(new Set(t.split(",").map((s) => s.trim()).filter(Boolean))));
  return (
    <div>
      <Label>{label}</Label>
      <Input
        value={text}
        placeholder={placeholder ?? "comma-separated"}
        list={suggestions ? listId : undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit((e.target as HTMLInputElement).value);
          }
        }}
      />
      {suggestions && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s.id} value={s.id}>{`${s.count} people`}</option>
          ))}
        </datalist>
      )}
    </div>
  );
}

function SourceList({
  sources,
  options,
  onChange,
  minOne,
}: {
  sources: KlymbSource[];
  options: KlymbFilterOptions;
  onChange: (s: KlymbSource[]) => void;
  minOne?: boolean;
}) {
  const [adding, setAdding] = useState<SourceKind>("hackathon");
  return (
    <div className="space-y-3">
      {sources.map((s, i) => (
        <div key={i} className="rounded-lg border border-border/70 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium">
              {i > 0 && <span className="mr-2 text-xs font-semibold text-emerald-600">OR</span>}
              {SOURCE_LABELS[s.kind]}
            </div>
            {!(minOne && sources.length === 1) && (
              <button
                type="button"
                onClick={() => onChange(sources.filter((_, j) => j !== i))}
                className="rounded p-1 text-muted-foreground hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/30"
                title="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
          <SourceOptions
            source={s}
            options={options}
            onChange={(next) => onChange(sources.map((x, j) => (j === i ? next : x)))}
          />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={adding} onChange={(e) => setAdding(e.target.value as SourceKind)} className="w-auto">
          {SOURCE_KINDS.map((k) => (
            <option key={k} value={k}>
              {SOURCE_LABELS[k]}
            </option>
          ))}
        </Select>
        <Button type="button" variant="secondary" size="sm" onClick={() => onChange([...sources, newSource(adding)])}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add group
        </Button>
      </div>
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
  const submittedSelect = (value: "any" | "yes" | "no", set: (v: "any" | "yes" | "no") => void) => (
    <div>
      <Label>Submission</Label>
      <Select value={value} onChange={(e) => set(e.target.value as "any" | "yes" | "no")}>
        <option value="any">Any</option>
        <option value="yes">Submitted</option>
        <option value="no">Registered but did NOT submit</option>
      </Select>
    </div>
  );

  switch (s.kind) {
    case "hackathon":
      return (
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <MultiCheck label="Which hackathons" options={options.hackathons} value={s.eventIds} onChange={(eventIds) => onChange({ ...s, eventIds })} />
          <div className="space-y-3">
            {submittedSelect(s.submitted, (submitted) => onChange({ ...s, submitted }))}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={s.leadersOnly}
                onChange={(e) => onChange({ ...s, leadersOnly: e.target.checked })}
              />
              Team leaders only
            </label>
          </div>
        </div>
      );
    case "videothon":
      return (
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <MultiCheck label="Which VideoThons" options={options.videothons} value={s.eventIds} onChange={(eventIds) => onChange({ ...s, eventIds })} />
          <div className="space-y-3">
            {submittedSelect(s.submitted, (submitted) => onChange({ ...s, submitted }))}
            <div>
              <Label>Working or learning</Label>
              <Select value={s.employment} onChange={(e) => onChange({ ...s, employment: e.target.value as typeof s.employment })}>
                <option value="any">Any</option>
                <option value="LEARNER">Learners</option>
                <option value="WORKING">Working</option>
              </Select>
            </div>
          </div>
        </div>
      );
    case "workshop":
      return (
        <div className="mt-2">
          <MultiCheck label="Which workshops" options={options.workshops} value={s.eventIds} onChange={(eventIds) => onChange({ ...s, eventIds })} />
        </div>
      );
    case "cohort":
      return (
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <MultiCheck label="Which cohorts" options={options.cohorts} value={s.cohortIds} onChange={(cohortIds) => onChange({ ...s, cohortIds })} />
          <div>
            <Label>Enrollment status</Label>
            <div className="flex flex-wrap gap-1.5">
              {COHORT_STATUSES.map((st) => (
                <Chip key={st} small active={s.statuses.includes(st)} onClick={() => onChange({ ...s, statuses: toggle(s.statuses, st) })}>
                  {st.toLowerCase()}
                </Chip>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">None ticked = any status.</p>
          </div>
        </div>
      );
    default:
      return null;
  }
}

function MultiCheck({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: KlymbOption[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-border/70 p-2">
        {options.length === 0 && <div className="text-xs text-muted-foreground">Nothing in Klymb yet.</div>}
        {options.map((o) => (
          <label key={o.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0"
                checked={value.includes(o.id)}
                onChange={() => onChange(toggle(value, o.id))}
              />
              <span className="truncate">{o.label}</span>
            </span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{o.count.toLocaleString()}</span>
          </label>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">None ticked = any.</p>
    </div>
  );
}

function PreviewPanel({
  preview,
  error,
  loading,
}: {
  preview: KlymbPreview | null;
  error: string | null;
  loading: boolean;
}) {
  return (
    <aside className="lg:sticky lg:top-4 lg:self-start">
      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Who this list reaches now</div>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        {error && <div className="rounded-md bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
        {!preview && !error && <div className="text-sm text-muted-foreground">Counting…</div>}
        {preview && (
          <div className={cn("space-y-4 transition-opacity", loading && "opacity-60")}>
            <div className="flex items-baseline gap-2">
              <Users className="h-5 w-5 self-center text-emerald-600" />
              <span className="text-3xl font-semibold tabular-nums">{preview.total.toLocaleString()}</span>
              <span className="text-sm text-muted-foreground">people</span>
            </div>

            <div className="space-y-1.5">
              {USER_TYPES.map((t) => {
                const n = preview.byType[t];
                const pct = preview.total ? (n / preview.total) * 100 : 0;
                return (
                  <div key={t} className="text-xs">
                    <div className="flex justify-between">
                      <span>{USER_TYPE_LABELS[t]}</span>
                      <span className="tabular-nums text-muted-foreground">{n.toLocaleString()}</span>
                    </div>
                    <div className="mt-0.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className={cn("h-1.5 rounded-full", TYPE_TONE[t])} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {(preview.byType.PROFESSIONAL > 0 || preview.byType.RECRUITER > 0) && (
              <div className="flex gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  Includes {preview.byType.PROFESSIONAL.toLocaleString()} professional
                  {preview.byType.PROFESSIONAL === 1 ? "" : "s"} and {preview.byType.RECRUITER.toLocaleString()} recruiter
                  {preview.byType.RECRUITER === 1 ? "" : "s"}. Untick them under &quot;Type of person&quot; if this mail is
                  only for students.
                </span>
              </div>
            )}

            <TopList title="Top colleges" rows={preview.topColleges} />
            <TopList title="Top companies" rows={preview.topCompanies} />

            {preview.sample.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">Newest {preview.sample.length}</div>
                <ul className="max-h-72 divide-y divide-border overflow-y-auto text-xs">
                  {preview.sample.map((p) => (
                    <li key={p.email} className="py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{p.name ?? p.email}</span>
                        <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] text-white", TYPE_TONE[p.userType])}>
                          {USER_TYPE_LABELS[p.userType].replace(/s$/, "")}
                        </span>
                      </div>
                      <div className="truncate text-muted-foreground">
                        {p.email}
                        {(p.company ?? p.college) ? ` · ${p.company ?? p.college}` : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>
    </aside>
  );
}

function TopList({ title, rows }: { title: string; rows: { name: string; count: number }[] }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted-foreground">{title}</div>
      <ul className="space-y-0.5 text-xs">
        {rows.slice(0, 5).map((r) => (
          <li key={r.name} className="flex justify-between gap-2">
            <span className="truncate">{r.name}</span>
            <span className="tabular-nums text-muted-foreground">{r.count.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
