import Link from "next/link";
import { PageHeader, Card } from "@/components/ui";
import { getServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsIndexPage() {
  const env = getServerEnv();
  const sections = [
    { href: "/settings/account", title: "Your account", desc: "Change your own password." },
    { href: "/settings/users", title: "Users & roles", desc: "Invite teammates and assign admin, marketer, or viewer roles." },
    { href: "/settings/suppressions", title: "Suppressions", desc: "Emails blocked from marketing or transactional sends." },
    { href: "/settings/audit", title: "Audit log", desc: "Sensitive actions logged for compliance and support." },
  ];
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Team, sender identity, deliverability, and integrations." />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        {sections.map((s) => (
          <Link key={s.href} href={s.href} className="block rounded-lg border border-border bg-card p-4 hover:bg-accent">
            <div className="text-sm font-medium">{s.title}</div>
            <div className="mt-1 text-xs text-muted-foreground">{s.desc}</div>
          </Link>
        ))}
      </div>

      <Card>
        <div className="mb-3 text-sm font-medium">Sender identity</div>
        <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
          <Field label="From name" value={env.SES_FROM_NAME} />
          <Field label="From email" value={env.SES_FROM_EMAIL} />
          <Field label="Reply-to" value={env.SES_REPLY_TO ?? "—"} />
          <Field label="AWS region" value={env.AWS_REGION} />
          <Field label="Configuration set" value={env.SES_CONFIGURATION_SET} />
          <Field label="App URL" value={env.NEXT_PUBLIC_APP_URL} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          These values come from server environment variables — change them in the Vercel project settings, not here. Secrets (AWS keys, HMAC secrets) are intentionally not displayed.
        </p>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-xs">{value}</div>
    </div>
  );
}
