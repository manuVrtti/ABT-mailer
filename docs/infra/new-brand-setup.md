# Adding a sending brand (Klymb · klymb.ai)

ABT-mailer can send as several brands from one SES account. Each brand is one
domain verified in SES; campaigns pick a From address from **Settings → Senders**,
and unsubscribes / complaints are kept per brand (hard bounces block every
brand). This walks through adding **Klymb** (`team@klymb.ai`, `no-reply@klymb.ai`)
next to ABTalks. The same steps work for any future brand.

Shared, nothing to do: SES account + production access, sending quota
(both brands share it), configuration set `abtalks-mailer`, SNS topic and
webhook, QStash, Neon, Vercel project.

---

## Part A — database + app (once, for multi-brand support)

Order matters: the schema must exist before the new code is live.

1. **Push the schema** (adds `brands` and `suppressions.brand_key`; additive):
   ```
   DATABASE_URL="<pooled>" DIRECT_URL="<direct>" npx prisma db push
   ```
   Merge the PR **right after** — between the push and the deploy, the old
   code can't record unsubscribes/bounces (its unique key changed).
2. **Merge and deploy** the multi-brand PR; wait for Vercel **Ready**.
3. **Create the brands and tag old unsubscribes as ABTalks**:
   ```
   npx tsx --env-file=.env scripts/setup-brands.ts          # dry run
   npx tsx --env-file=.env scripts/setup-brands.ts --apply
   ```
   Creates ABTalks (verified, default for now) and Klymb (not verified yet).

## Part B — AWS SES: verify klymb.ai

Region **ap-south-1 (Mumbai)** — same as ABTalks.

1. **SES → Verified identities → Create identity**
   - Identity type: **Domain** · Domain: **`klymb.ai`**
   - Advanced DKIM: **Easy DKIM, RSA 2048-bit**, DKIM signing **on**
   - **Use a custom MAIL FROM domain**: `bounce.klymb.ai`,
     behaviour on MX failure: *Use default MAIL FROM*
   - Configuration set: **`abtalks-mailer`** (default set for this identity)
2. SES shows the DNS records. Add them where `klymb.ai`'s DNS is hosted
   (GoDaddy / Cloudflare / Route 53 …) — see Part C.
3. Wait until the identity shows **Verified** and DKIM **Successful**
   (usually 15–60 min, up to 72 h).
4. **IAM**: the mailer's IAM user may only send from listed identities. In
   **IAM → Users → (mailer user) → Permissions**, update the inline policy to
   `docs/infra/iam-policy.json` (adds `identity/klymb.ai` and
   `ses:GetEmailIdentity`). Without this SES refuses every Klymb email with
   `AccessDenied`.
5. No new production-access request: it is per account, not per domain.

## Part C — DNS records for klymb.ai

Copy the exact values from the SES identity page; shapes:

| Host | Type | Value | Why |
| --- | --- | --- | --- |
| `<sel1>._domainkey.klymb.ai` | CNAME | `<sel1>.dkim.amazonses.com` | DKIM 1/3 |
| `<sel2>._domainkey.klymb.ai` | CNAME | `<sel2>.dkim.amazonses.com` | DKIM 2/3 |
| `<sel3>._domainkey.klymb.ai` | CNAME | `<sel3>.dkim.amazonses.com` | DKIM 3/3 |
| `bounce.klymb.ai` | MX | `10 feedback-smtp.ap-south-1.amazonses.com` | custom MAIL FROM |
| `bounce.klymb.ai` | TXT | `v=spf1 include:amazonses.com -all` | SPF for MAIL FROM |
| `_dmarc.klymb.ai` | TXT | `v=DMARC1; p=none; rua=mailto:dmarc@klymb.ai; pct=100` | DMARC — **only if klymb.ai has none yet** |

- **Don't change the root `klymb.ai` SPF or MX** — they belong to the inbox
  provider that receives `team@klymb.ai`. SES mail passes SPF through
  `bounce.klymb.ai` and DKIM through `klymb.ai`, which satisfies DMARC.
- If `_dmarc.klymb.ai` already exists, keep it. Avoid `aspf=s` (strict SPF):
  the MAIL FROM is a subdomain, so SPF alignment needs relaxed mode (the default).
- DMARC rollout: `p=none` for ~2 weeks, check reports, then `p=quarantine`.
- `team@klymb.ai` must be a real mailbox (Google Workspace / Microsoft 365)
  if it's used as Reply-to — replies go there, not to SES.

Check from a terminal: `nslookup -type=cname <sel1>._domainkey.klymb.ai`,
`nslookup -type=mx bounce.klymb.ai`.

## Part D — turn Klymb on in ABT-mailer

1. **Settings → Senders → Klymb → Check SES**. It should say
   *Verified for sending · DKIM SUCCESS · MAIL FROM SUCCESS* and **Can send**.
2. Check From name, addresses and Reply-to under **Edit**.
3. **Make default** on Klymb: new campaigns and website mail without an
   explicit sender now use `team@klymb.ai`. ABTalks stays selectable.
4. **Test**: new campaign → Sender `Klymb — team@klymb.ai` → **Send test** to
   your Gmail. Open it → ⋮ → *Show original*: `SPF: PASS`, `DKIM: PASS`
   (`klymb.ai`), `DMARC: PASS`. The footer says *Klymb · This email was sent to…*
   and the unsubscribe page says Klymb.
5. Warm up: send the first Klymb campaigns to your most engaged contacts in
   smaller batches (a few thousand per day, growing over 1–2 weeks). A new
   domain with 10k emails on day one tends to land in spam.

## Part E — the website's automatic emails (OTP, notifications)

Once Klymb shows **Can send**, in the **website's** Vercel env:
```
FROM_EMAIL=team@klymb.ai          # or no-reply@klymb.ai
FROM_NAME=Klymb
REPLY_TO_EMAIL=team@klymb.ai
```
Redeploy. ABT-mailer accepts any address on a verified brand domain and
refuses unverified ones (`sender_not_verified:<domain>`), so set these only
after Part D step 1. The email copy itself (templates saying "ABTalks") is the
website's rebrand work.
