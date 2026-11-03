import { Tabs } from "@/components/ui";

export function ConversionsTabs({ active }: { active: "people" | "klymb" }) {
  return (
    <Tabs
      items={[
        { href: "/marketing/conversions", label: "People", active: active === "people" },
        { href: "/marketing/conversions/klymb-actions", label: "Klymb actions", active: active === "klymb" },
      ]}
    />
  );
}
