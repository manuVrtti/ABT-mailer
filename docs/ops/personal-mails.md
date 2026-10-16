# Personal mails

Marketing → **Personal mails** sends a different email to each address from a
CSV: every row has its own recipient, subject, body and (optionally) files.

## CSV

| Column | Required | Notes |
|---|---|---|
| `email` | yes | Also detected as `Email ID`, `Recipient email`, … |
| `name` | no | Available as `{{name}}` |
| `subject` | yes | `{{column}}` tokens are filled per row |
| `body` | yes | Plain text (blank line = new paragraph, links clickable) or HTML |
| `attachment` | no | File name(s) of uploaded files, separated by `;` |

Every column is a variable: a `College` column can be used as `{{college}}`.
Unknown tokens are left as written so typos show in the preview.

## Attachments

Uploaded on the same screen, one request per file (Vercel caps a request at
~4.5 MB, so **4 MB per file**). A row gets the files its `attachment` cell
names (case-insensitive) plus any file ticked **Everyone**. A message's files
may total ~28 MB (SES allows 40 MB including base64 overhead). Files live in
`mail_attachments` and are deleted with their batch.

## Kinds

- **Personal** — transactional (non-essential) category, no unsubscribe link.
  For offer letters, certificates, interview mails.
- **Promotional** — marketing category: unsubscribe footer + List-Unsubscribe
  header, marketing opt-outs are skipped.

Hard bounces and manual blocks are skipped either way.

## Flow

1. **Upload & check** (`/marketing/personal/new`) — columns are auto-detected,
   every row is checked (invalid email, empty subject / body, file not
   uploaded, duplicates), any row can be previewed. Rows with problems can be
   skipped.
2. **Review & send** (`/marketing/personal/[id]`) — preview any row, send it to
   yourself as a test (with attachments), then send. Each row becomes one
   `email_jobs` row (`direct_send_id`, `attachment_ids`) on the normal queue,
   so retries, suppression, Logs and SES events all apply.
3. **Analytics** — sent, delivered, opened, clicked, bounced, failed, skipped
   for the batch, the same per email (with filters), and a **Report CSV**. Opens
   and clicks come from the SES configuration set's open / click tracking via
   the SNS webhook, as for campaigns.

## Setup

`npx prisma db push` adds `direct_sends`, `direct_send_rows`,
`mail_attachments` and `email_jobs.direct_send_id` / `attachment_ids`.
