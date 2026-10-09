# Transactional email API — for ABTalks main app

The ABTalks main app calls this endpoint whenever a domain event should send an email (registration, workshop signup, password reset, etc.). Do **not** call SES directly and do **not** call this endpoint synchronously inside the user's HTTP request path — dispatch it after the user response is returned.

## Endpoint

```
POST {NEXT_PUBLIC_APP_URL}/api/emails/transactional
Content-Type: application/json
X-ABTalks-Timestamp: <unix seconds>
X-ABTalks-Signature: v1=<hex hmac_sha256>
```

Signature is computed over `${timestamp}.${rawBody}` with the shared secret `TRANSACTIONAL_API_HMAC_SECRET`. Timestamps outside a 5-minute window are rejected.

## Body

```json
{
  "eventType": "USER_REGISTERED",
  "eventId": "abtalks_evt_9f8f2c",
  "recipient": {
    "email": "student@example.in",
    "registeredUserRefId": "optional",
    "contactId": "optional"
  },
  "variables": {
    "first_name": "Priya",
    "event_name": "AI Workshop",
    "event_date": "2026-10-05",
    "event_link": "https://abtalks.in/ws/ai-oct"
  },
  "overrides": {
    "fromEmail": "no-reply@mail.abtalks.in",
    "fromName": "ABTalks",
    "replyTo": "support@abtalks.in"
  }
}
```

Rules:
- `eventType` must match an active `EmailEventRule`. Configure these in this app's admin UI (Phase 8) or via seed.
- `eventId` is **your** idempotency id — reuse the same id for retries and duplicate events won't create duplicate emails.
- Every variable required by the mapped template must appear in `variables` or the request is rejected with `status: "invalid"` and `reason: missing_variable:<name>`.
- `recipient.email` is normalized server-side (lowercased, trimmed).
- `overrides` are optional. Leave them out to use the defaults from `SES_FROM_EMAIL` / `SES_FROM_NAME`.

## Raw mode — send content you already rendered

If the caller builds its own HTML (the ABTalks app does), send `content` instead of `variables`. No event rule or template is needed; `eventType` is just a label for logs.

```json
{
  "eventType": "profile.viewed",
  "eventId": "<stable id — the same on every retry>",
  "recipient": { "email": "student@example.in" },
  "content": {
    "subject": "You're getting noticed",
    "html": "<!doctype html>…",
    "text": "…",
    "headers": { "List-Unsubscribe": "<mailto:team@abtalks.in?subject=Unsubscribe>" }
  },
  "category": "TRANSACTIONAL_NONESSENTIAL"
}
```

- `category` defaults to `TRANSACTIONAL_NONESSENTIAL`. Use `TRANSACTIONAL_ESSENTIAL` only for OTP / password reset / security mail (only a hard bounce blocks it).
- Only these `headers` are kept: `List-Unsubscribe`, `List-Unsubscribe-Post`, `X-Entity-Ref-ID`, `Importance`, `X-Priority`, `Priority`, `In-Reply-To`, `References`. Others are dropped.
- Idempotency is per `(eventId, eventType, email)`.
- `"sensitive": true` for mail that contains a secret (one-time code, password, reset link): once the job is sent, skipped or permanently failed, its subject and body are wiped from the database. Status, timings and delivery events are kept.

## Bounce and complaint callbacks

When `CALLER_WEBHOOK_URL` is set, every bounce and spam complaint on mail sent through this endpoint is POSTed there, signed the same way (`X-ABTalks-Timestamp`, `X-ABTalks-Signature: v1=<hmac of "${ts}.${body}">` with `TRANSACTIONAL_API_HMAC_SECRET`):

```json
{
  "type": "bounce",
  "bounceType": "Permanent",
  "kind": "resume_import.outreach.invite",
  "eventId": "<the eventId you sent>",
  "email": "student@example.in",
  "occurredAt": "2026-10-08T11:23:08.275Z"
}
```

`type` is `bounce` or `complaint`; `bounceType` (bounces only) is `Permanent`, `Transient` or `Undetermined`. SNS may deliver an event twice, so handle repeats. Campaign mail is never reported.

## Responses

Every successful call returns `200`. Read `status` — do not treat `200` alone as "sent".

```json
{ "status": "enqueued",  "jobId": "cjob_..." }
{ "status": "duplicate", "jobId": "cjob_..." }
{ "status": "suppressed", "reason": "hard_bounce (MARKETING)" }
```

Rejections:

```json
400 { "status": "invalid", "reason": "missing_variable:reset_link" }
400 { "error": "bad_body", "detail": "..." }
401 { "error": "unauthorized", "reason": "timestamp_skew" | "signature_mismatch" | ... }
```

## Node.js caller example

```ts
import crypto from "node:crypto";

const url = `${process.env.MAIL_APP_URL}/api/emails/transactional`;
const body = JSON.stringify({
  eventType: "PASSWORD_RESET_REQUESTED",
  eventId: `pwrst_${userId}_${Date.now()}`,
  recipient: { email: user.email },
  variables: {
    first_name: user.firstName,
    reset_link: `${appUrl}/reset?token=${token}`,
    expires_in: "30 minutes",
  },
});
const ts = Math.floor(Date.now() / 1000).toString();
const sig = crypto.createHmac("sha256", process.env.MAIL_APP_HMAC_SECRET!).update(`${ts}.${body}`).digest("hex");

await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-ABTalks-Timestamp": ts,
    "X-ABTalks-Signature": `v1=${sig}`,
  },
  body,
});
```

## Behavior guarantees

- **Idempotent**: same `(eventId, template_key, email)` never sends twice.
- **Category-aware suppression**: marketing unsubscribes do **not** block password-reset / security emails; hard bounces block everything.
- **Never blocks caller**: the endpoint enqueues via QStash and returns immediately. Actual SES delivery happens on the worker.

## Failure modes and what to do

| Response                                       | ABTalks main app should do                                       |
| ---------------------------------------------- | ---------------------------------------------------------------- |
| `200 enqueued` / `200 duplicate`              | Nothing. It's handled.                                           |
| `200 suppressed`                               | Nothing. Do not surface to the user.                             |
| `400 invalid: no_active_rule_for_event:...`   | Fix the event name or create the rule in the mailer admin UI.    |
| `400 invalid: no_active_template:...`         | Publish the template.                                            |
| `400 invalid: missing_variable:xxx`           | Send the required variable.                                      |
| `400 bad_body`                                 | Client bug. Log and fix.                                         |
| `401 unauthorized`                             | Check clock skew, secret, or signature computation.              |
| `503 retry`                                    | Saved but not queued yet. Retry with the **same** `eventId`.     |
| `5xx`                                          | Retry with exponential backoff.                                  |
