import { ATTENDANCE_LABELS } from "@/lib/lessons/labels";
import { formatLessonDate, schoolDate, schoolTime } from "@/lib/lessons/time";
import type { Database } from "@/types/database";
import { describeOffset } from "./reminders";

export type NotificationRow = Database["public"]["Functions"]["list_notifications"]["Returns"][number];

export const NOTIFICATION_TABS = [
  { key: "activity", label: "פעילות" },
  { key: "system", label: "הודעות מערכת" },
  { key: "archive", label: "ארכיון" },
] as const;

export type NotificationTab = (typeof NOTIFICATION_TABS)[number]["key"];

export const isNotificationTab = (v: unknown): v is NotificationTab => NOTIFICATION_TABS.some((t) => t.key === v);

type Payload = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

const REQUEST_KIND: Record<string, string> = {
  remove_weekly: "הסרת זמינות קבועה",
  remove_once: "הסרת זמינות חד־פעמית",
  absence: "היעדרות",
  cancel: "ביטול שיעור",
  change: "שינוי שיעור",
};

const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

// "פסנתר · דנה · יום שלישי, 14/05/2026 · 16:00" (the student only when the reader may see the name).
function lessonLine(p: Payload, student: string | null): string {
  const parts: string[] = [];
  if (str(p.subject)) parts.push(str(p.subject));
  if (student) parts.push(student);
  if (str(p.start_at)) parts.push(`${formatLessonDate(str(p.start_at))} · ${schoolTime(str(p.start_at))}`);
  return parts.join(" · ");
}

function seriesLine(p: Payload, student: string | null): string {
  const parts: string[] = [];
  if (str(p.subject)) parts.push(str(p.subject));
  if (student) parts.push(student);
  if (p.day_of_week !== undefined && str(p.start_time)) {
    parts.push(`יום ${WEEKDAYS[num(p.day_of_week)]} · ${str(p.start_time).slice(0, 5)}`);
  }
  return parts.join(" · ");
}

const join = (...parts: string[]) => parts.filter(Boolean).join(" · ");

export type NotificationView = { title: string; detail: string; href: string | null };

