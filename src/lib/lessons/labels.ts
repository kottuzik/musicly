import type { BadgeTone } from "@/components/ui/Badge";
import type { Database } from "@/types/database";

export type LessonLocation = Database["public"]["Enums"]["lesson_location"];
export type LessonStatus = Database["public"]["Enums"]["lesson_status"];
export type ExceptionStatus = Database["public"]["Enums"]["exception_request_status"];
export type ExceptionKind = Database["public"]["Enums"]["exception_request_kind"];
export type AttentionReason = Database["public"]["Enums"]["attention_reason"];
export type CancelSource = Database["public"]["Enums"]["cancel_source"];
export type AttendanceStatus = Database["public"]["Enums"]["attendance_status"];
export type LessonChangeKind = Database["public"]["Enums"]["lesson_change_kind"];

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

export const EXCEPTION_KIND_LABELS: Record<ExceptionKind, string> = {
  single: "שיעור חדש",
  series: "סדרה שבועית",
  lesson_change: "שינוי שיעור",
  series_change: "שינוי סדרה מתאריך",
  restore: "שחזור שיעור",
};

export const LESSON_CHANGE_KIND_LABELS: Record<LessonChangeKind, string> = {
  cancel: "ביטול שיעור",
  change: "שינוי שיעור",
};

// Why a lesson is flagged "needs attention".
export const ATTENTION_REASON_LABELS: Record<AttentionReason, string> = {
  outside_hours: "מחוץ לשעות הפעילות",
  teacher_inactive: "המורה אינו פעיל",
  teacher_absent: "המורה נעדר",
  availability_removed: "זמינות המורה הוסרה",
  series_change_conflict: "התנגשות בשינוי סדרה",
};

export const CANCEL_SOURCE_LABELS: Record<CancelSource, string> = {
  admin: "בוטל בידי מנהל",
  teacher_request: "בוטל לפי בקשת המורה",
  student_inactive: "התלמיד הושבת",
  series_stopped: "הסדרה הופסקה",
  closure_removed: "יום הסגירה בוטל והשיעור לא שוחזר",
};

// Entries of the change log, as shown on the admin home and in a lesson's history.
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  lesson_cancelled: "שיעור בוטל",
  lesson_restored: "שיעור שוחזר",
  lesson_updated: "שיעור שונה",
  lesson_change_requested: "נשלחה למורה בקשה לשינוי שיעור",
  lesson_restore_requested: "נשלחה למורה בקשה לשחזור שיעור",
  teacher_restore_outside_hours: "מורה שחזר שיעור מחוץ לשעות הפעילות",
  attention_cleared: "השיעור נשאר כפי שהוא",
  series_changed: "סדרה שונתה",
  series_change_requested: "נשלחה למורה בקשה לשינוי סדרה",
  series_stopped: "סדרה הופסקה",
  series_extended: "סדרה הוארכה",
  series_resumed: "סדרה חודשה",
  closure_cancelled: "יום סגירה בוטל",
  change_requested: "מורה ביקש שינוי או ביטול",
  change_request_approved: "בקשת מורה אושרה",
  change_request_rejected: "בקשת מורה נדחתה",
  duration_changed: "משך תחום שונה",
  student_deactivated: "תלמיד הושבת",
  teacher_deactivated: "מורה הושבת",
  regular_teacher_changed: "המורה הקבוע הוחלף",
  attendance_reported: "דווחה נוכחות",
  attendance_changed: "הנוכחות תוקנה",
  attendance_cleared: "דיווח הנוכחות הוסר כי השיעור אינו מתקיים",
  held_lesson_cancelled: "שיעור שסומן ”התקיים” בוטל בדיעבד",
};

export const ATTENDANCE_LABELS: Record<AttendanceStatus, { label: string; tone: BadgeTone }> = {
  held: { label: "התקיים", tone: "success" },
  student_absent: { label: "התלמיד לא הגיע", tone: "warning" },
  teacher_absent: { label: "המורה לא הגיע", tone: "error" },
};

export const ATTENDANCE_STATUSES = Object.keys(ATTENDANCE_LABELS) as AttendanceStatus[];

const isAttendanceStatus = (v: unknown): v is AttendanceStatus => typeof v === "string" && v in ATTENDANCE_LABELS;

// What an attendance entry of the log changed, e.g. "התקיים ← התלמיד לא הגיע". Statuses only: the
// log never holds the note text. Null for other actions.
export function auditDetail(action: string, oldValues: unknown, newValues: unknown): string | null {
  const o = (oldValues ?? {}) as Record<string, unknown>;
  const n = (newValues ?? {}) as Record<string, unknown>;
  const label = (v: unknown) => (isAttendanceStatus(v) ? ATTENDANCE_LABELS[v].label : null);
  if (action === "attendance_reported") return label(n.status);
  if (action === "attendance_changed") {
    const from = label(o.status);
    const to = label(n.status);
    if (!from || !to) return null;
    return from === to ? `${to} (ההערה עודכנה)` : `${from} ← ${to}`;
  }
  if (action === "attendance_cleared" || action === "held_lesson_cancelled") return label(o.attendance_status);
  return null;
}
