# ABTalks Email Infrastructure

Internal marketing + transactional email system for ABTalks. Built with Next.js, Prisma, Postgres, Amazon SES, and Upstash QStash. Deploys to Vercel — first at a temporary `*.vercel.app` URL, later at `https://mail.abtalks.in`. **Do not hardcode either domain.** All URLs derive from `NEXT_PUBLIC_APP_URL`.

## Architecture (one line)

Marketing UI and a HMAC-signed transactional API both feed one `EmailService` → QStash (priority + bulk queues) → worker → SES v2 (ap-south-1) → SNS webhook → email logs, events, suppression, analytics.

See the phased plan in the project's implementation todos; details live per phase.

## Local development

```bash
cp .env.example .env.local   # fill in DATABASE_URL, NEXTAUTH_SECRET, etc.
npm install
npm run prisma:generate
npm run dev
```

The app boots even without SES / QStash credentials — those are validated only when the corresponding features run.

## Notes

- **Never** commit `.env` or `.env.local`.
- **Never** prefix AWS or DB secrets with `NEXT_PUBLIC_`.
- Domain cutover to `mail.abtalks.in` is a configuration change (`NEXT_PUBLIC_APP_URL`, `NEXTAUTH_URL`, DNS), not a code change.
