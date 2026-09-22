# Load rehearsal — 100K import + 100K send

Run this **once**, in a preview/staging deployment, before the first real campaign at scale. Its purpose is to shake out issues that only show up under real volume: Postgres index efficacy, memory pressure in the CSV parser, SES throttle behavior, worker retry storms.

## Prerequisites

- Preview Neon branch (or a staging DB — do **not** run against production data).
- QStash queues `priority` and `bulk` configured with the same names as prod.
- SES account **out of the sandbox** with a raised send quota. If you're still in the sandbox, cap the fixture to fewer rows than your daily quota.
- A domain you control that swallows or safely delivers mail (a Mailtrap sink, a wildcard forwarder to `/dev/null`, or an SES simulator address). **Do not use real recipient addresses.**
- Grafana / Vercel logs open so you can watch throughput and error rates.

## Step 1 — Generate a 100K fixture CSV

```
npx tsx scripts/gen-fixture-csv.ts 100000 fixtures/contacts_100k.csv
```

Roughly 6 MB, ~5 seconds. Emails are `loadtest+N@rehearsal.abtalks.in`.

## Step 2 — Import via the UI

`/marketing/contacts/import`, upload the fixture. Watch the import job page (`/marketing/contacts/imports/[id]`). Track:
- Time from PENDING → COMPLETED (target: < 90 s for 100K)
- `imported` count (should equal fixture rows minus intentional dupes)
- `invalid` count (should be 0)
- Memory graph on Vercel — a sustained > 512 MB in one function is a smell.

## Step 3 — Build a segment

`/marketing/segments/new`. A useful test filter:
```
college = ABES  AND  year = 4th  AND  registration_status = NOT_REGISTERED
```
Click **Preview** — the count should be roughly `fixture_rows / (COLLEGES × YEARS × STATUS) = 100000 / (6 × 4 × 2) ≈ 2083`.

## Step 4 — Create the marketing template

`/marketing/templates/new`. Use the Unlayer editor to drop in a heading + a paragraph. The subject should include `{{first_name}}` so token substitution runs. Save.

## Step 5 — Create the campaign

`/marketing/campaigns/new`. Point it at the fixture segment + fixture template. From email should be `no-reply@rehearsal.abtalks.in` (verified in your rehearsal SES identity). Save the draft.

## Step 6 — Launch

Click **Send now** on the campaign detail page. Immediately switch to:
- `/marketing/campaigns/[id]` — watch `sentCount` climb.
- QStash dashboard — watch bulk-queue depth.
- SES SendingStatistics graph — watch send rate vs quota.

Targets:
- SES send rate ≥ 14 msg/s (default quota). If you're throttled early, see below.
- No worker retries above ~1% (single retry per job is normal; a persistent >5% retry rate signals a config problem).

## Step 7 — Watch the numbers reconcile

After all sends drain, ~5 minutes of SES event lag lands the DELIVERY / OPEN / CLICK / BOUNCE counters:
- `deliveredCount ≥ 99%` of `sentCount` for a clean fixture domain.
- Any bounces or complaints should already show up in `/settings/suppressions`.
- Open the campaign detail page — the top-line counters should match the events table.

## Failure playbook

| Symptom                                          | Likely cause                                              | Action                                                              |
| ------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------- |
| Import stuck in `IMPORTING`                      | Function memory / timeout                                 | Reduce BATCH_SIZE in [csv.ts](../../src/server/import/csv.ts), or split CSV. |
| `enqueued` count differs from segment size       | Suppression matches or invalid emails                      | Check `EmailJob.errorCode` for `suppressed` rows.                   |
| Massive `THROTTLED` errors in logs               | Bulk queue rate exceeds SES quota                          | Lower bulk-queue rate limit in QStash dashboard to match SES.       |
| `sentCount` climbs but `deliveredCount` doesn't  | SNS webhook not receiving events                           | Confirm the subscription in SNS; hit `/api/webhooks/ses` manually. |
| Campaign stuck in `SENDING` after all jobs SENT  | No completion signaler yet (Phase 19.1 follow-up)          | Manually mark COMPLETED via a Prisma Studio update; automate later. |

## Cleanup

After the rehearsal:
- `TRUNCATE marketing_contacts, campaign_recipients, email_jobs, email_logs, email_events, conversion_events, suppressions, campaigns, segments, email_templates RESTART IDENTITY CASCADE;` on the staging DB.
- Delete the QStash queue backlog.
- Do **not** copy the rehearsal DB to production.
