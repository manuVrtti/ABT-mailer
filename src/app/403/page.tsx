import Link from "next/link";

export const metadata = { title: "Not authorized" };

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-muted/40 p-8 text-center">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">403</div>
      <h1 className="text-xl font-semibold">You don&apos;t have access to this page</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Your account is signed in but doesn&apos;t have the role required for this area. Ask an admin to grant access.
      </p>
      <Link href="/dashboard" className="mt-4 text-sm underline underline-offset-4">
        Back to dashboard
      </Link>
    </main>
  );
}
