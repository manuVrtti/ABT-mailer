import { DatabaseZap } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { loadKlymbFilterOptions, type KlymbFilterOptions } from "@/server/klymb/options";

export async function loadOptionsOrError(): Promise<{ ok: true; options: KlymbFilterOptions } | { ok: false; error: string }> {
  try {
    return { ok: true, options: await loadKlymbFilterOptions() };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export function KlymbUnavailable({ error }: { error: string }) {
  return (
    <EmptyState
      icon={DatabaseZap}
      title="Can't reach the Klymb database"
      description={`${error} Check ABTALKS_DB_URL in the environment, then reload this page.`}
    />
  );
}
