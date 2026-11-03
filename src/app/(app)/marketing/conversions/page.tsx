import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Download,
  ExternalLink,
  Eye,
  MousePointerClick,
  Phone,
  RefreshCw,
  Search,
  Target,
  Users,
  X,
} from "lucide-react";
import { Badge, Button, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { cn } from "@/lib/utils";
import { currentScope } from "@/server/access/scope";
import { currentPermissions, requireAccess } from "@/server/access/permissions";
import {
  PEOPLE_FILTERS,
  PEOPLE_SORTS,
  parseSourceKey,
  peopleCounts,
  selectPeople,
  sourceKey,
  sourceOptions,
  sourcePeople,
  type EngagedPerson,
  type PeopleFilter,
  type PeopleSort,
} from "@/server/conversions/people";
import { ConversionsTabs } from "./_tabs";
import { SourcePicker } from "./_picker";

export const dynamic = "force-dynamic";
// First view of a big campaign looks everyone up in Klymb (~10 s).
export const maxDuration = 120;
export const metadata = { title: "Conversions" };

const PAGE_SIZE = 50;
const IST = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const DAY = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const TYPE_LABEL: Record<string, string> = {
  STUDENT: "Student",
  PROFESSIONAL: "Professional",
  RECRUITER: "Recruiter",
};
const control =
  "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

function pick<T extends string>(v: string | undefined, allowed: Record<T, unknown>, fallback: T): T {
  return v && v in allowed ? (v as T) : fallback;
}
const pct = (n: number, of: number) => (of > 0 ? `${((n / of) * 100).toFixed(1)}%` : "—");

/** Show the path of a clicked link, not the tracking parameters. */
function shortLink(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return url;
  }
}

