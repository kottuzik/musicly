"use client";

import { ChoiceGroup } from "@/components/ui/ChoiceGroup";
import { Field } from "@/components/ui/Field";
import { SelectField } from "@/components/ui/SelectField";
import { CUSTOM_UNITS, customOffsets, REMINDER_PRESETS, splitCustom } from "@/lib/notifications/reminders";
import styles from "./Notifications.module.css";

// When to remind: the four preset times plus one custom time (5 minutes to 7 days). The form
// posts "preset" (repeated), "customAmount" and "customUnit".
export function ReminderOffsetsFields({
  offsets,
  errors,
}: {
  offsets: number[];
  errors?: { preset?: string; customAmount?: string };
}) {
  const custom = customOffsets(offsets)[0];
  const initial = custom ? splitCustom(custom) : { amount: "", unit: "hours" as const };
  return (
    <>
      <ChoiceGroup
        legend="מתי לשלוח תזכורת?"
        name="preset"
        type="checkbox"
        options={REMINDER_PRESETS.map((p) => ({ value: String(p.minutes), label: p.label }))}
        defaultValue={offsets.filter((m) => REMINDER_PRESETS.some((p) => p.minutes === m)).map(String)}
        error={errors?.preset}
      />
      <div className={styles.customRow}>
        <Field
          label="זמן אחר לפני השיעור"
          name="customAmount"
          type="number"
          inputMode="numeric"
          min={1}
          defaultValue={initial.amount}
          hint="אפשר מ־5 דקות ועד 7 ימים"
          error={errors?.customAmount}
        />
        <SelectField
          label="יחידה"
          name="customUnit"
          defaultValue={initial.unit}
          options={Object.entries(CUSTOM_UNITS).map(([value, unit]) => ({ value, label: unit.label }))}
        />
      </div>
    </>
  );
}
