// Reminder offsets are minutes before the lesson. The database accepts up to 5 distinct values from
// 5 minutes to 7 days (valid_reminder_offsets); this mirrors that rule for forms and tests.

export const MIN_OFFSET = 5;
export const MAX_OFFSET = 10080;
export const MAX_OFFSETS = 5;

export const REMINDER_PRESETS = [
  { minutes: 1440, label: "24 שעות לפני" },
  { minutes: 720, label: "12 שעות לפני" },
  { minutes: 120, label: "שעתיים לפני" },
  { minutes: 60, label: "שעה לפני" },
] as const;

export const CUSTOM_UNITS = {
  minutes: { factor: 1, label: "דקות" },
  hours: { factor: 60, label: "שעות" },
  days: { factor: 1440, label: "ימים" },
} as const;

export type CustomUnit = keyof typeof CUSTOM_UNITS;

export const isCustomUnit = (v: string): v is CustomUnit => v in CUSTOM_UNITS;

// Preset checkboxes plus an optional custom time -> a sorted (longest first), de-duplicated list.
export function buildOffsets(
  presets: string[],
  customAmount: string,
  customUnit: string,
): { offsets: number[]; error?: string } {
  const values = new Set<number>();
  for (const p of presets) {
    const minutes = Number(p);
    if (REMINDER_PRESETS.some((preset) => preset.minutes === minutes)) values.add(minutes);
  }

  if (customAmount.trim() !== "") {
    const amount = Number(customAmount);
    if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0 || !isCustomUnit(customUnit)) {
      return { offsets: [], error: "יש להזין זמן אישי כמספר שלם וחיובי, ולבחור יחידה." };
    }
    const minutes = amount * CUSTOM_UNITS[customUnit].factor;
    if (minutes < MIN_OFFSET || minutes > MAX_OFFSET) {
      return { offsets: [], error: "זמן אישי יכול להיות בין 5 דקות ל־7 ימים." };
    }
    values.add(minutes);
  }

  const offsets = [...values].sort((a, b) => b - a);
  if (offsets.length > MAX_OFFSETS) return { offsets: [], error: "אפשר לבחור עד 5 מועדי תזכורת." };
  return { offsets };
}

// "24 שעות", "שעתיים", "שעה", "45 דקות", "3 ימים".
export function describeOffset(minutes: number): string {
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? "יום" : days === 2 ? "יומיים" : `${days} ימים`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "שעה" : hours === 2 ? "שעתיים" : `${hours} שעות`;
  }
  return `${minutes} דקות`;
}

// The offsets that are not one of the preset checkboxes (shown in the custom field).
export function customOffsets(offsets: number[]): number[] {
  return offsets.filter((m) => !REMINDER_PRESETS.some((p) => p.minutes === m));
}

// A whole number of the largest unit that divides the minutes evenly, for pre-filling the custom field.
export function splitCustom(minutes: number): { amount: string; unit: CustomUnit } {
  if (minutes % 1440 === 0) return { amount: String(minutes / 1440), unit: "days" };
  if (minutes % 60 === 0) return { amount: String(minutes / 60), unit: "hours" };
  return { amount: String(minutes), unit: "minutes" };
}
