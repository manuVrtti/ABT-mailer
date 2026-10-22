import Link from "next/link";
import { Palette, ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader, Badge, Button, EmptyState } from "@/components/ui";
import { currentScope, templateWhere } from "@/server/access/scope";

export const dynamic = "force-dynamic";
export const metadata = { title: "Marketing templates" };

const UPDATED = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });

export default async function MarketingTemplatesPage() {
  const scope = await currentScope();
  const templates = await db.emailTemplate.findMany({ where: templateWhere(scope), orderBy: { updatedAt: "desc" } });
  const brandName = (key: string | null) => (key ? scope.brands.find((b) => b.key === key)?.name ?? key : "Shared");
  return (
    <div>
      <PageHeader
        title="Marketing templates"
        icon={Palette}
        description="Reusable email designs. Personalization uses {{first_name}}-style tokens."
        actions={<Button as="a" href="/marketing/templates/new">New template</Button>}
      />
      {templates.length === 0 ? (
        <EmptyState
          icon={Palette}
          title="No templates yet"
          description="Design your first template — paste HTML or use the visual editor."
          action={<Button as="a" href="/marketing/templates/new">Create template</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => (
            <Link
              key={t.id}
              href={`/marketing/templates/${t.id}`}
              className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-card transition hover:border-brand-300 hover:shadow-md"
            >
              {/* Live thumbnail of the email, scaled down; not interactive. */}
              <div className="relative h-48 overflow-hidden border-b border-border bg-muted/40">
                <iframe
                  title={`${t.name} preview`}
                  srcDoc={t.html}
                  sandbox=""
                  loading="lazy"
                  tabIndex={-1}
                  className="pointer-events-none absolute left-1/2 top-0 h-[600px] w-[640px] origin-top -translate-x-1/2 scale-[0.5] bg-white"
                />
                <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent" />
              </div>
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="line-clamp-1 font-medium">{t.name}</div>
                  <span className="flex shrink-0 gap-1">
                    <Badge tone={t.brandKey ? "info" : "muted"}>{brandName(t.brandKey)}</Badge>
                    <Badge tone="muted">{t.category}</Badge>
                  </span>
                </div>
                <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{t.subject || "No subject"}</div>
                <div className="mt-auto flex items-center justify-between pt-3 text-xs text-muted-foreground">
                  <span>Updated {UPDATED.format(t.updatedAt)}</span>
                  <span className="inline-flex items-center gap-1 font-medium text-brand-700 opacity-0 transition group-hover:opacity-100 dark:text-brand-300">
                    Open <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
