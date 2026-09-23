import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: { next?: string; error?: string } }) {
  const session = await getSession();
  if (session?.user) redirect(searchParams.next ?? "/dashboard");

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 p-4 dark:bg-slate-950">
      {/* Ambient background gradient */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/4 h-96 w-96 rounded-full bg-indigo-300/30 blur-3xl dark:bg-indigo-700/20" />
        <div className="absolute -bottom-24 right-1/4 h-96 w-96 rounded-full bg-violet-300/30 blur-3xl dark:bg-violet-700/20" />
      </div>

      <div className="relative w-full max-w-sm rounded-2xl border border-border/60 bg-white p-8 shadow-xl dark:bg-slate-900">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-semibold text-white shadow-sm">
            AB
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">ABTalks</div>
            <div className="-mt-0.5 text-base font-semibold">Email Infrastructure</div>
          </div>
        </div>
        <h1 className="text-lg font-semibold">Welcome back</h1>
        <p className="mt-1 text-xs text-muted-foreground">Sign in to manage campaigns, contacts, and templates.</p>
        <div className="mt-6">
          <LoginForm callbackUrl={searchParams.next} initialError={searchParams.error} />
        </div>
      </div>
    </main>
  );
}
