# Conversions

"Did the email make people act?" — measured by matching email recipients
against what they did in the Klymb database afterwards. The Klymb app doesn't
need to report anything; the mailer reads Klymb read-only (`klymbRead`).

## What counts

Within **7 days** after a campaign or personal-mail email, any of:

| Kind | Klymb source |
|---|---|
| Signed up | `User.createdAt` |
| Workshop registration | `WorkshopRegistration` |
| Hackathon / VideoThon registration | `HackathonParticipant`, `HackathonVideoRegistration` |
| Submission | first `HackathonSubmission` of the person's team; VideoThon `submissionUpdatedAt` |
| Cohort enrollment | `ProgramEnrollment.joinedAt` |
| Job application | `JobApplication` |
| Mock interview | `MockInterview` |

## Credit (last touch)

Each action is credited to **one** email: the most recent one sent to that
address before the action, if it was within the window. A person who got the
announcement, the reminder and the last call and then registered counts once,
for the last call — totals across campaigns equal the real number of actions.
"After a click" means a link in that email was clicked before the action.

A campaign can have a **goal** (e.g. "Registered for Workshop · 17 Oct
2026"); its report then also shows how many reached that goal. Without a goal,
any action counts.

## Where

- Campaign report → Conversions card (funnel, goal, who converted, CSV).
- Analytics → Conversions (KPIs vs previous period, per day, by action, by campaign).
- Dashboard → Conversions tile. Personal mails → people who acted.

## Refresh

`attributed_conversions` is rebuilt from scratch by
`src/server/conversions/refresh.ts` (≈10 s): on "Refresh", when the
Conversions page is opened and the last run is over 6 hours old, and by a
QStash schedule — add one, hourly:

```
POST {NEXT_PUBLIC_APP_URL}/api/qstash/conversions/refresh
```

Runs are logged in `conversion_runs`. Emails sent in the last 180 days are
considered.

## Setup

`npx prisma db push` adds `attributed_conversions`, `conversion_runs` and
`campaigns.conversion_goal`. **Push before deploying** — the dashboard and
campaign pages read these tables.
