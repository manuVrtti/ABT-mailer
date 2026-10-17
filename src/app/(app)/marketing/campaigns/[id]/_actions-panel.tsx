"use client";

import { useState, useTransition } from "react";
import { Card, Input, Label, Button, Badge } from "@/components/ui";
import {
  estimateCampaign,
  sendCampaignTest,
  launchCampaign,
  cancelCampaign,
  pauseCampaign,
  resumeCampaign,
} from "../actions";
import type { CampaignStatus } from "@prisma/client";
import { confirmDialog } from "@/components/overlay";

type TypeCounts = Record<"STUDENT" | "PROFESSIONAL" | "RECRUITER" | "UNKNOWN" | "NOT_SET", number>;

const TYPE_LABELS: [keyof TypeCounts, string][] = [
  ["STUDENT", "Students"],
  ["PROFESSIONAL", "Professionals"],
  ["RECRUITER", "Recruiters"],
  ["UNKNOWN", "Unknown type"],
  ["NOT_SET", "Imported (no type)"],
];

function ago(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return `on ${iso.slice(0, 10)}`;
}

export function ActionsPanel({
  id,
  status,
  audienceSize,
  audienceTypes,
  klymbLists = [],
}: {
  id: string;
  status: CampaignStatus;
  audienceSize: number | null;
  audienceTypes?: TypeCounts | null;
  klymbLists?: { id: string; name: string; syncedAt: string | null; syncError: string | null }[];
}) {
  const [pending, start] = useTransition();
  const [estimate, setEstimate] = useState<{
    matching: number;
    suppressed: number;
    final: number;
    costUsd: number;
    byType: TypeCounts;
  } | null>(null);
  const types = estimate?.byType ?? audienceTypes ?? null;
  const sensitive = types ? types.PROFESSIONAL + types.RECRUITER : 0;
  const hasKlymb = klymbLists.length > 0;
  const [testTo, setTestTo] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [scheduledFor, setScheduledFor] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isDraftOrScheduled = status === "DRAFT" || status === "SCHEDULED";

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs text-muted-foreground">Audience</div>
          {estimate ? (
            <div className="mt-1 flex flex-wrap items-baseline gap-3">
              <div className="text-2xl font-semibold tabular-nums">{estimate.final.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">
                matching {estimate.matching.toLocaleString()} · suppressed {estimate.suppressed.toLocaleString()} · est. cost ${estimate.costUsd.toFixed(2)}
              </div>
            </div>
          ) : (
            <div className="mt-1 text-sm text-muted-foreground">
              Last saved size: {audienceSize?.toLocaleString() ?? "—"}. Click <b>Refresh</b> for a fresh estimate.
            </div>
          )}
          {types && (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {TYPE_LABELS.filter(([k]) => types[k] > 0).map(([k, label]) => (
                <span key={k} className={k === "PROFESSIONAL" || k === "RECRUITER" ? "font-semibold text-amber-700 dark:text-amber-300" : ""}>
                  {label}: <span className="tabular-nums">{types[k].toLocaleString()}</span>
                </span>
              ))}
            </div>
          )}
          {hasKlymb && (
            <div className="mt-2 text-xs text-muted-foreground">
              Live Klymb list{klymbLists.length === 1 ? "" : "s"}:{" "}
              {klymbLists.map((l, i) => (
                <span key={l.id}>
                  {i > 0 && ", "}
                  <a href={`/marketing/contacts/lists/${l.id}`} className="text-emerald-700 hover:underline dark:text-emerald-300">
                    {l.name}
                  </a>{" "}
                  {l.syncError ? <span className="text-destructive">(last refresh failed)</span> : `(refreshed ${ago(l.syncedAt)})`}
                </span>
              ))}
              . They refresh again automatically when the campaign sends.
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await estimateCampaign(id, { refreshKlymb: hasKlymb });
              if (res.ok) {
                setEstimate({
                  matching: res.matching,
                  suppressed: res.suppressed,
                  final: res.final,
                  costUsd: res.costUsd,
                  byType: res.byType,
                });
              } else setError(res.error);
            })
          }
        >
          {pending ? (hasKlymb ? "Refreshing from Klymb…" : "Estimating…") : "Refresh estimate"}
        </Button>
      </Card>

      <Card>
        <div className="mb-2 text-sm font-medium">Send test</div>
        <div className="flex gap-2">
          <Input type="email" placeholder="you@abtalks.in" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          <Button
            type="button"
            variant="secondary"
            disabled={pending || !testTo}
            onClick={() =>
              start(async () => {
                const res = await sendCampaignTest(id, testTo);
                setTestResult(res.ok ? `Sent · ${res.providerMessageId}` : `Failed · ${res.error}`);
              })
            }
          >
            Send test
          </Button>
        </div>
        {testResult && <div className="mt-2 text-xs text-muted-foreground">{testResult}</div>}
      </Card>

      {isDraftOrScheduled && (
        <Card>
          <div className="mb-2 text-sm font-medium">Send or schedule</div>
          <form action={launchCampaign} className="space-y-3">
            <input type="hidden" name="id" value={id} />
            {/* Default to Send now — this is the common case. Uncheck to schedule
                for a specific date/time. Server rejects a schedule with no date. */}
            <div className="flex items-center gap-2">
              <input id="sendNow" name="sendNow" type="checkbox" defaultChecked className="h-4 w-4" />
              <Label htmlFor="sendNow">Send now</Label>
            </div>
            <div>
              <Label htmlFor="scheduledFor">Or schedule for (your local time)</Label>
              <Input
                id="scheduledFor"
                name="scheduledFor"
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Uncheck &quot;Send now&quot; and pick a time here to schedule.
              </p>
            </div>
            {sensitive > 0 && types && (
              <label className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                <input name="confirmAudience" type="checkbox" required className="mt-0.5 h-4 w-4" />
                <span>
                  <b>I mean to email professionals / recruiters.</b> This audience includes{" "}
                  {types.PROFESSIONAL.toLocaleString()} professional{types.PROFESSIONAL === 1 ? "" : "s"} and{" "}
                  {types.RECRUITER.toLocaleString()} recruiter{types.RECRUITER === 1 ? "" : "s"}. If this mail is only for
                  students, change the audience instead.
                </span>
              </label>
            )}
            <div className="flex justify-end gap-2">
              <Button type="submit" variant="primary">
                {status === "SCHEDULED" ? "Update schedule / launch" : "Launch"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Launching creates one email job per recipient. Suppressed contacts are skipped server-side before touching SES.
            </p>
          </form>
        </Card>
      )}

      {(status === "SENDING" || status === "QUEUED" || status === "PAUSED") && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <Badge tone={status === "PAUSED" ? "warning" : "info"}>{status}</Badge> — control the running campaign
          </div>
          <div className="flex gap-2">
            {status !== "PAUSED" ? (
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => start(() => pauseCampaign(id))}
              >
                Pause
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                disabled={pending}
                onClick={() => start(() => resumeCampaign(id))}
              >
                Resume
              </Button>
            )}
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={async () => {
                const ok = await confirmDialog({
                  title: "Cancel this campaign?",
                  message: "Recipients who haven't been sent to yet will be skipped. This can't be undone.",
                  confirmLabel: "Cancel campaign",
                  cancelLabel: "Keep sending",
                  tone: "danger",
                });
                if (ok) start(() => cancelCampaign(id));
              }}
            >
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {error && <div className="text-xs text-destructive">{error}</div>}
    </div>
  );
}
