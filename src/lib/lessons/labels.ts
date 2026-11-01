import type { BadgeTone } from "@/components/ui/Badge";
import type { Database } from "@/types/database";

export type LessonLocation = Database["public"]["Enums"]["lesson_location"];
export type LessonStatus = Database["public"]["Enums"]["lesson_status"];
export type ExceptionStatus = Database["public"]["Enums"]["exception_request_status"];

export const LOCATION_LABELS: Record<LessonLocation, string> = {
  school: "בבית הספר",
  zoom: "בזום",
};

export const LESSON_STATUS_LABELS: Record<LessonStatus, { label: string; tone: BadgeTone }> = {
  scheduled: { label: "מתוכנן", tone: "primary" },
  cancelled: { label: "בוטל", tone: "error" },
  closed_day: { label: "לא מתקיים – יום סגירה", tone: "neutral" },
};

export const EXCEPTION_STATUS_LABELS: Record<ExceptionStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: "ממתין לאישור מורה", tone: "warning" },
  approved: { label: "אושר", tone: "success" },
  rejected: { label: "נדחה", tone: "error" },
  expired: { label: "פג תוקף", tone: "neutral" },
  cannot_schedule: { label: "לא ניתן לשבץ", tone: "error" },
  cancelled: { label: "בוטל", tone: "neutral" },
};

// Why a week of a new series was not created.
export const SKIP_REASON_LABELS: Record<string, string> = {
  teacher_busy: "המורה תפוס בשעה זו",
  student_busy: "התלמיד תפוס בשעה זו",
  teacher_unavailable: "המורה אינו זמין (היעדרות או זמינות שהסתיימה)",
};