// Hebrew text and the link target of a notification. Never includes more than the payload and the
// student name the database allowed this reader to see.
export function describeNotification(n: NotificationRow, base: "/admin" | "/teacher"): NotificationView {
  const p = (n.payload ?? {}) as Payload;
  const student = n.subject_name;
  const calendar = `${base}/calendar`;
  const lessonHref = str(p.start_at) ? `${calendar}?view=day&date=${schoolDate(str(p.start_at))}` : calendar;
  const requests = `${base}/requests`;
  const request = join(str(p.subject), str(p.start_date));

  switch (n.type) {
    case "lesson_new":
      return { title: "שיעור חדש שובץ לך", detail: lessonLine(p, student), href: lessonHref };
    case "lesson_updated":
      return { title: "שיעור שלך שונה", detail: lessonLine(p, student), href: lessonHref };
    case "lesson_cancelled":
      return { title: "שיעור שלך בוטל", detail: lessonLine(p, student), href: lessonHref };
    case "lesson_restored":
      return { title: "שיעור שלך שוחזר", detail: lessonLine(p, student), href: lessonHref };
    case "lesson_moved_away":
      return { title: "שיעור הועבר למורה אחר", detail: lessonLine(p, null), href: calendar };
    case "held_lesson_cancelled":
      return { title: "שיעור שסומן ”התקיים” בוטל בדיעבד", detail: lessonLine(p, student), href: lessonHref };
    case "teacher_restore_outside_hours":
      return { title: "מורה שחזר שיעור מחוץ לשעות הפעילות", detail: lessonLine(p, student), href: lessonHref };
    case "attendance_changed": {
      const from = ATTENDANCE_LABELS[str(p.from) as keyof typeof ATTENDANCE_LABELS]?.label;
      const to = ATTENDANCE_LABELS[str(p.to) as keyof typeof ATTENDANCE_LABELS]?.label;
      return {
        title: "הנוכחות בשיעור תוקנה",
        detail: join(lessonLine(p, student), from && to ? `${from} ← ${to}` : ""),
        href: lessonHref,
      };
    }
    case "series_new":
      return { title: "סדרת שיעורים שובצה או עודכנה", detail: seriesLine(p, student), href: calendar };
    case "series_stopped":
      return { title: "סדרת שיעורים הופסקה", detail: seriesLine(p, student), href: calendar };
    case "series_extended":
      return { title: "סדרת שיעורים הוארכה", detail: seriesLine(p, student), href: calendar };
    case "series_resumed":
      return { title: "סדרת שיעורים חודשה", detail: seriesLine(p, student), href: calendar };
    case "series_moved_away":
      return { title: "סדרת שיעורים הועברה למורה אחר", detail: seriesLine(p, null), href: calendar };
    case "availability_request_new":
      return { title: "בקשת זמינות חדשה ממורה", detail: REQUEST_KIND[str(p.kind)] ?? "", href: requests };
    case "availability_request_approved":
      return { title: "בקשת הזמינות שלך אושרה", detail: REQUEST_KIND[str(p.kind)] ?? "", href: `${base}/availability` };
    case "availability_request_rejected":
      return { title: "בקשת הזמינות שלך נדחתה", detail: REQUEST_KIND[str(p.kind)] ?? "", href: `${base}/availability` };
    case "change_request_new":
      return { title: "מורה ביקש לשנות או לבטל שיעור", detail: join(REQUEST_KIND[str(p.kind)] ?? "", lessonLine(p, student)), href: requests };
    case "change_request_approved":
      return {
        title: "בקשתך לשיעור אושרה",
        detail: join(
          REQUEST_KIND[str(p.kind)] ?? "",
          lessonLine(p, student),
          // A new time outside the teacher's availability enters the calendar only after she approves it.
          str(p.kind) === "change" ? "אם המועד החדש מחוץ לזמינות שלך, תקבלי בקשה לאישור. השיעור ישתנה בלוח רק אחרי שתאשרי." : "",
        ),
        href: requests,
      };
    case "change_request_rejected": {
      const suggestion = str(p.suggested_date)
        ? `המנהל הציע מועד אחר: ${str(p.suggested_date).split("-").reverse().join("/")} בשעה ${str(p.suggested_start).slice(0, 5)}`
        : "";
      return {
        title: "בקשתך לשיעור נדחתה",
        detail: join(REQUEST_KIND[str(p.kind)] ?? "", lessonLine(p, student), suggestion),
        href: requests,
      };
    }
    case "change_request_closed":
      return { title: "הבקשה נסגרה אוטומטית", detail: join(REQUEST_KIND[str(p.kind)] ?? "", lessonLine(p, student)), href: requests };
    case "approval_request_new":
      return { title: "נדרש אישורך לשיעור", detail: request, href: requests };
    case "approval_request_approved":
      return { title: "המורה אישר את הבקשה", detail: request, href: requests };
    case "approval_request_rejected":
      return { title: "המורה דחה את הבקשה", detail: request, href: requests };
    case "approval_request_cannot_schedule":
      return { title: "לא ניתן לשבץ: המועד נתפס לפני שהמורה ענה", detail: request, href: requests };
    case "approval_request_expired":
      return { title: "בקשה פגה כי מועד השיעור עבר", detail: request, href: requests };
    case "lessons_need_attention":
      return { title: "יש שיעורים שדורשים טיפול", detail: "", href: `${base}/calendar?attention=1` };
    case "lesson_reminder":
      return {
        title: `תזכורת: שיעור בעוד ${describeOffset(num(p.offset_minutes))}`,
        detail: lessonLine(p, student),
        href: lessonHref,
      };
    case "attendance_unreported":
      return { title: `לא דווחה נוכחות ב־${num(p.count)} שיעורים`, detail: "שיעורים שהסתיימו ב־30 הימים האחרונים", href: base };
    case "student_return_due":
      return { title: "הגיע תאריך החזרה של תלמיד", detail: student ?? "", href: n.entity_id ? `/admin/students/${n.entity_id}` : "/admin/students" };
    case "student_returned_auto":
      return { title: "תלמיד הופעל אוטומטית (ללא שיבוצים)", detail: student ?? "", href: n.entity_id ? `/admin/students/${n.entity_id}` : "/admin/students" };
    case "series_extension_conflicts":
      return { title: `בהארכת סדרה נמצאו ${num(p.count)} שבועות מתנגשים`, detail: "הם לא נוצרו. אפשר לשבץ אותם ידנית.", href: "/admin/calendar" };
    case "availability_needed":
      return { title: "נא להגדיר זמינות חדשה", detail: "הוחזרתם לפעילות. הגדירו את הזמינות השבועית כדי שאפשר יהיה לשבץ שיעורים.", href: "/teacher/availability" };
    case "email_failed":
      return { title: "שליחת אימייל נכשלה", detail: "ההתראה הגיעה במערכת, אך האימייל לא נשלח.", href: null };
    default:
      return { title: "התראה חדשה", detail: "", href: null };
  }
}
