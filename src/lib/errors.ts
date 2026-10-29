// Hebrew messages for business errors raised by the database (stable keys, see migrations).
const MESSAGES: Record<string, string> = {
  not_allowed: "אין לך הרשאה לבצע פעולה זו.",
  not_found: "הפריט לא נמצא. ייתכן שהוא שונה בינתיים — רעננו את הדף.",
  email_taken: "כתובת האימייל כבר רשומה במערכת.",
  email_locked: "לא ניתן לשנות אימייל של מורה שכבר נרשם למערכת.",
  skills_required: "יש לבחור לפחות תחום הוראה אחד.",
  already_registered: "המורה כבר נרשם למערכת.",
  invitation_invalid: "הקישור אינו תקף או שפג תוקפו. בקשו קישור חדש מהמנהל.",
  invalid_input: "חלק מהפרטים חסרים או אינם תקינים.",
  skill_in_use: "לא ניתן להסיר תחום שהמורה מלמד בו תלמידים. החליפו קודם את המורה הקבוע של התלמידים בתחום זה.",
  teacher_not_qualified: "המורה שנבחר אינו מלמד את התחום הזה.",
  teacher_inactive: "המורה שנבחר אינו פעיל, ולא ניתן לשייך אליו תלמידים חדשים.",
  subject_taken: "התלמיד כבר רשום לתחום הזה.",
  birth_date_future: "תאריך הלידה לא יכול להיות בעתיד.",
  return_date_past: "תאריך החזרה צריך להיות אחרי היום.",
  return_mode_required: "יש לבחור מה יקרה בתאריך החזרה: התראה למנהלים או הפעלה אוטומטית.",
};

export const GENERIC_ERROR = "אירעה שגיאה. נסו שוב בעוד רגע.";

type DbError = { message?: string; code?: string } | null | undefined;

export function dbErrorMessage(error: DbError, overrides: Record<string, string> = {}): string {
  if (!error) return GENERIC_ERROR;
  const key = error.message ?? "";
  if (overrides[key]) return overrides[key];
  if (error.code && overrides[error.code]) return overrides[error.code];
  if (MESSAGES[key]) return MESSAGES[key];
  if (key.includes("last active super admin")) return "חייב להישאר לפחות מנהל ראשי פעיל אחד.";
  if (error.code === "23505") return "הערך כבר קיים במערכת.";
  return GENERIC_ERROR;
}
