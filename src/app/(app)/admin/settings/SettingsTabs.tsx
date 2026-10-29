import { Tabs } from "@/components/ui/Tabs";

// Operating hours and closure days are added in Milestone 4.
const ITEMS = [{ key: "lesson-types", href: "/admin/settings/lesson-types", label: "תחומי לימוד" }];

export function SettingsTabs({ current }: { current: string }) {
  return <Tabs label="קבוצות הגדרות" items={ITEMS} current={current} />;
}
