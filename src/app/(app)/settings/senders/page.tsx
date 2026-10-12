import { AtSign, CheckCircle2, AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader, Card } from "@/components/ui";
import { envBrand } from "@/server/brands";
import { BrandForm, BrandRowActions } from "./_sender-buttons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Senders" };

export default async function SendersPage() {
  const brands = await db.brand.findMany({ orderBy: [{ isDefault: "desc" }, { name: "asc" }] });
  const fallback = envBrand();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Senders"
        icon={AtSign}
        description="Brands you send as. Each is one domain verified in Amazon SES; campaigns pick a From address from here, and unsubscribes are kept per brand."
      />

      {brands.length === 0 && (
        <Card className="text-sm text-muted-foreground">
          No senders yet, so everything sends as the environment sender{" "}
          <b className="text-foreground">
            {fallback.fromName} &lt;{fallback.fromAddresses[0]}&gt;
          </b>
          . Add your brands below.
        </Card>
      )}

      {brands.map((b) => (
        <Card key={b.id} className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">{b.name}</h2>
                {b.isDefault && (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                    Default{b.sesVerified ? "" : " (not used until verified)"}
                  </span>
                )}
                <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{b.key}</code>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {b.domain} · {b.fromAddresses.join(", ")}
              </div>
              <div
                className={`mt-2 flex items-center gap-1.5 text-xs ${b.sesVerified ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}
              >
                {b.sesVerified ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                {b.sesVerified ? "Can send" : "Can't send yet"}
                {b.sesStatus && <span className="text-muted-foreground">— {b.sesStatus}</span>}
                {b.sesCheckedAt && (
                  <span className="text-muted-foreground">
                    · checked {b.sesCheckedAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}
                  </span>
                )}
              </div>
            </div>
            <BrandRowActions id={b.id} isDefault={b.isDefault} canSend={b.sesVerified} />
          </div>
          <details>
            <summary className="cursor-pointer text-sm text-emerald-700 dark:text-emerald-300">Edit</summary>
            <div className="mt-3">
              <BrandForm brand={b} />
            </div>
          </details>
        </Card>
      ))}

      <Card>
        <h2 className="mb-3 text-sm font-semibold">Add a sender</h2>
        <BrandForm />
      </Card>
    </div>
  );
}
