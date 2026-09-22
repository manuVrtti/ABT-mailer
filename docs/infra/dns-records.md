# DNS records for `mail.abtalks.in`

Add these to the DNS provider for `abtalks.in`. All records live under the `mail.abtalks.in` (and `bounce.mail.abtalks.in`) subtree; the root `abtalks.in` is untouched.

The actual DKIM values come from the SES "Verified identity" screen — treat the ones below as **placeholders**. SPF, DMARC, and MAIL FROM records below are the exact values to publish.

## DKIM (Easy DKIM, three CNAMEs)

Paste the three CNAMEs SES displays after step 1 of `ses-setup.md`. Shape:

| Host                                                  | Type  | Value                                        |
| ----------------------------------------------------- | ----- | -------------------------------------------- |
| `<sel1>._domainkey.mail.abtalks.in`                   | CNAME | `<sel1>.dkim.amazonses.com`                  |
| `<sel2>._domainkey.mail.abtalks.in`                   | CNAME | `<sel2>.dkim.amazonses.com`                  |
| `<sel3>._domainkey.mail.abtalks.in`                   | CNAME | `<sel3>.dkim.amazonses.com`                  |

## Custom MAIL FROM domain (`bounce.mail.abtalks.in`)

| Host                        | Type | Value                                       | TTL |
| --------------------------- | ---- | ------------------------------------------- | --- |
| `bounce.mail.abtalks.in`    | MX   | `10 feedback-smtp.ap-south-1.amazonses.com` | 300 |
| `bounce.mail.abtalks.in`    | TXT  | `v=spf1 include:amazonses.com -all`         | 300 |

## SPF for the sending subdomain

We do not send arbitrary mail *from* the app subdomain, but SPF must exist so reputational engines don't fall back to the root. Publish a strict record:

| Host              | Type | Value                                | TTL |
| ----------------- | ---- | ------------------------------------ | --- |
| `mail.abtalks.in` | TXT  | `v=spf1 include:amazonses.com -all`  | 300 |

## DMARC

Start in `p=none` mode with 100% aggregate reporting for two weeks, then move to `quarantine`, then `reject`. **Do not skip the observation window** — a bad DKIM/SPF setup at `p=reject` bounces every real email.

Rollout schedule (record the calendar dates you actually apply):

| Week | Policy       | Record                                                                                                     |
| ---- | ------------ | ---------------------------------------------------------------------------------------------------------- |
| 0    | none         | `_dmarc.mail.abtalks.in` TXT `v=DMARC1; p=none; rua=mailto:dmarc-reports@abtalks.in; adkim=s; aspf=s; pct=100` |
| 2    | quarantine   | `_dmarc.mail.abtalks.in` TXT `v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@abtalks.in; adkim=s; aspf=s; pct=100` |
| 4    | reject       | `_dmarc.mail.abtalks.in` TXT `v=DMARC1; p=reject; rua=mailto:dmarc-reports@abtalks.in; adkim=s; aspf=s; pct=100` |

If the root `abtalks.in` already has a DMARC record, this subdomain-scoped record takes precedence for `mail.abtalks.in`. If it does not, also publish a `_dmarc.abtalks.in` record — subdomains inherit from the org policy when their own is missing.

## App domain (Vercel)

Later, when the app is cut over from `<generated>.vercel.app` to `mail.abtalks.in`:

| Host              | Type  | Value                | Notes                              |
| ----------------- | ----- | -------------------- | ---------------------------------- |
| `mail.abtalks.in` | CNAME | `cname.vercel-dns.com.` | Only if Vercel Domains manages it |

**Cutover checklist**

1. Update `NEXT_PUBLIC_APP_URL` and `NEXTAUTH_URL` in Vercel to `https://mail.abtalks.in`.
2. Redeploy.
3. Test login, unsubscribe link, and the transactional API from the new URL.
4. Only then flip DNS. NextAuth cookies are scoped to the URL you deploy under, so old sessions won't survive the domain change.
