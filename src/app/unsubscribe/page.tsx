import { verifyUnsubscribeToken } from "@/server/unsubscribe/token";
import { confirmUnsubscribe } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Unsubscribe · ABTalks" };

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: { t?: string; error?: string };
}) {
  const token = searchParams.t ?? "";
  const claims = token ? await verifyUnsubscribeToken(token) : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-6 p-6">
      <div className="w-full rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-4 text-xs uppercase tracking-wider text-muted-foreground">ABTalks</div>
        <h1 className="text-xl font-semibold">Manage your email preferences</h1>

        {!claims ? (
          <p className="mt-3 text-sm text-muted-foreground">
            This unsubscribe link is invalid or has expired. If you keep receiving unwanted emails, reply to any of
            them and we&apos;ll remove you manually.
          </p>
        ) : (
          <>
            <p className="mt-3 text-sm text-muted-foreground">
              You&apos;re about to unsubscribe <b>{claims.email}</b> from ABTalks marketing emails. Account and
              security emails (like password resets) will still be delivered.
            </p>
            <form action={confirmUnsubscribe} className="mt-6 space-y-3">
              <input type="hidden" name="token" value={token} />
              <label className="flex items-start gap-2 rounded-md border border-border p-3 text-sm">
                <input type="radio" name="scope" value="marketing" defaultChecked className="mt-1 h-4 w-4" />
                <span>
                  <b>Unsubscribe from marketing only</b>
                  <div className="text-xs text-muted-foreground">
                    Stops campaigns and announcements. Workshop confirmations, results, and account emails still arrive.
                  </div>
                </span>
              </label>
              <label className="flex items-start gap-2 rounded-md border border-border p-3 text-sm">
                <input type="radio" name="scope" value="all" className="mt-1 h-4 w-4" />
                <span>
                  <b>Stop all optional emails</b>
                  <div className="text-xs text-muted-foreground">
                    Marketing plus non-critical reminders. You&apos;ll still get password resets and security notifications.
                  </div>
                </span>
              </label>
              <button
                type="submit"
                className="mt-4 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
              >
                Confirm unsubscribe
              </button>
            </form>
          </>
        )}
      </div>
      {searchParams.error && (
        <p className="text-xs text-destructive">Link invalid or expired.</p>
      )}
    </main>
  );
}
