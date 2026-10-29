import type { BadgeTone } from "@/components/ui/Badge";
import type { Database } from "@/types/database";

export type StudentLevel = Database["public"]["Enums"]["student_level"];
export type ReturnMode = Database["public"]["Enums"]["student_return_mode"];

export const LEVELS: readonly StudentLevel[] = ["beginner", "intermediate", "advanced"];

export const LEVEL_LABELS: Record<StudentLevel, string> = {
  beginner: "מתחיל",
  intermediate: "בינוני",
  advanced: "מתקדם",
};

export const RETURN_MODE_LABELS: Record<ReturnMode, { label: string; description: string }> = {
  notify: {
    label: "התראה למנהלים",
    description: "בתאריך שנבחר תוצג התראה למנהלים. הסטטוס יישאר „לא פעיל” עד לשינוי ידני.",
  },
  auto: {
    label: "הפעלה אוטומטית",
    description: "בתאריך שנבחר הסטטוס ישתנה ל„פעיל”, בלי ליצור שיבוצים אוטומטיים.",
  },
};

export const STUDENT_STATUS_LABELS = {
  active: { label: "פעיל", tone: "success" as BadgeTone },
  inactive: { label: "לא פעיל", tone: "neutral" as BadgeTone },
};
