import { Tabs } from "@/components/ui";

export function AnalyticsTabs({ active }: { active: "overview" | "conversions" }) {
  return (
    <Tabs
      items={[
        { href: "/marketing/analytics", label: "Email performance", active: active === "overview" },
        { href: "/marketing/analytics/conversions", label: "Conversions", active: active === "conversions" },
      ]}
    />
  );
}
