"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui";

/** Campaign / send picker: switching reloads the list for that source. */
export function SourcePicker({
  value,
  campaigns,
  sends,
}: {
  value: string;
  campaigns: { key: string; label: string }[];
  sends: { key: string; label: string }[];
}) {
  const router = useRouter();
  return (
    <Select
      aria-label="Campaign or mail"
      value={value}
      onChange={(e) => router.push(`/marketing/conversions?source=${encodeURIComponent(e.target.value)}`)}
      className="w-full sm:w-[28rem]"
    >
      {campaigns.length > 0 && (
        <optgroup label="Campaigns">
          {campaigns.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </optgroup>
      )}
      {sends.length > 0 && (
        <optgroup label="Customize mail">
          {sends.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </optgroup>
      )}
    </Select>
  );
}
