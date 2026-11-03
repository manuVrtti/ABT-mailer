import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { scopeForUser } from "@/server/access/scope";
import { accessForRole, permissionsForRole } from "@/server/access/permissions";
import {
  PEOPLE_FILTERS,
  PEOPLE_SORTS,
  parseSourceKey,
  selectPeople,
  sourceOptions,
  sourcePeople,
  type PeopleFilter,
  type PeopleSort,
} from "@/server/conversions/people";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** The Conversions → People list as shown (same filter, search and sort), with every detail. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [access, perms] = await Promise.all([
    accessForRole(session.user.role),
    permissionsForRole(session.user.role),
  ]);
  if (!access.has("conversions.view") || !perms.has("exports")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const canContact = perms.has("people.contact");

  const url = new URL(req.url);
  const source = parseSourceKey(url.searchParams.get("source") ?? undefined);
  const options = await sourceOptions(await scopeForUser(session.user.id, session.user.role));
  const selected = source && options.find((o) => o.kind === source.kind && o.id === source.id);
  if (!selected) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const show = (url.searchParams.get("show") ?? "all") as PeopleFilter;
  const sort = (url.searchParams.get("sort") ?? "engaged") as PeopleSort;
  const data = await sourcePeople(selected);
  const people = selectPeople(data.people, {
    show: show in PEOPLE_FILTERS ? show : "all",
    sort: sort in PEOPLE_SORTS ? sort : "engaged",
    q: (url.searchParams.get("q") ?? "").slice(0, 100),
  });

  const header = [
    "name",
    "email",
    ...(canContact ? ["phone", "linkedin"] : []),
    "type",
    "college",
    "company",
    "graduation_year",
    "city",
    "first_opened_at",
    "opens",
    "first_clicked_at",
    "clicks",
    "links_clicked",
    "klymb_actions_after",
    "in_klymb",
  ];
  const lines = [header.join(",")];
  for (const p of people) {
    lines.push(
      [
        p.name ?? "",
        p.email,
        ...(canContact ? [p.phone ?? "", p.linkedin ?? ""] : []),
        p.userType && p.userType !== "UNKNOWN" ? p.userType.toLowerCase() : "",
        p.college ?? "",
        p.company ?? "",
        p.graduationYear?.toString() ?? "",
        p.city ?? "",
        p.openedAt?.toISOString() ?? "",
        String(p.opens),
        p.clickedAt?.toISOString() ?? "",
        String(p.clicks),
        p.links.join(" | "),
        p.actions.map((a) => `${a.label} (${a.at.toISOString().slice(0, 10)})`).join(" | "),
        p.inKlymb ? "yes" : "no",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  const slug =
    selected.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "mail";
  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}-people.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function csvCell(v: string): string {
  const safe = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
}
