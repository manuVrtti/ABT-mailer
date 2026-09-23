import Link from "next/link";
import { Palette, FileText, ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader, Badge, Button, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Marketing templates" };

// Rotating soft-gradient tiles for template cards so they don't all look the same.
const TILE_GRADIENTS = [
  "from-indigo-50 to-violet-100 dark:from-indigo-950/40 dark:to-violet-950/30",
  "from-emerald-50 to-teal-100 dark:from-emerald-950/40 dark:to-teal-950/30",
  "from-amber-50 to-orange-100 dark:from-amber-950/40 dark:to-orange-950/30",
  "from-rose-50 to-pink-100 dark:from-rose-950/40 dark:to-pink-950/30",
  "from-sky-50 to-cyan-100 dark:from-sky-950/40 dark:to-cyan-950/30",
];
const TILE_ACCENTS = [
  "text-indigo-600 dark:text-indigo-300",
  "text-emerald-600 dark:text-emerald-300",
  "text-amber-600 dark:text-amber-300",
  "text-rose-600 dark:text-rose-300",
  "text-sky-600 dark:text-sky-300",
];

export default async function MarketingTemplatesPage() {
  const templates = await db.emailTemplate.findMany({ orderBy: { updatedAt: "desc" } });
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((t, i) => {
            const grad = TILE_GRADIENTS[i % TILE_GRADIENTS.length];
            const accent = TILE_ACCENTS[i % TILE_ACCENTS.length];
            return (
              <Link
                key={t.id}
                href={`/marketing/templates/${t.id}`}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-border/60 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:bg-slate-900/60"
              >
                <div className={`bg-gradient-to-br ${grad} p-6`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className={`grid h-11 w-11 place-items-center rounded-lg bg-white/70 dark:bg-slate-900/50 ${accent}`}>
                      <FileText className="h-5 w-5" />
                    </div>
                    <Badge tone="muted">{t.category}</Badge>
                  </div>
                  <div className="mt-4 line-clamp-1 text-base font-semibold">{t.name}</div>
                  <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.subject}</div>
                </div>
                <div className="flex items-center justify-between px-4 py-3 text-[11px] text-muted-foreground">
                  <span>Updated {t.updatedAt.toISOString().slice(0, 10)}</span>
                  <span className={`inline-flex items-center gap-1 font-medium ${accent} opacity-0 transition group-hover:opacity-100`}>
                    Open <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
