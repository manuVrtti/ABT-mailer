import { PrismaClient, Role, EmailCategory } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const TRANSACTIONAL_TEMPLATES: Array<{
  templateKey: string;
  name: string;
  subject: string;
  html: string;
  text: string;
  variables: string[];
  category: EmailCategory;
}> = [
  {
    templateKey: "welcome_email",
    name: "Welcome Email",
    subject: "Welcome to ABTalks, {{first_name}}",
    html: "<p>Hi {{first_name}},</p><p>Welcome to ABTalks. We're glad you're here.</p>",
    text: "Hi {{first_name}},\n\nWelcome to ABTalks. We're glad you're here.",
    variables: ["first_name"],
    category: EmailCategory.TRANSACTIONAL_NONESSENTIAL,
  },
  {
    templateKey: "registration_confirmation",
    name: "Registration Confirmation",
    subject: "You're registered for {{event_name}}",
    html: "<p>Hi {{first_name}},</p><p>You're confirmed for <b>{{event_name}}</b> on {{event_date}}.</p><p><a href=\"{{event_link}}\">View details</a></p>",
    text: "Hi {{first_name}},\n\nYou're confirmed for {{event_name}} on {{event_date}}.\n\n{{event_link}}",
    variables: ["first_name", "event_name", "event_date", "event_link"],
    category: EmailCategory.TRANSACTIONAL_NONESSENTIAL,
  },
  {
    templateKey: "workshop_confirmation",
    name: "Workshop Confirmation",
    subject: "Workshop confirmed: {{event_name}}",
    html: "<p>Hi {{first_name}},</p><p>You're in for the <b>{{event_name}}</b> workshop on {{event_date}}.</p>",
    text: "Hi {{first_name}},\n\nYou're in for the {{event_name}} workshop on {{event_date}}.",
    variables: ["first_name", "event_name", "event_date"],
    category: EmailCategory.TRANSACTIONAL_NONESSENTIAL,
  },
  {
    templateKey: "assessment_completed",
    name: "Assessment Completed",
    subject: "Your {{assessment_name}} results are ready",
    html: "<p>Hi {{first_name}},</p><p>Your <b>{{assessment_name}}</b> results are ready. <a href=\"{{result_link}}\">View report</a>.</p>",
    text: "Hi {{first_name}},\n\nYour {{assessment_name}} results are ready: {{result_link}}",
    variables: ["first_name", "assessment_name", "result_link"],
    category: EmailCategory.TRANSACTIONAL_NONESSENTIAL,
  },
  {
    templateKey: "interview_completed",
    name: "Interview Completed",
    subject: "Interview report — {{interview_title}}",
    html: "<p>Hi {{first_name}},</p><p>Your interview report for <b>{{interview_title}}</b> is ready. <a href=\"{{report_link}}\">Open report</a>.</p>",
    text: "Hi {{first_name}},\n\nYour interview report for {{interview_title}} is ready: {{report_link}}",
    variables: ["first_name", "interview_title", "report_link"],
    category: EmailCategory.TRANSACTIONAL_NONESSENTIAL,
  },
  {
    templateKey: "shortlisted",
    name: "Shortlisted Notification",
    subject: "You've been shortlisted for {{opportunity_name}}",
    html: "<p>Hi {{first_name}},</p><p>Great news — you've been shortlisted for <b>{{opportunity_name}}</b>.</p>",
    text: "Hi {{first_name}},\n\nGreat news — you've been shortlisted for {{opportunity_name}}.",
    variables: ["first_name", "opportunity_name"],
    category: EmailCategory.TRANSACTIONAL_NONESSENTIAL,
  },
  {
    templateKey: "password_reset",
    name: "Password Reset",
    subject: "Reset your ABTalks password",
    html: "<p>Hi {{first_name}},</p><p>Click <a href=\"{{reset_link}}\">here</a> to reset your password. This link expires in {{expires_in}}.</p><p>If you didn't request this, ignore this email.</p>",
    text: "Hi {{first_name}},\n\nReset your password: {{reset_link}}\nThis link expires in {{expires_in}}.\n\nIf you didn't request this, ignore this email.",
    variables: ["first_name", "reset_link", "expires_in"],
    // Password reset must never be blocked by a marketing unsubscribe.
    category: EmailCategory.TRANSACTIONAL_ESSENTIAL,
  },
  {
    templateKey: "application_reminder",
    name: "Application Deadline Reminder",
    subject: "Reminder: {{opportunity_name}} deadline approaching",
    html: "<p>Hi {{first_name}},</p><p>The deadline for <b>{{opportunity_name}}</b> is {{deadline}}.</p>",
    text: "Hi {{first_name}},\n\nThe deadline for {{opportunity_name}} is {{deadline}}.",
    variables: ["first_name", "opportunity_name", "deadline"],
    category: EmailCategory.TRANSACTIONAL_NONESSENTIAL,
  },
];

