# Deployment — Vercel

Runbook for going from an empty git repo to a live `*.vercel.app` deployment, and later swapping to `mail.abtalks.in`. Every URL is driven by `NEXT_PUBLIC_APP_URL` — nothing about the code changes at cutover time.

## Prerequisites

- Neon Postgres project — one branch each for `production` and `preview`
- Upstash QStash — one account for the whole app; two queues named exactly `priority` and `bulk`
- AWS account with SES production access in `ap-south-1` (Mumbai), a `mail.abtalks.in` verified identity with Easy DKIM, and a configuration set named `abtalks-mailer`
- A GitHub repo (this working directory)
- A Vercel account with permission to create a new project

## Step 1 — Push to GitHub

```
git init
git add -A
git commit -m "Initial commit: ABTalks Email Infrastructure"
git remote add origin git@github.com:manuVrtti/ABT-mailer.git
git push -u origin main
```

## Step 2 — Create the Vercel project

Vercel dashboard → **Add New → Project → Import** the repo. Framework: Next.js (auto-detected). Region: `ap-south-1` (Mumbai / `bom1`) — matches SES. Deployment will fail the first time because env vars are missing. That's expected.

## Step 3 — Configure environment variables

In Vercel → Project → Settings → Environment Variables, add every key in [.env.example](../../.env.example) under **Production** (and copy them to **Preview** if you want previews to work). Use the pooled Neon URL for `DATABASE_URL` and the direct URL for `DIRECT_URL`. Set `NEXT_PUBLIC_APP_URL` and `NEXTAUTH_URL` to the temporary Vercel URL (`https://<generated>.vercel.app`); we'll change both at cutover.

Redeploy from the Deployments tab.

## Step 4 — First-run migration and seed

Locally, using the production connection strings:

```
DATABASE_URL="…" DIRECT_URL="…" npx prisma migrate deploy
SEED_ADMIN_EMAIL=abdevs0001@gmail.com SEED_ADMIN_PASSWORD=<a strong password> \
  DATABASE_URL="…" npx tsx prisma/seed.ts
```

Log in at `https://<generated>.vercel.app/login` with the admin creds. Verify:
- `/dashboard` loads
- `/settings/users` shows the admin
- `/api/health` returns `{ ok: true }`

## Step 5 — SNS subscription

Console → SNS → topic `abtalks-ses-events` → Create subscription:
- Protocol: **HTTPS**
- Endpoint: `https://<generated>.vercel.app/api/webhooks/ses`

Confirmation happens automatically; the endpoint auto-subscribes. Send a test email from the SES console — the DELIVERY event should appear in `/transactional/logs`.

## Step 6 — QStash scheduled launcher

QStash dashboard → Schedules → Create:
- URL: `https://<generated>.vercel.app/api/qstash/campaigns/launch`
- Cron: `* * * * *` (every minute)
- Body: `{}`

This picks up SCHEDULED campaigns whose time has arrived.

## Step 7 — Smoke test

- Create a marketing template + segment + campaign → **Send test** to yourself.
- POST a signed request to `/api/emails/transactional` (script under `scripts/verify-ses.ts` covers SES config; add a curl test for the HMAC endpoint if useful).
- Confirm the audit log at `/settings/audit` records both actions.

## Step 8 — Cutover to `mail.abtalks.in`

Only after Steps 1–7 are green.

1. DNS provider for `abtalks.in`: add a CNAME `mail.abtalks.in → cname.vercel-dns.com.` (or the exact target Vercel gives you in the Domains tab).
2. Vercel → Project → Domains → **Add** `mail.abtalks.in`. Wait for the SSL cert (a minute or two).
3. Update env: set `NEXT_PUBLIC_APP_URL` and `NEXTAUTH_URL` to `https://mail.abtalks.in`. Redeploy.
4. Optionally add a redirect from the old `<generated>.vercel.app` domain to `mail.abtalks.in`.
5. Update the ABTalks main app's environment variable `MAIL_APP_URL` to `https://mail.abtalks.in` and any subscribed SNS endpoint URLs in the SES configuration set.

Cookies: NextAuth cookies are scoped to the URL used at sign-in. Existing sessions won't survive the domain change; that's fine for an internal tool at cutover.

## Post-deploy hygiene

- Rotate `NEXTAUTH_SECRET`, `TRANSACTIONAL_API_HMAC_SECRET`, `UNSUBSCRIBE_TOKEN_SECRET` off their initial values.
- Confirm the DMARC observation window (`p=none` for 2 weeks, then `quarantine`, then `reject`) — schedule the transitions.
- Set up an uptime probe against `/api/health` from a monitoring service (Pingdom, BetterStack, etc.).
