import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Circle,
  Mail,
  Users,
  Type,
  Palette,
  Pencil,
  X,
  ListChecks,
  Filter,
} from "lucide-react";
import { CampaignStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getServerEnv } from "@/lib/env";
import { Card, Badge, Button, Input } from "@/components/ui";
import {
  updateCampaignName,
  updateCampaignSender,
  updateCampaignAudience,
  updateCampaignSubject,
  updateCampaignTemplate,
} from "../../actions";
import { ActionsPanel } from "../_actions-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit campaign" };

type OpenSection = "sender" | "recipients" | "subject" | "design" | null;

export default async function CampaignEditPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { open?: string };
}) {
  const campaign = await db.campaign.findUnique({
    where: { id: params.id },
    include: {
      template: { select: { id: true, name: true, category: true } },
      segment: { select: { id: true, name: true, audienceSize: true } },
      list: { select: { id: true, name: true, _count: { select: { members: true } } } },
    },
  });
  if (!campaign) notFound();
  if (campaign.status !== CampaignStatus.DRAFT) {
    redirect(`/marketing/campaigns/${campaign.id}`);
  }

  const open = normalizeOpen(searchParams.open);

  const senderReady = Boolean(campaign.fromName && campaign.fromEmail);
  const recipientsReady = Boolean(campaign.segmentId || campaign.listId);
  const subjectReady = Boolean(campaign.subject.trim().length > 0);
  const designReady = Boolean(campaign.templateId);
  const allReady = senderReady && recipientsReady && subjectReady && designReady;

  const audienceSize = campaign.list
    ? campaign.list._count.members
    : campaign.segment?.audienceSize ?? null;

  return (
    <div className="space-y-6">
      {/* Sticky page header — back arrow, editable campaign name, status, send controls. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/marketing/campaigns"
            className="grid h-9 w-9 place-items-center rounded-full border border-border/60 bg-white text-muted-foreground hover:text-foreground dark:bg-slate-900"
            aria-label="Back to campaigns"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <NameEditor id={campaign.id} name={campaign.name} editing={open === null && searchParams.open === "name"} />
          <Badge tone="muted">Draft</Badge>
        </div>
      </div>

      {/* Four editable sections. */}
      <div className="space-y-3">
        <SenderSection open={open === "sender"} campaign={campaign} ready={senderReady} />
        <RecipientsSection open={open === "recipients"} campaign={campaign} ready={recipientsReady} />
        <SubjectSection open={open === "subject"} campaign={campaign} ready={subjectReady} />
        <DesignSection open={open === "design"} campaign={campaign} ready={designReady} />
      </div>

      {/* Send / schedule footer — always visible; controls disabled until all sections are ready. */}
      <div className="mt-4">
        {allReady ? (
          <ActionsPanel id={campaign.id} status={campaign.status} audienceSize={audienceSize} />
        ) : (
          <Card className="border-dashed">
            <div className="text-sm font-semibold">Almost there</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Fill in every section above to unlock <b>Send test</b> and <b>Schedule / Send now</b>.
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function normalizeOpen(v: string | undefined): OpenSection {
  if (v === "sender" || v === "recipients" || v === "subject" || v === "design") return v;
  return null;
}

// ---------------------------------------------------------------------------
// Campaign name — inline pencil that flips to an inline form.
// ---------------------------------------------------------------------------

function NameEditor({ id, name, editing }: { id: string; name: string; editing: boolean }) {
  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold md:text-2xl">{name}</h1>
        <Link
          href={`/marketing/campaigns/${id}/edit?open=name`}
          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-slate-100 hover:text-foreground dark:hover:bg-slate-800"
          aria-label="Rename campaign"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }
  return (
    <form action={updateCampaignName} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Input
        name="name"
        defaultValue={name}
        required
        maxLength={200}
        autoFocus
        className="min-w-[280px]"
      />
      <Button type="submit" variant="primary">
        Save
      </Button>
      <Button as="a" href={`/marketing/campaigns/${id}/edit`} variant="secondary">
        Cancel
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Section shell — status circle, title, description/summary, action button.
// ---------------------------------------------------------------------------

function SectionShell({
  ready,
  icon,
  title,
  description,
  cta,
  ctaHref,
  children,
  open,
  campaignId,
}: {
  ready: boolean;
  icon: React.ReactNode;
  title: string;
  description: React.ReactNode;
  cta: string;
  ctaHref: string;
  children?: React.ReactNode;
  open: boolean;
  campaignId: string;
}) {
  if (open) {
    return (
      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <StatusDot ready={ready} />
            <div>
              <div className="flex items-center gap-2">
                <div className="text-emerald-600">{icon}</div>
                <div className="text-base font-semibold">{title}</div>
              </div>
              <div className="text-xs text-muted-foreground">{description}</div>
            </div>
          </div>
          <Link
            href={`/marketing/campaigns/${campaignId}/edit`}
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-slate-100 hover:text-foreground dark:hover:bg-slate-800"
            aria-label="Close section"
          >
            <X className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-2">{children}</div>
      </Card>
    );
  }
  return (
    <Link
      href={ctaHref}
      className="group block rounded-2xl border border-border/60 bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md dark:bg-slate-900/60"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <StatusDot ready={ready} />
          <div>
            <div className="flex items-center gap-2">
              <div className="text-slate-500 group-hover:text-emerald-600 dark:text-slate-400">{icon}</div>
              <div className="text-base font-semibold">{title}</div>
            </div>
            <div className="text-xs text-muted-foreground">{description}</div>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-white px-3 py-1.5 text-xs font-medium text-foreground shadow-sm group-hover:border-emerald-300 group-hover:text-emerald-700 dark:bg-slate-900">
          {cta}
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}

function StatusDot({ ready }: { ready: boolean }) {
  return ready ? (
    <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500 text-white">
      <Check className="h-3.5 w-3.5" />
    </span>
  ) : (
    <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-slate-300 text-transparent dark:border-slate-600">
      <Circle className="h-3 w-3" />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sender section.
// ---------------------------------------------------------------------------

function SenderSection({
  open,
  campaign,
  ready,
}: {
  open: boolean;
  campaign: { id: string; fromName: string; fromEmail: string; replyTo: string | null };
  ready: boolean;
}) {
  const summary = ready ? (
    <span>
      {campaign.fromName} &lt;{campaign.fromEmail}&gt;
      {campaign.replyTo ? ` · replies to ${campaign.replyTo}` : ""}
    </span>
  ) : (
    "Who is sending this email campaign?"
  );

  return (
    <SectionShell
      open={open}
      ready={ready}
      icon={<Mail className="h-4 w-4" />}
      title="Sender"
      description={summary}
      cta={ready ? "Change sender" : "Select sender"}
      ctaHref={`/marketing/campaigns/${campaign.id}/edit?open=sender`}
      campaignId={campaign.id}
    >
      <form action={updateCampaignSender} className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <input type="hidden" name="id" value={campaign.id} />
        <div>
          <label htmlFor="fromName" className="text-xs font-medium">From name</label>
          <Input id="fromName" name="fromName" defaultValue={campaign.fromName} required maxLength={120} />
        </div>
        <div>
          <label htmlFor="fromEmail" className="text-xs font-medium">From email</label>
          <Input id="fromEmail" name="fromEmail" type="email" defaultValue={campaign.fromEmail} required />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="replyTo" className="text-xs font-medium">Reply-to (optional)</label>
          <Input id="replyTo" name="replyTo" type="email" defaultValue={campaign.replyTo ?? ""} />
        </div>
        <div className="md:col-span-2 flex justify-end gap-2 pt-1">
          <Button as="a" href={`/marketing/campaigns/${campaign.id}/edit`} variant="secondary">
            Cancel
          </Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Recipients section.
// ---------------------------------------------------------------------------

async function RecipientsSection({
  open,
  campaign,
  ready,
}: {
  open: boolean;
  campaign: {
    id: string;
    segmentId: string | null;
    listId: string | null;
    list: { id: string; name: string; _count: { members: number } } | null;
    segment: { id: string; name: string; audienceSize: number | null } | null;
  };
  ready: boolean;
}) {
  const [lists, segments] = open
    ? await Promise.all([
        db.contactList.findMany({
          orderBy: { createdAt: "desc" },
          select: { id: true, name: true, _count: { select: { members: true } } },
        }),
        db.segment.findMany({
          orderBy: { updatedAt: "desc" },
          select: { id: true, name: true, audienceSize: true, description: true },
        }),
      ])
    : [[], []];

  const summary = campaign.list ? (
    <span>
      List · <b className="font-semibold">{campaign.list.name}</b> —{" "}
      {campaign.list._count.members.toLocaleString()} contact
      {campaign.list._count.members === 1 ? "" : "s"}
    </span>
  ) : campaign.segment ? (
    <span>
      Segment · <b className="font-semibold">{campaign.segment.name}</b>
      {campaign.segment.audienceSize != null
        ? ` — ~${campaign.segment.audienceSize.toLocaleString()} contacts`
        : ""}
    </span>
  ) : (
    "The people who receive your campaign"
  );

  const currentValue = campaign.listId ? `list:${campaign.listId}` : campaign.segmentId ? `segment:${campaign.segmentId}` : "";

  return (
    <SectionShell
      open={open}
      ready={ready}
      icon={<Users className="h-4 w-4" />}
      title="Recipients"
      description={summary}
      cta={ready ? "Change recipients" : "Add recipients"}
      ctaHref={`/marketing/campaigns/${campaign.id}/edit?open=recipients`}
      campaignId={campaign.id}
    >
      {lists.length + segments.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          No lists or segments yet.{" "}
          <Link href="/marketing/contacts/lists/new" className="text-emerald-600 underline underline-offset-4">
            Create a list
          </Link>{" "}
          or{" "}
          <Link href="/marketing/segments/new" className="text-emerald-600 underline underline-offset-4">
            create a segment
          </Link>
          .
        </div>
      ) : (
        <form action={updateCampaignAudience} className="space-y-4">
          <input type="hidden" name="id" value={campaign.id} />

          {lists.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <ListChecks className="h-3.5 w-3.5" />
                Lists
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {lists.map((l) => {
                  const value = `list:${l.id}`;
                  const checked = currentValue === value;
                  return (
                    <label
                      key={l.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                        checked
                          ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-500/10"
                          : "border-border/60 hover:border-emerald-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      }`}
                    >
                      <input type="radio" name="audience" value={value} defaultChecked={checked} className="h-4 w-4 accent-emerald-500" required />
                      <div>
                        <div className="text-sm font-medium">{l.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {l._count.members.toLocaleString()} contact{l._count.members === 1 ? "" : "s"}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {segments.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <Filter className="h-3.5 w-3.5" />
                Segments
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {segments.map((s) => {
                  const value = `segment:${s.id}`;
                  const checked = currentValue === value;
                  return (
                    <label
                      key={s.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                        checked
                          ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-500/10"
                          : "border-border/60 hover:border-emerald-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      }`}
                    >
                      <input type="radio" name="audience" value={value} defaultChecked={checked} className="h-4 w-4 accent-emerald-500" required />
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
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button as="a" href={`/marketing/campaigns/${campaign.id}/edit`} variant="secondary">
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      )}
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Subject section.
// ---------------------------------------------------------------------------

function SubjectSection({
  open,
  campaign,
  ready,
}: {
  open: boolean;
  campaign: { id: string; subject: string; previewText: string | null };
  ready: boolean;
}) {
  const summary = ready ? (
    <span className="italic">"{campaign.subject}"</span>
  ) : (
    "Add a subject line for this campaign."
  );

  return (
    <SectionShell
      open={open}
      ready={ready}
      icon={<Type className="h-4 w-4" />}
      title="Subject"
      description={summary}
      cta={ready ? "Edit subject" : "Add subject"}
      ctaHref={`/marketing/campaigns/${campaign.id}/edit?open=subject`}
      campaignId={campaign.id}
    >
      <form action={updateCampaignSubject} className="space-y-3">
        <input type="hidden" name="id" value={campaign.id} />
        <div>
          <label htmlFor="subject" className="text-xs font-medium">Subject line</label>
          <Input
            id="subject"
            name="subject"
            required
            maxLength={300}
            defaultValue={campaign.subject}
            autoFocus
            placeholder="Registrations open for {{event_name}}"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Personalisation like <code>{"{{first_name}}"}</code> is replaced per recipient.
          </p>
        </div>
        <div>
          <label htmlFor="previewText" className="text-xs font-medium">Preview text (optional)</label>
          <Input
            id="previewText"
            name="previewText"
            maxLength={300}
            defaultValue={campaign.previewText ?? ""}
            placeholder="Shown next to the subject in Gmail, Outlook, etc."
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button as="a" href={`/marketing/campaigns/${campaign.id}/edit`} variant="secondary">
            Cancel
          </Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Design section.
// ---------------------------------------------------------------------------

async function DesignSection({
  open,
  campaign,
  ready,
}: {
  open: boolean;
  campaign: {
    id: string;
    templateId: string | null;
    template: { id: string; name: string; category: string } | null;
  };
  ready: boolean;
}) {
  const templates = open
    ? await db.emailTemplate.findMany({
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, category: true, previewText: true, updatedAt: true },
      })
    : [];

  const summary = campaign.template ? (
    <span>
      Template · <b className="font-semibold">{campaign.template.name}</b> ({campaign.template.category})
    </span>
  ) : (
    "Create your email content."
  );

  return (
    <SectionShell
      open={open}
      ready={ready}
      icon={<Palette className="h-4 w-4" />}
      title="Design"
      description={summary}
      cta={ready ? "Change template" : "Start designing"}
      ctaHref={`/marketing/campaigns/${campaign.id}/edit?open=design`}
      campaignId={campaign.id}
    >
      {templates.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          No templates yet.{" "}
          <Link href="/marketing/templates/new" className="text-emerald-600 underline underline-offset-4">
            Create a template
          </Link>
          .
        </div>
      ) : (
        <form action={updateCampaignTemplate} className="space-y-3">
          <input type="hidden" name="id" value={campaign.id} />
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {templates.map((t) => {
              const checked = campaign.templateId === t.id;
              return (
                <label
                  key={t.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                    checked
                      ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-500/10"
                      : "border-border/60 hover:border-emerald-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  }`}
                >
                  <input type="radio" name="templateId" value={t.id} defaultChecked={checked} className="mt-1 h-4 w-4 accent-emerald-500" required />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-sm font-medium">{t.name}</div>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {t.category}
                      </span>
                    </div>
                    {t.previewText && (
                      <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{t.previewText}</div>
                    )}
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      Updated {t.updatedAt.toISOString().slice(0, 10)}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button as="a" href={`/marketing/campaigns/${campaign.id}/edit`} variant="secondary">
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      )}
    </SectionShell>
  );
}
