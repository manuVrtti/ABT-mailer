import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { EmailEventType, EmailType } from "@prisma/client";
import { db } from "@/lib/db";
import { Card } from "@/components/ui";
import { renderCampaignHtml } from "@/server/campaigns/launcher";
import { eventDetail, type LogEvent } from "@/server/logs/query";
import { EventPill, fmtIst } from "../_shared";
import { LogActions } from "../_log-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Email log" };

const FROM_TYPE: Record<EmailEventType, LogEvent | null> = {
  SEND: "sent",
  DELIVERY: "delivered",
  OPEN: "opened",
  CLICK: "clicked",
  BOUNCE: "bounced",
  COMPLAINT: "complained",
  REJECT: "rejected",
  RENDERING_FAILURE: "failed",
};

type Step = { at: Date; event: LogEvent | "requested"; label: string; lines: string[] };

export default async function EmailLogDetailPage({ params }: { params: { jobId: string } }) {
  const job = await db.emailJob.findUnique({
    where: { id: params.jobId },
    include: {
      campaign: {
        select: { id: true, name: true, slug: true, htmlSnapshot: true, customHtml: true, template: { select: { html: true } } },
      },
      events: { orderBy: { createdAt: "asc" }, select: { id: true, type: true, createdAt: true, raw: true } },
    },
  });
  if (!job) notFound();

  // Campaign bodies are rendered at delivery time, so rebuild the same HTML.
  let html = job.renderedHtml;
  if (html === null && job.campaign) {
    const tpl = job.campaign.htmlSnapshot ?? job.campaign.customHtml ?? job.campaign.template?.html;
    if (tpl) {
      html = renderCampaignHtml(tpl, (job.variables ?? {}) as Record<string, string>, {
        email: job.recipientEmail,
        campaignId: job.campaign.id,
        slug: job.campaign.slug,
      });
    }
  }
  const wiped = job.subject === "[redacted after send]";

  let firstOpenSeen = false;
  const steps: Step[] = [
    { at: job.createdAt, event: "requested", label: "Requested", lines: [] },
    ...job.events.flatMap((e): Step[] => {
      const ev = FROM_TYPE[e.type];
      if (!ev) return [];
      const r = (e.raw ?? {}) as Record<string, any>;
      const lines: string[] = [];
      const detail = eventDetail(e.type, e.raw);
      if (detail) lines.push(detail);
      const ip = r.open?.ipAddress ?? r.click?.ipAddress;
      if (ip) lines.push(ip);
      const ua = r.open?.userAgent ?? r.click?.userAgent;
      if (ua) lines.push(ua);
      let label = ev === "sent" ? "Sent" : ev.charAt(0).toUpperCase() + ev.slice(1);
      if (ev === "opened" && !firstOpenSeen) {
        firstOpenSeen = true;
        label = "First opening";
      }
      return [{ at: e.createdAt, event: ev, label, lines }];
    }),
  ];
  if (job.status === "FAILED" || job.status === "SKIPPED") {
    steps.push({
      at: job.updatedAt,
      event: job.status === "FAILED" ? "failed" : "skipped",
      label: job.status === "FAILED" ? "Failed" : "Skipped",
      lines: [[job.errorCode, job.errorMessage].filter(Boolean).join(" · ")].filter(Boolean),
    });
  }
  steps.sort((a, b) => b.at.getTime() - a.at.getTime());

  const meta: [string, React.ReactNode][] = [
    ["Recipient (To)", job.recipientEmail],
    ["From", job.fromName ? `${job.fromName} <${job.fromEmail}>` : job.fromEmail],
    ["Reply-to", job.replyTo ?? "—"],
    [
      "Type",
      job.campaign ? (
        <Link href={`/marketing/campaigns/${job.campaign.id}`} className="text-emerald-700 hover:underline dark:text-emerald-300">
          Campaign · {job.campaign.name}
        </Link>
      ) : (
        `${job.emailType === EmailType.TRANSACTIONAL ? "Transactional" : "Marketing"} · ${job.eventType ?? job.templateKey ?? "—"}`
      ),
    ],
    ["Category", job.category],
    ["Status", job.status],
    ["Message ID", job.providerMessageId ?? "—"],
    ["Job ID", job.id],
  ];

  return (
    <div className="space-y-4">
      <Link href="/transactional/logs" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        All logs
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold">{job.subject}</h1>
        <LogActions jobId={job.id} canDelete={!job.campaignId} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            {meta.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</dt>
                <dd className="break-all text-sm">{v}</dd>
              </div>
            ))}
          </dl>

          {wiped ? (
            <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-4 text-sm text-muted-foreground dark:bg-slate-800/50">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              This email held a one-time code, reset link or password. Its content was wiped after sending, so there is
              nothing to preview.
            </div>
          ) : html ? (
            <iframe
              title="Email content"
              sandbox=""
              srcDoc={html}
              className="h-[640px] w-full rounded-xl border border-border bg-white"
            />
          ) : (
            <p className="text-sm text-muted-foreground">No content stored for this email.</p>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold">Timeline</h2>
          <ol className="space-y-4 border-l border-border pl-4">
            {steps.map((s, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-emerald-500" />
                {s.event === "requested" ? (
                  <span className="text-sm font-medium">{s.label}</span>
                ) : (
                  <EventPill event={s.event} label={s.label} />
                )}
                <div className="mt-1 text-xs text-muted-foreground">{fmtIst(s.at)}</div>
                {s.lines.map((l, j) => (
                  <div key={j} className="mt-0.5 break-all text-xs">
                    {l}
                  </div>
                ))}
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