const EVENT_RULES: Array<{ eventType: string; templateKey: string; description: string; requiredVars: string[] }> = [
  { eventType: "USER_REGISTERED", templateKey: "welcome_email", description: "Sent after ABTalks account creation", requiredVars: ["first_name"] },
  { eventType: "WORKSHOP_REGISTERED", templateKey: "workshop_confirmation", description: "Sent after workshop signup", requiredVars: ["first_name", "event_name", "event_date"] },
  { eventType: "ASSESSMENT_COMPLETED", templateKey: "assessment_completed", description: "Sent after an assessment is completed", requiredVars: ["first_name", "assessment_name", "result_link"] },
  { eventType: "INTERVIEW_COMPLETED", templateKey: "interview_completed", description: "Sent after an interview is completed", requiredVars: ["first_name", "interview_title", "report_link"] },
  { eventType: "USER_SHORTLISTED", templateKey: "shortlisted", description: "Sent when a student is shortlisted", requiredVars: ["first_name", "opportunity_name"] },
  { eventType: "PASSWORD_RESET_REQUESTED", templateKey: "password_reset", description: "Sent on password reset request (essential)", requiredVars: ["first_name", "reset_link", "expires_in"] },
  { eventType: "APPLICATION_DEADLINE_APPROACHING", templateKey: "application_reminder", description: "Sent when an application deadline is close", requiredVars: ["first_name", "opportunity_name", "deadline"] },
];

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "abdevs0001@gmail.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "changeme-on-first-login";
  const hashed = await bcrypt.hash(adminPassword, 12);

  const admin = await db.user.upsert({
    where: { email: adminEmail },
    update: { role: Role.ADMIN, isActive: true },
    create: {
      email: adminEmail,
      name: "ABTalks Admin",
      hashedPassword: hashed,
      role: Role.ADMIN,
    },
  });
  console.warn(`Seeded admin user: ${admin.email}`);

  for (const t of TRANSACTIONAL_TEMPLATES) {
    await db.transactionalTemplate.upsert({
      where: { templateKey_version: { templateKey: t.templateKey, version: 1 } },
      update: {
        name: t.name,
        subject: t.subject,
        html: t.html,
        text: t.text,
        variables: t.variables,
        category: t.category,
        isActive: true,
      },
      create: {
        templateKey: t.templateKey,
        version: 1,
        name: t.name,
        subject: t.subject,
        html: t.html,
        text: t.text,
        variables: t.variables,
        category: t.category,
        isActive: true,
      },
    });
  }
  console.warn(`Seeded ${TRANSACTIONAL_TEMPLATES.length} transactional templates`);

  for (const r of EVENT_RULES) {
    await db.emailEventRule.upsert({
      where: { eventType: r.eventType },
      update: { templateKey: r.templateKey, description: r.description, requiredVars: r.requiredVars, isActive: true },
      create: {
        eventType: r.eventType,
        templateKey: r.templateKey,
        description: r.description,
        requiredVars: r.requiredVars,
        isActive: true,
      },
    });
  }
  console.warn(`Seeded ${EVENT_RULES.length} event rules`);
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
