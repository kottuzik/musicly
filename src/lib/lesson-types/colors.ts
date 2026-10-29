// Calendar colors for lesson types, derived from the Style Guide palette.
// The database picks the least-used one for a new lesson type.
export const LESSON_TYPE_COLORS = [
  { value: "#6B46C1", label: "סגול" },
  { value: "#F472B6", label: "ורוד" },
  { value: "#38BDF8", label: "תכלת" },
  { value: "#34D399", label: "ירוק" },
  { value: "#FBBF24", label: "צהוב" },
  { value: "#F87171", label: "אדום" },
  { value: "#A78BFA", label: "לילך" },
  { value: "#2DD4BF", label: "טורקיז" },
] as const;

export const LESSON_TYPE_COLOR_VALUES = LESSON_TYPE_COLORS.map((c) => c.value);

export function colorLabel(value: string): string {
  return LESSON_TYPE_COLORS.find((c) => c.value.toLowerCase() === value.toLowerCase())?.label ?? value;
}
