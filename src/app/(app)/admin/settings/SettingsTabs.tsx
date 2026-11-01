import { Tabs } from "@/components/ui/Tabs";

const ITEMS = [
  { key: "lesson-types", href: "/admin/settings/lesson-types", label: "תחומי לימוד" },
  { key: "hours", href: "/admin/settings/hours", label: "שעות פעילות" },
  { key: "closures", href: "/admin/settings/closures", label: "ימי סגירה" },
];

export function SettingsTabs({ current }: { current: string }) {
  return <Tabs label="קבוצות הגדרות" items={ITEMS} current={current} />;
}
