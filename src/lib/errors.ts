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
  outside_operating_hours: "הטווח חורג משעות הפעילות של בית הספר ביום זה.",
  availability_overlap: "הטווח חופף לזמינות קיימת.",
  invalid_time_step: "יש לבחור שעות ברבע שעה עגול, ושעת הסיום צריכה להיות אחרי שעת ההתחלה.",
  removal_pending: "כבר קיימת בקשה להסרה הזו.",
  date_not_matching_day: "התאריך שנבחר אינו חל ביום השבוע של הטווח.",
  slot_not_valid_on_date: "הטווח אינו בתוקף בתאריך שנבחר.",
  date_past: "התאריך כבר עבר.",
  request_already_handled: "הבקשה כבר טופלה בידי מנהל אחר. הרשימה עודכנה.",
  closure_exists: "החג הזה כבר מוגדר כיום סגירה.",
  teacher_busy: "המורה כבר משובץ לשיעור אחר בשעה הזו.",
  student_busy: "התלמיד כבר משובץ לשיעור אחר בשעה הזו.",
  closed_day: "בית הספר סגור בתאריך הזה (יום סגירה).",
  outside_hours_confirm_required: "המועד מחוץ לשעות הפעילות של בית הספר. יש לאשר את השיבוץ החריג.",
  student_inactive: "התלמיד אינו פעיל, ולא ניתן לשבץ לו שיעורים.",
  subject_not_enrolled: "התלמיד אינו רשום לתחום הזה.",
  teacher_not_regular: "סדרה שבועית נקבעת רק עם המורה הקבוע של התלמיד בתחום.",
  no_occurrences: "אין אף מפגש בין תאריך ההתחלה לתאריך הסיום שנבחרו.",
  subject_has_lessons: "לתלמיד יש שיעורים מתוכננים או בקשת שיבוץ בתחום הזה, ולכן לא ניתן להסיר אותו כעת.",
  regular_teacher_has_lessons:
    "לתלמיד יש שיעורים מתוכננים בתחום הזה. להחלפת המורה הקבוע יש להשתמש ב„החלפת מורה בסדרה” בסדרה של התלמיד.",
  lesson_type_has_students: "רשומים לתחום תלמידים. הסירו קודם את התחום מהתלמידים.",
  lesson_type_has_lessons: "קיימים שיעורים או בקשות שיבוץ בתחום הזה, ולכן לא ניתן למחוק אותו.",
  lesson_type_only_skill: "זה התחום היחיד של חלק מהמורים. הוסיפו להם תחום אחר קודם.",
  lesson_type_has_teachers: "משויכים לתחום מורים. יש לאשר את הסרתו מכל המורים.",
  lesson_changed: "השיעור שונה בינתיים. הנתונים עודכנו — בדקו ונסו שוב.",
  lesson_past: "השיעור כבר התחיל או עבר, ולא ניתן לשנות אותו.",
  lesson_not_scheduled: "השיעור אינו מתוכנן (הוא בוטל או שאינו מתקיים).",
  lesson_not_cancelled: "השיעור אינו מבוטל.",
  lesson_already_cancelled: "השיעור כבר בוטל.",
  date_taken: "בתאריך הזה כבר יש מפגש אחר של אותה סדרה.",
  slot_taken: "השעה הזו כבר תפוסה.",
  outside_hours: "המועד מחוץ לשעות הפעילות של בית הספר.",
  request_too_late: "אפשר לבקש שינוי או ביטול עד היום שלפני השיעור. ביום השיעור יש לתאם ישירות עם המנהל.",
  change_request_pending: "כבר קיימת בקשה ממתינה לשיעור או לסדרה הזו.",
  change_requires_update: "בקשת שינוי מאשרים בקביעת המועד החדש של השיעור.",
  series_ended: "הסדרה כבר הסתיימה.",
  no_future_lessons: "אין מפגשים עתידיים בסדרה מהתאריך שנבחר.",
  decision_failed: "לא ניתן לבצע את ההחלטה לאחד השיעורים. לא נשמר שום שינוי.",
  not_impacted: "ההחלטה מתייחסת לשיעור שאינו מושפע.",
  series_not_active: "אחת הסדרות כבר אינה פעילה.",
  attendance_changed: "הנוכחות עודכנה בינתיים בידי מישהו אחר. הנתונים רועננו — בדקו ונסו שוב.",
  held_confirmation_required: "השיעור סומן כ„התקיים”. ביטול שלו דורש אישור מפורש.",
  invalid_reminder_offsets: "מועד התזכורת צריך להיות בין 5 דקות ל־7 ימים, ועד 5 מועדים.",
  reminder_offsets_required: "יש לבחור לפחות מועד תזכורת אחד.",
  lesson_not_upcoming: "אפשר להגדיר תזכורת רק לשיעור עתידי שמתקיים.",
  person_deleted: "הפריט נמחק, ולכן אי אפשר לשנות אותו. אפשר לשחזר אותו ב„נמחקו לאחרונה”.",
  restore_window_closed: "עברו 30 יום מהמחיקה, ולא ניתן עוד לשחזר.",
  not_purged: "אפשר למחוק היסטוריה רק אחרי שהמחיקה הסופית של הפרופיל בוצעה.",
  has_future_lessons: "למורה יש עדיין שיעורים עתידיים מתוכננים. טפלו בהם קודם — העבירו למורה אחר או בטלו.",
  availability_mode_required: "יש לבחור מה לעשות עם הזמינות של המורה בחזרה לפעילות.",
};

export const GENERIC_ERROR = "אירעה שגיאה. נסו שוב בעוד רגע.";

type DbError = { message?: string; code?: string; hint?: string } | null | undefined;

export function dbErrorMessage(error: DbError, overrides: Record<string, string> = {}): string {
  if (!error) return GENERIC_ERROR;
  const key = error.message ?? "";
  if (overrides[key]) return overrides[key];
  if (error.code && overrides[error.code]) return overrides[error.code];
  // A failed per-lesson decision carries the reason as the hint.
  if (key === "decision_failed" && error.hint && MESSAGES[error.hint]) return `${MESSAGES[key]} ${MESSAGES[error.hint]}`;
  if (MESSAGES[key]) return MESSAGES[key];
  if (key.includes("last active super admin")) return "חייב להישאר לפחות מנהל ראשי פעיל אחד.";
  if (error.code === "23505") return "הערך כבר קיים במערכת.";
  return GENERIC_ERROR;
}
