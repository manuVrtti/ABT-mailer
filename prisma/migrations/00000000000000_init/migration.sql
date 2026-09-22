-- CreateEnum
CREATE TYPE "role" AS ENUM ('ADMIN', 'MARKETER', 'VIEWER');

-- CreateEnum
CREATE TYPE "email_category" AS ENUM ('MARKETING', 'TRANSACTIONAL_NONESSENTIAL', 'TRANSACTIONAL_ESSENTIAL');

-- CreateEnum
CREATE TYPE "email_type" AS ENUM ('MARKETING', 'TRANSACTIONAL');

-- CreateEnum
CREATE TYPE "campaign_status" AS ENUM ('DRAFT', 'SCHEDULED', 'QUEUED', 'SENDING', 'PAUSED', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "email_job_status" AS ENUM ('PENDING', 'QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'BOUNCED', 'COMPLAINED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "email_event_type" AS ENUM ('SEND', 'DELIVERY', 'BOUNCE', 'COMPLAINT', 'OPEN', 'CLICK', 'REJECT', 'RENDERING_FAILURE');

-- CreateEnum
CREATE TYPE "suppression_reason" AS ENUM ('UNSUBSCRIBE', 'HARD_BOUNCE', 'COMPLAINT', 'MANUAL');

-- CreateEnum
CREATE TYPE "consent_status" AS ENUM ('UNKNOWN', 'IMPLIED', 'EXPLICIT', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "contact_source" AS ENUM ('IMPORT', 'MANUAL', 'API', 'ABTALKS_USER');

-- CreateEnum
CREATE TYPE "import_job_status" AS ENUM ('PENDING', 'PARSING', 'VALIDATING', 'IMPORTING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "conversion_stage" AS ENUM ('CLICK', 'REGISTRATION', 'ASSESSMENT_STARTED', 'ASSESSMENT_COMPLETED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hashed_password" TEXT NOT NULL,
    "role" "role" NOT NULL DEFAULT 'VIEWER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_contacts" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "phone" TEXT,
    "college" TEXT,
    "branch" TEXT,
    "year" TEXT,
    "graduation_year" INTEGER,
    "registration_status" TEXT,
    "source" "contact_source" NOT NULL DEFAULT 'IMPORT',
    "consent_status" "consent_status" NOT NULL DEFAULT 'IMPLIED',
    "consent_date" TIMESTAMP(3),
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registered_user_refs" (
    "id" TEXT NOT NULL,
    "abtalks_user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "college" TEXT,
    "branch" TEXT,
    "year" TEXT,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registered_user_refs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_tag_on_contact" (
    "contact_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    CONSTRAINT "contact_tag_on_contact_pkey" PRIMARY KEY ("contact_id","tag_id")
);

-- CreateTable
CREATE TABLE "segments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rules" JSONB NOT NULL,
    "audience_size" INTEGER,
    "computed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "preview_text" TEXT,
    "design_json" JSONB NOT NULL,
    "html" TEXT NOT NULL,
    "variables" TEXT[],
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactional_templates" (
    "id" TEXT NOT NULL,
    "template_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "text" TEXT,
    "variables" TEXT[],
    "category" "email_category" NOT NULL DEFAULT 'TRANSACTIONAL_NONESSENTIAL',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactional_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_event_rules" (
    "id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "description" TEXT,
    "template_key" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "required_vars" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_event_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "preview_text" TEXT,
    "from_name" TEXT NOT NULL,
    "from_email" TEXT NOT NULL,
    "reply_to" TEXT,
    "status" "campaign_status" NOT NULL DEFAULT 'DRAFT',
    "template_id" TEXT,
    "segment_id" TEXT,
    "scheduled_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "total_recipients" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "delivered_count" INTEGER NOT NULL DEFAULT 0,
    "bounced_count" INTEGER NOT NULL DEFAULT 0,
    "complained_count" INTEGER NOT NULL DEFAULT 0,
    "opened_count" INTEGER NOT NULL DEFAULT 0,
    "clicked_count" INTEGER NOT NULL DEFAULT 0,
    "unsubscribed_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_recipients" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "email_job_id" TEXT,
    "contact_id" TEXT,
    "registered_user_ref_id" TEXT,
    "email" TEXT NOT NULL,
    "variables" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_jobs" (
    "id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "email_type" "email_type" NOT NULL,
    "category" "email_category" NOT NULL,
    "status" "email_job_status" NOT NULL DEFAULT 'PENDING',
    "recipient_email" TEXT NOT NULL,
    "contact_id" TEXT,
    "registered_user_ref_id" TEXT,
    "campaign_id" TEXT,
    "template_key" TEXT,
    "template_version" INTEGER,
    "email_template_id" TEXT,
    "event_type" TEXT,
    "event_id" TEXT,
    "subject" TEXT NOT NULL,
    "from_email" TEXT NOT NULL,
    "from_name" TEXT NOT NULL,
    "reply_to" TEXT,
    "variables" JSONB NOT NULL,
    "rendered_html" TEXT,
    "rendered_text" TEXT,
    "provider_message_id" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "scheduled_for" TIMESTAMP(3),
    "queued_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "provider_message_id" TEXT,
    "status" "email_job_status" NOT NULL,
    "error_code" TEXT,
    "error_message" TEXT,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "bounced_at" TIMESTAMP(3),
    "complained_at" TIMESTAMP(3),
    "opened_at" TIMESTAMP(3),
    "clicked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_events" (
    "id" TEXT NOT NULL,
    "job_id" TEXT,
    "provider_message_id" TEXT,
    "type" "email_event_type" NOT NULL,
    "raw" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppressions" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "category" "email_category" NOT NULL,
    "reason" "suppression_reason" NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppressions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unsubscribe_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "category" "email_category" NOT NULL DEFAULT 'MARKETING',
    "campaign_id" TEXT,
    "used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unsubscribe_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "file_url" TEXT,
    "status" "import_job_status" NOT NULL DEFAULT 'PENDING',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "imported" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "invalid" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "column_map" JSONB,
    "error" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_row_errors" (
    "id" TEXT NOT NULL,
    "import_job_id" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "row_data" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_row_errors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,
    "result" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversion_events" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT,
    "campaign_slug" TEXT,
    "contact_id" TEXT,
    "registered_user_ref_id" TEXT,
    "email" TEXT,
    "stage" "conversion_stage" NOT NULL,
    "metadata" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversion_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_EmailEventRuleToTransactionalTemplate" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "marketing_contacts_email_key" ON "marketing_contacts"("email");

-- CreateIndex
CREATE INDEX "marketing_contacts_college_branch_year_idx" ON "marketing_contacts"("college", "branch", "year");

-- CreateIndex
CREATE INDEX "marketing_contacts_registration_status_idx" ON "marketing_contacts"("registration_status");

-- CreateIndex
CREATE INDEX "marketing_contacts_consent_status_idx" ON "marketing_contacts"("consent_status");

-- CreateIndex
CREATE INDEX "marketing_contacts_created_at_idx" ON "marketing_contacts"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "registered_user_refs_abtalks_user_id_key" ON "registered_user_refs"("abtalks_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "registered_user_refs_email_key" ON "registered_user_refs"("email");

-- CreateIndex
CREATE INDEX "registered_user_refs_college_branch_year_idx" ON "registered_user_refs"("college", "branch", "year");

-- CreateIndex
CREATE UNIQUE INDEX "contact_tags_name_key" ON "contact_tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "segments_name_key" ON "segments"("name");

-- CreateIndex
CREATE INDEX "email_templates_category_idx" ON "email_templates"("category");

-- CreateIndex
CREATE INDEX "transactional_templates_template_key_is_active_idx" ON "transactional_templates"("template_key", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "transactional_templates_template_key_version_key" ON "transactional_templates"("template_key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "email_event_rules_event_type_key" ON "email_event_rules"("event_type");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_slug_key" ON "campaigns"("slug");

-- CreateIndex
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- CreateIndex
CREATE INDEX "campaigns_scheduled_at_idx" ON "campaigns"("scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_email_job_id_key" ON "campaign_recipients"("email_job_id");

-- CreateIndex
CREATE INDEX "campaign_recipients_campaign_id_idx" ON "campaign_recipients"("campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_campaign_id_email_key" ON "campaign_recipients"("campaign_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "email_jobs_idempotency_key_key" ON "email_jobs"("idempotency_key");

-- CreateIndex
CREATE INDEX "email_jobs_email_type_status_idx" ON "email_jobs"("email_type", "status");

-- CreateIndex
CREATE INDEX "email_jobs_status_scheduled_for_idx" ON "email_jobs"("status", "scheduled_for");

-- CreateIndex
CREATE INDEX "email_jobs_campaign_id_idx" ON "email_jobs"("campaign_id");

-- CreateIndex
CREATE INDEX "email_jobs_recipient_email_idx" ON "email_jobs"("recipient_email");

-- CreateIndex
CREATE INDEX "email_jobs_provider_message_id_idx" ON "email_jobs"("provider_message_id");

-- CreateIndex
CREATE INDEX "email_logs_job_id_idx" ON "email_logs"("job_id");

-- CreateIndex
CREATE INDEX "email_logs_provider_message_id_idx" ON "email_logs"("provider_message_id");

-- CreateIndex
CREATE INDEX "email_events_type_idx" ON "email_events"("type");

-- CreateIndex
CREATE INDEX "email_events_provider_message_id_idx" ON "email_events"("provider_message_id");

-- CreateIndex
CREATE INDEX "email_events_job_id_type_idx" ON "email_events"("job_id", "type");

-- CreateIndex
CREATE INDEX "suppressions_email_idx" ON "suppressions"("email");

-- CreateIndex
CREATE UNIQUE INDEX "suppressions_email_category_key" ON "suppressions"("email", "category");

-- CreateIndex
CREATE UNIQUE INDEX "unsubscribe_tokens_token_key" ON "unsubscribe_tokens"("token");

-- CreateIndex
CREATE INDEX "unsubscribe_tokens_email_idx" ON "unsubscribe_tokens"("email");

-- CreateIndex
CREATE INDEX "import_jobs_status_idx" ON "import_jobs"("status");

-- CreateIndex
CREATE INDEX "import_row_errors_import_job_id_idx" ON "import_row_errors"("import_job_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "conversion_events_campaign_id_stage_idx" ON "conversion_events"("campaign_id", "stage");

-- CreateIndex
CREATE INDEX "conversion_events_email_idx" ON "conversion_events"("email");

-- CreateIndex
CREATE UNIQUE INDEX "_EmailEventRuleToTransactionalTemplate_AB_unique" ON "_EmailEventRuleToTransactionalTemplate"("A", "B");

-- CreateIndex
CREATE INDEX "_EmailEventRuleToTransactionalTemplate_B_index" ON "_EmailEventRuleToTransactionalTemplate"("B");

-- AddForeignKey
ALTER TABLE "contact_tag_on_contact" ADD CONSTRAINT "contact_tag_on_contact_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "marketing_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_tag_on_contact" ADD CONSTRAINT "contact_tag_on_contact_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "contact_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactional_templates" ADD CONSTRAINT "transactional_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_email_job_id_fkey" FOREIGN KEY ("email_job_id") REFERENCES "email_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_jobs" ADD CONSTRAINT "email_jobs_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_jobs" ADD CONSTRAINT "email_jobs_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "marketing_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_jobs" ADD CONSTRAINT "email_jobs_registered_user_ref_id_fkey" FOREIGN KEY ("registered_user_ref_id") REFERENCES "registered_user_refs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "email_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "email_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_row_errors" ADD CONSTRAINT "import_row_errors_import_job_id_fkey" FOREIGN KEY ("import_job_id") REFERENCES "import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "marketing_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_registered_user_ref_id_fkey" FOREIGN KEY ("registered_user_ref_id") REFERENCES "registered_user_refs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EmailEventRuleToTransactionalTemplate" ADD CONSTRAINT "_EmailEventRuleToTransactionalTemplate_A_fkey" FOREIGN KEY ("A") REFERENCES "email_event_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EmailEventRuleToTransactionalTemplate" ADD CONSTRAINT "_EmailEventRuleToTransactionalTemplate_B_fkey" FOREIGN KEY ("B") REFERENCES "transactional_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

