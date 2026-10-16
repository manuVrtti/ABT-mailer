# Live Klymb lists

Contact lists built from the Klymb (ABTalks main app) database instead of a CSV
export. A list stores a filter; its members are recomputed from Klymb on every
refresh, and every campaign refreshes its Klymb lists right before it sends.

## Setup

1. `ABTALKS_DB_URL` — the Klymb Postgres URL, in `.env.local` and in Vercel →
   Settings → Environment Variables. Without it the "New Klymb list" page says
   it can't reach Klymb and campaigns to Klymb lists won't launch.
2. `npx prisma db push` on the mailer database (adds `contact_lists.kind /
   klymb_filter / synced_at / sync_stats / sync_error`, `marketing_contacts.company
   / user_type / klymb_user_id`, and `contact_list_overrides`).

## Read-only

The mailer never writes to Klymb. `src/server/klymb/client.ts` is the only code
that opens `ABTALKS_DB_URL`, and every query it runs is:

- inside `BEGIN TRANSACTION READ ONLY` (Postgres rejects any write), always
  ended with `ROLLBACK`;
- checked to be a single `SELECT` / `WITH … SELECT` before it is sent;
- parameterized — filter values never become SQL text;
- capped by `statement_timeout` (20 s, 60 s for a full refresh).

That holds even when the URL's user can write. A dedicated read-only Neon role
is still recommended as a second layer:

```sql
CREATE ROLE mailer_readonly WITH LOGIN PASSWORD '…';
GRANT CONNECT ON DATABASE neondb TO mailer_readonly;
GRANT USAGE ON SCHEMA public TO mailer_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO mailer_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO mailer_readonly;
```

## How a person is described

Resolved per Klymb user in `src/server/klymb/sql.ts` (first non-empty wins):

| Field | Sources |
|---|---|
| Type | RecruiterProfile / role RECRUITER → CandidateProfile.primaryPersona → latest workshop form role / VideoThon employment → any hackathon entry (student) → UNKNOWN |
| College | CandidateEducation → hackathon form → workshop form (students) |
| Company | RecruiterProfile → current CandidateExperience → workshop form (professionals) |
| Graduation year | CandidateEducation → hackathon form → workshop form |

Deleted, anonymized and disabled accounts are never included, and nor is
anyone who unsubscribed in Klymb (`NewsletterSubscription.subscribed = false`).
The mailer's own suppression list still applies at send time.

## Refresh

- On create, on filter save, on "Refresh now", when include/exclude changes,
  and right before a campaign fans out (scheduled ones too). If that last one
  fails, the campaign doesn't send and the list shows the error.
- Matching people are upserted as contacts (`source = ABTALKS_USER`); Klymb
  values overwrite stored ones, blanks never erase them. People who no longer
  match leave this list only.
- "Always include" / "Always exclude" addresses are applied on every refresh.
  Removing a member with ✕ on a Klymb list records an "always exclude".

## Sending

The send panel shows the audience by type. If it contains professionals or
recruiters, launch requires ticking "I mean to email professionals /
recruiters". Templates can use `{{company}}`, `{{graduation_year}}` and
`{{user_type}}`.
