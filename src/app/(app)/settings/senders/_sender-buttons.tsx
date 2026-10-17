"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import {
  checkBrandInSes,
  deleteBrand,
  makeDefaultBrand,
  saveBrand,
  type SenderActionResult,
} from "./actions";
import { confirmDialog } from "@/components/overlay";

function Message({ res }: { res: SenderActionResult | null }) {
  if (!res) return null;
  return (
    <p className={`text-xs ${res.ok ? "text-emerald-700 dark:text-emerald-300" : "text-destructive"}`}>
      {res.ok ? res.message : res.error}
    </p>
  );
}

export function BrandRowActions({ id, isDefault, canSend }: { id: string; isDefault: boolean; canSend: boolean }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<SenderActionResult | null>(null);
  const run = (fn: () => Promise<SenderActionResult>) => start(async () => setRes(await fn()));

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={pending} onClick={() => run(() => checkBrandInSes(id))}>
          {pending ? "Checking…" : "Check SES"}
        </Button>
        {!isDefault && canSend && (
          <Button type="button" variant="secondary" disabled={pending} onClick={() => run(() => makeDefaultBrand(id))}>
            Make default
          </Button>
        )}
        {!isDefault && (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            className="text-destructive"
            onClick={async () => {
              const ok = await confirmDialog({
                title: "Delete this sender?",
                message: "Campaigns already sent are not affected.",
                confirmLabel: "Delete sender",
                tone: "danger",
              });
              if (ok) run(() => deleteBrand(id));
            }}
          >
            Delete
          </Button>
        )}
      </div>
      <Message res={res} />
    </div>
  );
}

export function BrandForm({
  brand,
}: {
  brand?: {
    id: string;
    key: string;
    name: string;
    domain: string;
    fromName: string;
    fromAddresses: string[];
    replyTo: string | null;
    websiteUrl: string | null;
  };
}) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<SenderActionResult | null>(null);
  const field =
    "mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

  return (
    <form
      action={(fd) => start(async () => setRes(await saveBrand(fd)))}
      className="grid grid-cols-1 gap-3 md:grid-cols-2"
    >
      {brand && <input type="hidden" name="id" value={brand.id} />}
      <label className="text-xs font-medium">
        Brand name
        <input name="name" required defaultValue={brand?.name} placeholder="Klymb" className={field} />
      </label>
      <label className="text-xs font-medium">
        Key {brand && <span className="font-normal text-muted-foreground">(can&apos;t change)</span>}
        <input
          name="key"
          required
          defaultValue={brand?.key}
          readOnly={Boolean(brand)}
          placeholder="klymb"
          className={`${field} ${brand ? "bg-slate-50 text-muted-foreground dark:bg-slate-800" : ""}`}
        />
      </label>
      <label className="text-xs font-medium">
        Domain (verified in SES)
        <input name="domain" required defaultValue={brand?.domain} placeholder="klymb.ai" className={field} />
      </label>
      <label className="text-xs font-medium">
        Default From name
        <input name="fromName" required defaultValue={brand?.fromName} placeholder="Klymb" className={field} />
      </label>
      <label className="text-xs font-medium md:col-span-2">
        From addresses (comma or new line)
        <textarea
          name="fromAddresses"
          required
          rows={2}
          defaultValue={brand?.fromAddresses.join(", ")}
          placeholder="team@klymb.ai, no-reply@klymb.ai"
          className={field}
        />
      </label>
      <label className="text-xs font-medium">
        Reply-to (optional)
        <input name="replyTo" type="email" defaultValue={brand?.replyTo ?? ""} placeholder="team@klymb.ai" className={field} />
      </label>
      <label className="text-xs font-medium">
        Website (optional)
        <input name="websiteUrl" type="url" defaultValue={brand?.websiteUrl ?? ""} placeholder="https://klymb.ai" className={field} />
      </label>
      <div className="flex items-center justify-end gap-3 md:col-span-2">
        <Message res={res} />
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : brand ? "Save changes" : "Add sender"}
        </Button>
      </div>
    </form>
  );
}
