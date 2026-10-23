import Link from "next/link";
import { DirectSendStatus, EmailJobStatus, type DirectSend } from "@prisma/client";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  MousePointerClick,
  Paperclip,
  Pencil,
  Send,
} from "lucide-react";
import { db } from "@/lib/db";
import { Badge, Button, Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import { brandForAddress } from "@/server/brands";
import { formatBytes } from "@/server/direct-send/body";
import { checkDirectSendReady, renderDirectEmail, singleRecipients } from "@/server/direct-send/service";
import { rowActivity } from "@/server/direct-send/stats";
import { AutoRefresh, CancelButton, DeleteButton, LaunchButton, TestSend } from "./_controls";

const IST = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const JOB_LABEL: Record<EmailJobStatus, [string, "muted" | "info" | "success" | "warning" | "destructive"]> =
  {
    PENDING: ["Queued", "info"],
    QUEUED: ["Queued", "info"],
    SENDING: ["Sending", "info"],
    SENT: ["Sent", "info"],
    DELIVERED: ["Delivered", "success"],
    BOUNCED: ["Bounced", "destructive"],
    COMPLAINED: ["Marked spam", "destructive"],
    FAILED: ["Failed", "destructive"],
    SKIPPED: ["Not sent", "warning"],
  };

/** One single email: who it went to, what it says, and what happened to it. */
export async function SingleMailView({
  send,
  canEdit,
  me,
}: {
  send: DirectSend & { attachments: { id: string; filename: string; size: number }[] };
  canEdit: boolean;
  me: string;
}) {
  const isDraft = send.status === DirectSendStatus.DRAFT;
  const row = await db.directSendRow.findFirst({
    where: { directSendId: send.id },
    orderBy: { rowNumber: "asc" },
  });
  const brand = await brandForAddress(send.fromEmail);
  const email = row ? renderDirectEmail(send, row, brand) : null;
  const [problems, recipients, activity] = await Promise.all([
    isDraft ? checkDirectSendReady(send.id) : Promise.resolve([]),
    isDraft ? singleRecipients(send) : Promise.resolve(null),
    row?.emailJobId
      ? rowActivity([row.emailJobId]).then((m) => m.get(row.emailJobId!))
      : Promise.resolve(undefined),
  ]);
  const job = row?.emailJobId
    ? await db.emailJob.findUnique({
        where: { id: row.emailJobId },
        select: { extraTo: true, cc: true, bcc: true },
      })
    : null;
  // After sending, show who it actually went to (do-not-send addresses were left out).
  const shown = job
    ? { to: [send.toEmails[0] ?? "", ...job.extraTo], cc: job.cc, bcc: job.bcc }
    : { to: send.toEmails, cc: send.ccEmails, bcc: send.bccEmails };
  const left = job
    ? [...send.ccEmails, ...send.bccEmails].filter((e) => !job.cc.includes(e) && !job.bcc.includes(e))
    : [];
  const total = shown.to.length + shown.cc.length + shown.bcc.length;
  const [label, tone] = activity
    ? JOB_LABEL[activity.status]
    : isDraft
      ? (["Draft", "muted"] as const)
      : (["Not queued", "muted"] as const);

  return (
    <div className="space-y-6">
      {send.status === DirectSendStatus.SENDING && <AutoRefresh />}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Link
            href="/marketing/customize?mode=single"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{email?.subject || send.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge tone={tone} dot>
                {label}
              </Badge>
              <span>
                Single email · {send.fromName} &lt;{send.fromEmail}&gt;
              </span>
              {send.startedAt && <span>· sent {IST.format(send.startedAt)}</span>}
            </p>
          </div>
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-start gap-2">
            {send.status === DirectSendStatus.SENDING && <CancelButton id={send.id} />}
            {send.status !== DirectSendStatus.SENDING && (
              <DeleteButton id={send.id} name={email?.subject || send.name} />
            )}
            {isDraft && (
              <Button as="a" href={`/marketing/customize/single?id=${send.id}`} variant="secondary">
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            )}
            {isDraft && (
              <LaunchButton
                id={send.id}
                count={total}
                disabled={problems.length > 0}
                label={total > 1 ? `Send to ${total}` : "Send"}
                confirmTitle={`Send this email to ${total} ${total === 1 ? "person" : "people"}?`}
                confirmMessage="It goes out as one email: To and CC see each other, BCC stays hidden. This can't be undone."
              />
            )}
          </div>
        )}
      </div>

      {isDraft && problems.length > 0 && (
        <Notice
          tone="bad"
          title={`Fix ${problems.length === 1 ? "this" : "these"} before sending:`}
          items={problems.map((p) => p.problem)}
        />
      )}
      {isDraft && recipients && recipients.droppedCopies.length > 0 && (
        <Notice
          tone="warn"
          title="These CC / BCC addresses will be left out — they're on the do-not-send list:"
          items={recipients.droppedCopies.map((d) => `${d.email} (${d.reason})`)}
        />
      )}
      {!isDraft && left.length > 0 && (
        <Notice tone="warn" title="Left out because they're on the do-not-send list:" items={left} />
      )}
      {activity?.errorMessage && (
        <Notice tone="bad" title="What went wrong:" items={[activity.errorMessage]} />
      )}

      {!isDraft && activity && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Moment icon={Send} label="Sent" at={activity.sentAt} />
          <Moment icon={CheckCircle2} label="Delivered" at={activity.deliveredAt} />
          <Moment icon={Eye} label="Opened" at={activity.openedAt} count={activity.openCount} />
          <Moment
            icon={MousePointerClick}
            label="Clicked"
            at={activity.clickedAt}
            count={activity.clickCount}
          />
        </div>
      )}
      {!isDraft && total > 1 && (
        <p className="-mt-3 text-xs text-muted-foreground">
          Opens and clicks are counted for the email as a whole — with several recipients we can&apos;t tell
          which one opened it.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="overflow-hidden p-0">
          <div className="space-y-1.5 border-b border-border bg-muted/40 px-5 py-4 text-sm">
            <AddressLine label="From" values={[`${send.fromName} <${send.fromEmail}>`]} />
            <AddressLine label="To" values={shown.to} />
            {shown.cc.length > 0 && <AddressLine label="CC" values={shown.cc} />}
            {shown.bcc.length > 0 && <AddressLine label="BCC" values={shown.bcc} />}
            <div className="pt-1 text-base font-semibold">{email?.subject}</div>
          </div>
          {email && (
            <iframe title="Email" sandbox="" srcDoc={email.html} className="h-[480px] w-full bg-white" />
          )}
          {send.attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-t border-border px-5 py-3">
              {send.attachments.map((a) => (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs"
                >
                  <Paperclip className="h-3 w-3" /> {a.filename}{" "}
                  <span className="text-muted-foreground">{formatBytes(a.size)}</span>
                </span>
              ))}
            </div>
          )}
        </Card>

        <aside className="space-y-4">
          {isDraft && canEdit && row && (
            <Card>
              <div className="mb-1 text-sm font-medium">Send yourself a test</div>
              <p className="mb-2 text-xs text-muted-foreground">
                Only to this address — CC and BCC are left out of tests.
              </p>
              <TestSend id={send.id} rowNumber={row.rowNumber} defaultTo={me} />
            </Card>
          )}
          <Card>
            <div className="mb-2 text-sm font-medium">Recipients</div>
            <dl className="space-y-1 text-sm">
              <Count label="To" n={shown.to.length} />
              <Count label="CC" n={shown.cc.length} />
              <Count label="BCC" n={shown.bcc.length} />
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Notice({ tone, title, items }: { tone: "bad" | "warn"; title: string; items: string[] }) {
  return (
    <div
      className={cn(
        "flex gap-2 rounded-lg border p-3 text-sm",
        tone === "bad"
          ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <b>{title}</b>
        <ul className="mt-1 list-disc pl-5">
          {items.map((i) => (
            <li key={i} className="break-all">
              {i}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Moment({
  icon: Icon,
  label,
  at,
  count,
}: {
  icon: typeof Send;
  label: string;
  at: Date | null;
  count?: number;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-3 shadow-card", !at && "opacity-60")}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-1 text-sm font-semibold">{at ? IST.format(at) : "Not yet"}</div>
      {count !== undefined && count > 1 && (
        <div className="text-2xs text-muted-foreground">{count} times</div>
      )}
    </div>
  );
}

function AddressLine({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="flex gap-2">
      <span className="w-10 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-all">{values.join(", ")}</span>
    </div>
  );
}

function Count({ label, n }: { label: string; n: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{n}</dd>
    </div>
  );
}
