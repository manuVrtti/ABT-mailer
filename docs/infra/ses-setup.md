# Amazon SES setup — ap-south-1 (Mumbai)

Follow this once, in order. Anything below marked **REQUIRED** blocks sending.

## 1. Verify a sending identity **REQUIRED**

We send from `no-reply@mail.abtalks.in`. The verified identity should be the **subdomain** `mail.abtalks.in`, not the root domain, so DKIM/DMARC on `abtalks.in` stay unaffected.

```
AWS Console → SES (ap-south-1) → Verified identities → Create identity
  Identity type: Domain
  Domain: mail.abtalks.in
  Use a custom MAIL FROM domain: bounce.mail.abtalks.in
  Enable DKIM signing: Yes (Easy DKIM, RSA-2048)
```

SES will output:
- 3 × CNAME records for DKIM (`<selector>._domainkey.mail.abtalks.in`)
- 1 × MX record for the custom MAIL FROM domain
- 1 × TXT record (SPF) for the custom MAIL FROM domain

Add every record it lists to DNS (see `dns-records.md`). Verification usually takes 15–60 minutes.

## 2. Request production access **REQUIRED**

New AWS accounts are in the SES sandbox: 200/day, only to verified addresses. That is not enough for real campaigns.

```
SES → Account dashboard → Request production access
  Mail type: Transactional AND Marketing
  Website URL: https://mail.abtalks.in
  Use case description (paste):
    Internal email infrastructure for ABTalks (edtech, India). Two workloads:
      1. Transactional emails triggered by user actions (registration
         confirmations, workshop confirmations, password resets, assessment
         results) — signed HMAC API from the ABTalks main app.
      2. Opt-in marketing campaigns to registered users and students who
         consented at collection time.
    Bounce handling: Amazon SES SNS notifications feed our webhook, which
    writes to a per-email suppression list. Any hard bounce is suppressed
    across all categories. Complaints are suppressed for marketing.
    Unsubscribe: RFC 8058 one-click header on every marketing email plus a
    visible link. Preferences persisted per email.
    Sending frequency: campaigns run at most weekly; transactional volume
    tracks user activity.
  Additional contacts: ops@abtalks.in
```

Approval usually lands in 24 hours.

## 3. Create the Configuration Set **REQUIRED**

```
SES → Configuration sets → Create set
  Name: abtalks-mailer               ← must match SES_CONFIGURATION_SET env
  Reputation metrics: Enabled
  Sending: Enabled
  IP pool: default
  TLS: REQUIRE
  Suppression list: Account-level    ← blocks known-bad addresses at SES side
```

Then add event destinations:

```
Configuration set → Event destinations → Add destination
  Name: abtalks-mailer-events
  Destination type: Amazon SNS
  Topic: (create new) arn:aws:sns:ap-south-1:<acct>:abtalks-ses-events
  Events to publish:
    SEND, DELIVERY, BOUNCE, COMPLAINT, OPEN, CLICK, REJECT, RENDERING_FAILURE
```

## 4. Subscribe our webhook to the SNS topic

Once the app is deployed on Vercel:

```
SNS → abtalks-ses-events → Create subscription
  Protocol: HTTPS
  Endpoint: https://<NEXT_PUBLIC_APP_URL>/api/webhooks/ses
```

AWS sends a `SubscriptionConfirmation` message; our webhook handler confirms it automatically (Phase 14).

## 5. Create the IAM user for the app **REQUIRED**

```
IAM → Users → Create user: abtalks-mailer-app
  Access type: Programmatic (no console)
  Attach policy: (inline) → paste docs/infra/iam-policy.json
  MFA: N/A
```

Save the access key + secret **once**; paste them into Vercel env vars as `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`. Never commit them.

## 6. Verify from the app

After Neon is provisioned and the app has run:

```
npx tsx scripts/verify-ses.ts
```

That script checks:
- credentials work
- the identity exists and DKIM is `Success`
- the configuration set exists
- the send quota is non-sandbox
