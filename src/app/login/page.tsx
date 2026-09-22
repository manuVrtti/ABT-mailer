import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: { next?: string; error?: string } }) {
  const session = await getSession();
  if (session?.user) redirect(searchParams.next ?? "/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">ABTalks</div>
          <h1 className="mt-1 text-xl font-semibold">Email Infrastructure</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to continue</p>
        </div>
        <LoginForm callbackUrl={searchParams.next} initialError={searchParams.error} />
      </div>
    </main>
  );
}
