# Conversion attribution API — for ABTalks main app

When a user takes an action that matters to the marketing funnel (registers, starts an assessment, completes an assessment), ABTalks main POSTs it here. This is the second half of the analytics story — email metrics tell us delivery, this endpoint tells us business impact.

## Endpoint

```
POST {NEXT_PUBLIC_APP_URL}/api/conversions
Content-Type: application/json
X-ABTalks-Timestamp: <unix seconds>
X-ABTalks-Signature: v1=<hex hmac_sha256>
```

Signed with the same shared secret as `/api/emails/transactional`. HMAC computed over `${timestamp}.${rawBody}`.

## Body

```json
{
  "stage": "REGISTRATION",
  "email": "student@example.in",
  "registeredUserRefId": "optional",
  "campaignSlug": "freshers-drive",
  "occurredAt": "2026-09-21T13:00:00Z",
  "metadata": { "college": "ABES", "referrer": "landing-hero" }
}
```

- `stage` — one of `CLICK`, `REGISTRATION`, `ASSESSMENT_STARTED`, `ASSESSMENT_COMPLETED`.
- `campaignSlug` — from the `utm_campaign` query parameter on the landing page. Optional. If omitted, this endpoint falls back to a **30-day last-touch model** using the recipient email.
- `email` — the recipient email. Not required if you have `registeredUserRefId`, but strongly recommended for attribution.

## Response

```json
{ "ok": true, "id": "cev_...", "campaignId": "cmp_..." }
```

`campaignId` is `null` if we could not attribute the event.

## How ABTalks main should call this

The recommended flow: on your landing page, read `utm_campaign` from the URL and stash it in a cookie or in the user's profile. When they register, POST the conversion with that `campaignSlug`. Same for assessment start / complete.

Node example:

```ts
import crypto from "node:crypto";

async function reportConversion(payload: object) {
  const body = JSON.stringify(payload);
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = crypto.createHmac("sha256", process.env.MAIL_APP_HMAC_SECRET!).update(`${ts}.${body}`).digest("hex");
  await fetch(`${process.env.MAIL_APP_URL}/api/conversions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-ABTalks-Timestamp": ts,
      "X-ABTalks-Signature": `v1=${sig}`,
    },
    body,
  });
}
```
