export const metadata = { title: "Unsubscribed · ABTalks" };

export default function UnsubscribeDonePage({ searchParams }: { searchParams: { scope?: string } }) {
  const all = searchParams.scope === "all";
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center p-6">
      <div className="w-full rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mb-4 text-xs uppercase tracking-wider text-muted-foreground">ABTalks</div>
        <h1 className="text-xl font-semibold">You&apos;re unsubscribed</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {all
            ? "You'll no longer receive marketing or non-essential emails from ABTalks. Password resets and security notifications will still be delivered."
            : "You'll no longer receive marketing emails from ABTalks. Workshop confirmations, results, and account emails will still be delivered."}
        </p>
      </div>
    </main>
  );
}
