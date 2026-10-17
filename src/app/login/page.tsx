import { redirect } from "next/navigation";
import { BarChart3, DatabaseZap, Mail, Send, ShieldCheck } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

const POINTS = [
  { icon: DatabaseZap, title: "Live audiences", text: "Lists that stay in sync with the Klymb database." },
  { icon: Send, title: "Campaigns & personal mails", text: "Bulk sends, or a different email to every person." },
  { icon: BarChart3, title: "Real analytics", text: "Delivered, opened, clicked and bounced — per email." },
  { icon: ShieldCheck, title: "Deliverability built in", text: "Suppressions, unsubscribes and bounce handling." },
];

export default async function LoginPage({ searchParams }: { searchParams: { next?: string; error?: string } }) {
  const session = await getSession();
  if (session?.user) redirect(searchParams.next ?? "/dashboard");

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* Form */}
      <section className="flex flex-col px-6 py-8 sm:px-12">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-brand-600 text-white shadow-xs">
            <Mail className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <span className="text-base font-semibold tracking-tight">Mailer</span>
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Welcome back. Enter your work email and password.</p>
          <div className="mt-8">
            <LoginForm callbackUrl={searchParams.next} initialError={searchParams.error} />
          </div>
          <p className="mt-8 text-xs text-muted-foreground">
            Accounts are created by your administrator. Can’t sign in? Ask an admin for access.
          </p>
        </div>

        <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Mailer · ABTalks &amp; Klymb</p>
      </section>

      {/* Product panel */}
      <section className="relative hidden overflow-hidden bg-brand-950 lg:flex lg:flex-col lg:justify-center lg:px-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight text-white">
            Every email your team sends, in one place.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-brand-100/80">
            Campaigns, one-to-one mails and transactional email for ABTalks and Klymb — with the numbers to show what worked.
          </p>
          <ul className="mt-10 space-y-5">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-3.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 text-brand-200 ring-1 ring-inset ring-white/10">
                  <p.icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-medium text-white">{p.title}</span>
                  <span className="block text-sm text-brand-100/70">{p.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