export default async function ConversionsPeoplePage({
  searchParams,
}: {
  searchParams: {
    source?: string;
    show?: string;
    q?: string;
    sort?: string;
    page?: string;
    p?: string;
    refresh?: string;
  };
}) {
  await requireAccess("conversions.view");
  const perms = await currentPermissions();
  const canContact = perms.has("people.contact");
  const canExport = perms.has("exports");

  const options = await sourceOptions(await currentScope());
  const header = (
    <>
      <PageHeader
        title="Conversions"
        icon={Target}
        description="Who opened and clicked each campaign or mail — with their Klymb details — and what they did after."
      />
      <ConversionsTabs active="people" />
    </>
  );
  if (options.length === 0) {
    return (
      <div>
        {header}
        <EmptyState
          icon={Users}
          title="Nothing sent yet"
          description="Once a campaign or mail goes out, the people who open and click it show up here."
        />
      </div>
    );
  }

  const requested = parseSourceKey(searchParams.source);
  const selected = requested
    ? options.find((o) => o.key === sourceKey(requested))
    : (options.find((o) => o.kind === "campaign") ?? options[0]);
  // Unknown id, or a campaign from a brand this person can't see.
  if (!selected) notFound();

  const show = pick<PeopleFilter>(searchParams.show, PEOPLE_FILTERS, "all");
  const sort = pick<PeopleSort>(searchParams.sort, PEOPLE_SORTS, "engaged");
  const q = (searchParams.q ?? "").trim().slice(0, 100);
  const page = Math.max(1, Number(searchParams.page) || 1);

  const data = await sourcePeople(selected, { fresh: searchParams.refresh === "1" });
  const counts = peopleCounts(data.people);
  const list = selectPeople(data.people, { show, q, sort });
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const shown = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  // With a person open, year and city move to the side panel to give the table room.
  const narrow = searchParams.p ? "hidden 2xl:table-cell" : undefined;
  const person = searchParams.p
    ? data.people.find((x) => x.email === searchParams.p!.toLowerCase())
    : undefined;

  const href = (patch: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const merged: Record<string, string | number | undefined> = {
      source: selected.key,
      show: show === "all" ? undefined : show,
      q: q || undefined,
      sort: sort === "engaged" ? undefined : sort,
      page: page > 1 ? page : undefined,
      p: person?.email,
      ...patch,
    };
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "") p.set(k, String(v));
    return `/marketing/conversions?${p.toString()}`;
  };
  const csvHref = `/marketing/conversions/people.csv?${new URLSearchParams({ source: selected.key, show, q, sort }).toString()}`;
  const label = (o: (typeof options)[number]) =>
    `${o.name}${o.at ? ` · ${DAY.format(o.at)}` : ""}${o.kind === "send" ? (o.single ? " · single" : " · bulk") : ""}`;

  return (
    <div>
      {header}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SourcePicker
          value={selected.key}
          campaigns={options
            .filter((o) => o.kind === "campaign")
            .map((o) => ({ key: o.key, label: label(o) }))}
          sends={options.filter((o) => o.kind === "send").map((o) => ({ key: o.key, label: label(o) }))}
        />
        <Link
          href={
            selected.kind === "campaign"
              ? `/marketing/campaigns/${selected.id}`
              : `/marketing/customize/${selected.id}`
          }
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
        >
          Open report <ExternalLink className="h-3 w-3" />
        </Link>
        <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          Details as of {IST.format(data.loadedAt)}
          <Link
            href={href({ refresh: "1", page: undefined })}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-muted"
            title="Look everyone up again"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </Link>
        </span>
      </div>

      {data.klymbError && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Couldn&apos;t read Klymb details right now ({data.klymbError}). Opens and clicks are shown; try
          Refresh in a minute.
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Sent" value={data.sent.toLocaleString()} icon={Users} />
        <StatCard
          label="Opened"
          value={counts.opened.toLocaleString()}
          sub={`${pct(counts.opened, data.sent)} of sent`}
          icon={Eye}
        />
        <StatCard
          label="Clicked"
          value={counts.clicked.toLocaleString()}
          sub={`${pct(counts.clicked, data.sent)} of sent`}
          icon={MousePointerClick}
        />
        <StatCard
          label="Acted in Klymb"
          value={counts.acted.toLocaleString()}
          sub="within 7 days"
          icon={Target}
        />
      </div>

      <form className="mb-3 flex flex-wrap items-center gap-2">
        <input type="hidden" name="source" value={selected.key} />
        {show !== "all" && <input type="hidden" name="show" value={show} />}
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search name, email, college, phone…"
            className={`${control} w-full pl-9`}
          />
        </div>
        <select name="sort" defaultValue={sort} className={control} aria-label="Sort">
          {(Object.keys(PEOPLE_SORTS) as PeopleSort[]).map((k) => (
            <option key={k} value={k}>
              {PEOPLE_SORTS[k]}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {canExport && list.length > 0 && (
          <a
            href={csvHref}
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-muted"
          >
            <Download className="h-4 w-4" /> CSV ({list.length.toLocaleString()})
          </a>
        )}
      </form>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {(Object.keys(PEOPLE_FILTERS) as PeopleFilter[]).map((k) => {
          const n =
            k === "all"
              ? counts.total
              : k === "clicked"
                ? counts.clicked
                : k === "acted"
                  ? counts.acted
                  : data.people.filter((p) => p.opens > 0 && p.clicks === 0).length;
          return (
            <Link
              key={k}
              href={href({ show: k === "all" ? undefined : k, page: undefined, p: undefined })}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition",
                show === k
                  ? "border-brand-500 bg-brand-50 font-medium text-brand-800 dark:bg-brand-950/40 dark:text-brand-200"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {PEOPLE_FILTERS[k]} <span className="tabular-nums opacity-70">{n.toLocaleString()}</span>
            </Link>
          );
        })}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={Search}
          title={data.people.length === 0 ? "No opens or clicks yet" : "Nobody matches"}
          description={
            data.people.length === 0
              ? "People show up here as soon as they open or click."
              : "Try another filter or search."
          }
        />
      ) : (
        <div className={cn("grid gap-4", person && "xl:grid-cols-[minmax(0,1fr)_380px]")}>
          <div>
            <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-card">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">Person</th>
                    <th className="px-3 py-2.5 font-medium">Phone</th>
                    <th className="px-3 py-2.5 font-medium">College / company</th>
                    <th className={cn("px-3 py-2.5 font-medium", narrow)}>Year</th>
                    <th className={cn("px-3 py-2.5 font-medium", narrow)}>City</th>
                    <th className="px-3 py-2.5 font-medium">Opened</th>
                    <th className="px-3 py-2.5 font-medium">Clicked</th>
                    <th className="px-3 py-2.5 font-medium">In Klymb after</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => (
                    <tr
                      key={p.email}
                      className={cn(
                        "border-t border-border align-top hover:bg-muted/40",
                        person?.email === p.email && "bg-brand-50/60 dark:bg-brand-950/20",
                      )}
                    >
                      <td className="max-w-[240px] px-3 py-2.5">
                        <Link href={href({ p: p.email })} className="block hover:underline">
                          <div className="truncate font-medium">{p.name ?? p.email}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {p.name ? p.email : p.inKlymb ? "" : "Not in Klymb"}
                          </div>
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                        {canContact ? (
                          (p.phone ?? <span className="text-muted-foreground">—</span>)
                        ) : (
                          <span className="text-muted-foreground">Hidden</span>
                        )}
                      </td>
                      <td className="max-w-[220px] px-3 py-2.5 text-xs">
                        <div className="truncate">
                          {p.college ?? p.company ?? <span className="text-muted-foreground">—</span>}
                        </div>
                        {p.userType && TYPE_LABEL[p.userType] && (
                          <div className="text-muted-foreground">{TYPE_LABEL[p.userType]}</div>
                        )}
                      </td>
                      <td className={cn("px-3 py-2.5 text-xs tabular-nums", narrow)}>
                        {p.graduationYear ?? "—"}
                      </td>
                      <td className={cn("max-w-[120px] truncate px-3 py-2.5 text-xs", narrow)}>
                        {p.city ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                        {p.openedAt ? (
                          <span title={`First opened ${IST.format(p.openedAt)}`}>
                            {IST.format(p.openedAt)}
                            {p.opens > 1 && <span className="text-muted-foreground"> · {p.opens}×</span>}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="max-w-[200px] px-3 py-2.5 text-xs">
                        {p.clickedAt ? (
                          <>
                            <div className="whitespace-nowrap">
                              {IST.format(p.clickedAt)}
                              {p.clicks > 1 && <span className="text-muted-foreground"> · {p.clicks}×</span>}
                            </div>
                            {p.links[0] && (
                              <div className="truncate text-muted-foreground" title={p.links.join("\n")}>
                                {shortLink(p.links[0])}
                                {p.links.length > 1 && ` +${p.links.length - 1}`}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="max-w-[200px] px-3 py-2.5 text-xs">
                        {p.actions.length ? (
                          <Badge tone="success">
                            {p.actions[0]!.label}
                            {p.actions.length > 1 ? ` +${p.actions.length - 1}` : ""}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {list.length.toLocaleString()} {list.length === 1 ? "person" : "people"}
              </span>
              {pages > 1 && (
                <div className="flex items-center gap-2">
                  {page > 1 && (
                    <Link
                      href={href({ page: page - 1 })}
                      className="rounded border border-border px-2 py-1 hover:bg-muted"
                    >
                      ← Prev
                    </Link>
                  )}
                  <span>
                    Page {page} of {pages}
                  </span>
                  {page < pages && (
                    <Link
                      href={href({ page: page + 1 })}
                      className="rounded border border-border px-2 py-1 hover:bg-muted"
                    >
                      Next →
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>

          {person && <PersonPanel p={person} canContact={canContact} closeHref={href({ p: undefined })} />}
        </div>
      )}
    </div>
  );
}

function PersonPanel({
  p,
  canContact,
  closeHref,
}: {
  p: EngagedPerson;
  canContact: boolean;
  closeHref: string;
}) {
  const facts: [string, React.ReactNode][] = [
    [
      "Email",
      <a key="e" href={`mailto:${p.email}`} className="break-all hover:underline">
        {p.email}
      </a>,
    ],
    [
      "Phone",
      !canContact ? (
        <span className="text-muted-foreground">Hidden</span>
      ) : p.phone ? (
        <a
          href={`tel:${p.phone.replace(/[^\d+]/g, "")}`}
          className="inline-flex items-center gap-1 hover:underline"
        >
          <Phone className="h-3 w-3" /> {p.phone}
        </a>
      ) : (
        "—"
      ),
    ],
    ["College", p.college ?? "—"],
    ["Company", p.company ?? "—"],
    ["Graduation year", p.graduationYear ?? "—"],
    ["City", p.city ?? "—"],
  ];
  if (canContact && p.linkedin) {
    const url = /^https?:\/\//i.test(p.linkedin) ? p.linkedin : `https://${p.linkedin}`;
    facts.push([
      "LinkedIn",
      <a
        key="l"
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-1 break-all text-brand-700 hover:underline dark:text-brand-300"
      >
        <ExternalLink className="h-3 w-3 shrink-0" /> Profile
      </a>,
    ]);
  }
  const timeline = [
    p.sentAt && { at: p.sentAt, text: "Sent" },
    p.deliveredAt && { at: p.deliveredAt, text: "Delivered" },
    p.openedAt && { at: p.openedAt, text: p.opens > 1 ? `Opened (${p.opens} times)` : "Opened" },
    p.clickedAt && { at: p.clickedAt, text: p.clicks > 1 ? `Clicked (${p.clicks} times)` : "Clicked" },
    ...p.actions.map((a) => ({ at: a.at, text: `In Klymb: ${a.label}` })),
  ]
    .filter((x): x is { at: Date; text: string } => Boolean(x))
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  return (
    <aside className="xl:sticky xl:top-4 xl:self-start">
      <Card className="space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold">{p.name ?? p.email}</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {p.userType && TYPE_LABEL[p.userType] && <Badge tone="info">{TYPE_LABEL[p.userType]}</Badge>}
              {!p.inKlymb && <Badge tone="muted">Not in Klymb</Badge>}
            </div>
          </div>
          <Link
            href={closeHref}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Link>
        </div>

        <dl className="space-y-1.5 text-sm">
          {facts.map(([k, v]) => (
            <div key={k} className="flex gap-3">
              <dt className="w-28 shrink-0 text-muted-foreground">{k}</dt>
              <dd className="min-w-0">{v}</dd>
            </div>
          ))}
        </dl>

        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Timeline
          </div>
          <ol className="space-y-2 border-l border-border pl-4 text-sm">
            {timeline.map((t, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-brand-600" />
                <div>{t.text}</div>
                <div className="text-xs text-muted-foreground">{IST.format(t.at)}</div>
              </li>
            ))}
          </ol>
        </div>

        {p.links.length > 0 && (
          <div>
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Links clicked
            </div>
            <ul className="space-y-1 text-xs">
              {p.links.map((l) => (
                <li key={l}>
                  <a
                    href={l}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="break-all text-brand-700 hover:underline dark:text-brand-300"
                  >
                    {shortLink(l)}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </aside>
  );
}
