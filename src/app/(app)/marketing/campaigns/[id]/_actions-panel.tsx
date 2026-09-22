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

export function ActionsPanel({
  id,
  status,
  audienceSize,
}: {
  id: string;
  status: CampaignStatus;
  audienceSize: number | null;
}) {
  const [pending, start] = useTransition();
  const [estimate, setEstimate] = useState<{ matching: number; suppressed: number; final: number; costUsd: number } | null>(null);
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
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await estimateCampaign(id);
              if (res.ok) setEstimate({ matching: res.matching, suppressed: res.suppressed, final: res.final, costUsd: res.costUsd });
              else setError(res.error);
            })
          }
        >
          {pending ? "Estimating…" : "Refresh estimate"}
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
          <div className="mb-2 text-sm font-medium">Schedule or send</div>
          <form action={launchCampaign} className="space-y-3">
            <input type="hidden" name="id" value={id} />
            <div>
              <Label htmlFor="scheduledFor">Schedule for (your local time)</Label>
              <Input
                id="scheduledFor"
                name="scheduledFor"
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <input id="sendNow" name="sendNow" type="checkbox" className="h-4 w-4" />
              <Label htmlFor="sendNow">Or send now (ignores schedule)</Label>
            </div>
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
              onClick={() => {
                if (confirm("Cancel this campaign? Recipients not yet sent will be skipped.")) {
                  start(() => cancelCampaign(id));
                }
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
