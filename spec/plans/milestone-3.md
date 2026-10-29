# Milestone 3 — תלמידים ושיוך מקצועי למורים

**מטרה (מ־MILESTONES.md):** לנהל תיק תלמיד ומסלול לימוד נפרד לכל תחום, עם הפרדת מידע אישי ומקצועי.
**מקורות:** PRD §2.1, §2.2, §3.1 (מסך 4), §3.2, §4.3, §5.2–5.3 · ARCHITECTURE §2.2, §3.1–3.3, §4.1, §5.2–5.3, §8.3, ADR-1, ADR-4, ADR-8 · DESIGN §1.6, §1.7, §2.

## 0. החלטות שהתקבלו בתכנון

| נושא | החלטה | נימוק |
|---|---|---|
| פרטי קשר שמורה רואה | **המשתמש בחר:** מורה **אינו רואה אף פרט קשר** — לא טלפון/אימייל של התלמיד ולא פרטי ההורה. המורה רואה: שם, גיל, סטטוס, תחומי הלימוד (מורה קבוע, רמה, רקע מקצועי). | PRD §4.3 + DoD („פרטי קשר אסורים"). צמצום חשיפה, במיוחד של קטינים (ARCHITECTURE §5.3). |
| הפרדה טכנית של פרטי קשר | פרטי הקשר נשמרים בטבלה נפרדת `student_contacts` שרק מנהלים יכולים לקרוא (RLS). | RLS עובד לפי שורות, לא לפי עמודות; טבלה נפרדת מבטיחה שגם קריאה ישירה מה־API לא תחשוף אותם למורה. → **ADR-9** |
| גיל | **המשתמש בחר:** נשמר **תאריך לידה** (שדה חובה); הגיל מחושב ומוצג. „קטין" = מתחת לגיל 18 ביום הנוכחי. | הגיל מתעדכן לבד; המערכת יודעת מתי להציג את פרטי ההורה. → **ADR-10** |
| פרטי הורה | שם הורה, טלפון הורה, אימייל הורה — כולם אופציונליים. מוצגים בטופס כאשר התלמיד קטין לפי תאריך הלידה; אם נשמרו ותלמיד הגיע לגיל 18 — ממשיכים להיות מוצגים ואפשר למחוק אותם ידנית. | PRD §4.3: „אפשרות לציין פרטי קשר של הורה". |
| שדות חובה | שם מלא ותאריך לידה בלבד. טלפון/אימייל של התלמיד אופציונליים (קטין צעיר עשוי שלא להחזיק טלפון). | ה־PRD אינו מחייב שדה קשר מסוים; לא ממציאים חובה. |
| תחומים של מורה אחר | **המשתמש בחר:** מורה רואה את **כל** התחומים של תלמיד המשויך אליו (תחום, שם המורה הקבוע, רמה, רקע) — לקריאה בלבד; עורך רק תחום שהוא המורה הקבוע שלו. | PRD §4.3; DoD („אינו יכול לערוך תחום שאינו מלמד"). |
| שמות מורים למורה | טבלת `teachers` נשארת חסומה למורה (רואה רק את עצמו, כולל אימייל/טלפון). שמות המורים האחרים בתחומי התלמיד מגיעים מפונקציה מצומצמת `list_teacher_names()` שמחזירה **מזהה ושם בלבד**. | לא לחשוף פרטי קשר של מורים אחד לשני. |
| מה נחשב „מידע מקצועי" | רמה (מתחיל/בינוני/מתקדם) + רקע מקצועי (טקסט חופשי, עד 2,000 תווים) — לכל תלמיד–תחום בנפרד. מורה יכול לשנות את שניהם בתחום שלו; לא את המורה הקבוע ולא את התחום עצמו. | PRD §2.2, §4.3. |
| שיוך תלמיד–תחום | בכל תלמיד–תחום **מורה קבוע אחד** (חובה), שחייב ללמד את התחום ולהיות פעיל בזמן השיוך. תלמיד–תחום ייחודי (אי אפשר לרשום פעמיים לאותו תחום). | PRD §3.2, ARCHITECTURE §3.1–3.2. |
| מעבר לרשימת תחומים ב־M2 | הסרת תחום מורה (`save_teacher`) נחסמת אם המורה הוא המורה הקבוע של תלמיד באותו תחום. מחיקת תחום לימוד נחסמת גם אם תלמידים רשומים אליו. | אחרת ייווצר תלמיד–תחום עם מורה שאינו מלמד את התחום. PRD §4.1. |
| מורה לא פעיל | לא ניתן לבחור מורה לא פעיל כמורה קבוע חדש. שיוכים קיימים שלו נשארים ומוצגים עם תווית „מורה לא פעיל" (הטיפול בשיעורים — M6). מורה לא פעיל אינו רואה תלמידים בכלל. | PRD §4.4, ARCHITECTURE §5.2. |
| פעיל / לא פעיל + תאריך חזרה | בהפיכה ל„לא פעיל" אפשר להזין תאריך חזרה משוער (אופציונלי, חייב להיות בעתיד). אם הוזן — **חובה** לבחור „התראה למנהלים" או „הפעלה אוטומטית"; שתי האפשרויות מוצגות **ללא בחירה מראש**, והשרת וה־Database דוחים שמירה בלי בחירה. בחזרה ל„פעיל" התאריך והבחירה נמחקים. | PRD §4.3, DoD. |
| מה **לא** קורה עדיין | ביצוע ההתראה/ההפעלה האוטומטית בתאריך החזרה — משימת Cron ב־**M8**. ביטול שיבוצים עתידיים בהשבתה — **M6** (אין עדיין שיעורים). בממשק תוצג הערה קצרה: „ההתראה או ההפעלה יתבצעו אוטומטית בתאריך שנבחר" (ללא הבטחה על שיעורים). | MILESTONES M3/M6/M8. |
| פריטים מהתמונות שלא נבנים | Tab „הערות" כללי, „כתובת מגורים", „קשר חירום", תמונת אדם כאוואטר, כפתור „מחיקה". | אינם ב־PRD (כמו ב־M2); הרקע המקצועי לכל תחום הוא „ההערות" המקצועיות. מחיקה רכה — M9. אוואטר = אות ראשונה. |
| טאבים עתידיים | במסך תלמיד: „פרטים כלליים" ו„תחומי לימוד". „היסטוריית שיעורים" (M5) ו„נוכחות" (M7) יתווספו בהמשך. | ADR-4: לא מציגים מסכים שעוד לא קיימים. |
| Realtime / Audit | לא נדרש ב־M3. רשימות מתרעננות אחרי כל פעולה (`revalidatePath`). Audit מתווסף ב־M7. | DoD של M3 לא דורש. |

## 1. Database — Migration חדש

קובץ: `supabase/migrations/20261030100000_students.sql`

### 1.1 טיפוסים וטבלאות

```sql
create type public.student_level as enum ('beginner', 'intermediate', 'advanced');
create type public.student_return_mode as enum ('notify', 'auto');

create table public.students (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(trim(full_name)) between 2 and 100),
  birth_date date not null check (birth_date > date '1900-01-01'),
  status public.user_status not null default 'active',
  expected_return_date date,
  return_mode public.student_return_mode,
  created_at, updated_at,
  -- A return date always comes with an explicit choice, and only for inactive students.
  check ((expected_return_date is null) = (return_mode is null)),
  check (status = 'inactive' or expected_return_date is null)
);
create index students_name_idx on public.students (lower(full_name));
create index students_status_idx on public.students (status);

-- Contact details: admins only (teachers never read this table).
create table public.student_contacts (
  student_id uuid primary key references public.students (id) on delete cascade,
  phone text, email text,
  parent_name text, parent_phone text, parent_email text,
  updated_at
);

create table public.student_subjects (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  lesson_type_id uuid not null references public.lesson_types (id) on delete restrict,
  regular_teacher_id uuid not null references public.teachers (id) on delete restrict,
  level public.student_level not null,
  professional_background text check (length(professional_background) <= 2000),
  created_at, updated_at,
  unique (student_id, lesson_type_id)
);
create index student_subjects_teacher_idx on public.student_subjects (regular_teacher_id);
create index student_subjects_lesson_type_idx on public.student_subjects (lesson_type_id);
```

- Triggers `set_updated_at` לכל שלוש הטבלאות.
- `deleted_at` / `purge_after` יתווספו ב־M9 (לא נדרשים עכשיו).
- `on delete restrict` מ־`student_subjects` ל־`lesson_types` ול־`teachers` שומר שלא תימחק ישות בשימוש.

### 1.2 פונקציות עזר

| פונקציה | מה עושה |
|---|---|
| `current_teacher_id() returns uuid` | `security definer`, `stable`: מזהה רשומת ה־`teachers` של המשתמש המחובר — **רק אם הוא מורה פעיל** (`current_user_role() = 'teacher'`); אחרת `null`. משמש ב־Policies וב־RPC. |
| `is_my_student(p_student_id uuid) returns boolean` | `security definer`, `stable`: האם קיים `student_subjects` לתלמיד שבו `regular_teacher_id = current_teacher_id()`. (פונקציה כדי למנוע רקורסיה ב־Policies בין `students` ל־`student_subjects`.) |
| `list_teacher_names() returns table (id uuid, full_name text)` | כל משתמש פעיל: מזהה ושם של כל המורים בלבד. |

### 1.3 RLS ו־GRANT

| טבלה | קריאה | כתיבה |
|---|---|---|
| `students` | Admin: הכול · מורה פעיל: רק `is_my_student(id)` | רק דרך RPC |
| `student_contacts` | **Admin בלבד** | רק דרך RPC |
| `student_subjects` | Admin: הכול · מורה פעיל: כל השורות של תלמידים ש־`is_my_student(student_id)` | רק דרך RPC |

- `revoke all ... from anon, authenticated`, ואז `grant select` ל־`authenticated` בלבד (כמו ב־M2).
- מורה לא פעיל: `current_teacher_id()` מחזיר `null` ⇒ לא רואה תלמידים.

### 1.4 פונקציות פעולה (RPC)

כל הפונקציות `security definer`, `set search_path = ''`, `revoke execute from public, anon`, בדיקת הרשאה **בתוך** הפונקציה, שגיאות עסקיות עם `P0001` + מפתח קבוע (כמו ב־M2).

| פונקציה | מי | מה עושה |
|---|---|---|
| `save_student(p_id, p_full_name, p_birth_date, p_phone, p_email, p_parent_name, p_parent_phone, p_parent_email) returns uuid` | Admin/Super | יוצר (כש־`p_id` null) או מעדכן את `students` + `student_contacts` בטרנזקציה אחת. ערכים ריקים נשמרים כ־`null`. תאריך לידה לא בעתיד. |
| `set_student_status(p_id, p_status, p_return_date, p_return_mode)` | Admin/Super | `active` ⇒ מנקה תאריך ובחירה. `inactive` ⇒ אם יש תאריך: חייב להיות אחרי היום (`Asia/Jerusalem`) וחייבת בחירה (`return_mode_required`, `return_date_past`); בחירה בלי תאריך ⇒ נדחה. משמש גם לעדכון תאריך החזרה של תלמיד שכבר לא פעיל. |
| `save_student_subject(p_id, p_student_id, p_lesson_type_id, p_teacher_id, p_level, p_background) returns uuid` | Admin/Super | יוצר/מעדכן תלמיד–תחום. בודק שהמורה מלמד את התחום (`teacher_not_qualified`); שהמורה פעיל — רק כשהמורה **משתנה** או בשיוך חדש (`teacher_inactive`); תחום כפול לאותו תלמיד ⇒ `subject_taken`. בעדכון לא ניתן לשנות את התלמיד. |
| `remove_student_subject(p_id)` | Admin/Super | מוחק שיוך תלמיד–תחום (אין עדיין שיעורים; ב־M5 תיחסם מחיקה של תחום עם שיעורים עתידיים). |
| `update_professional_info(p_id, p_level, p_background)` | Admin/Super, או מורה פעיל שהוא `regular_teacher_id` של השורה | משנה **רק** רמה ורקע. מורה אחר ⇒ `not_allowed`. |

שינויים בפונקציות קיימות מ־M2 (`create or replace` באותו Migration):
- `save_teacher` — לפני הסרת תחום ממורה: אם הוא מורה קבוע של תלמיד בתחום זה ⇒ `skill_in_use`.

### 1.5 החלה ובדיקה
1. `npm run db:push` — על **Development** בלבד.
2. `npm run db:types`.
3. Supabase Advisors (Security + Performance) על Development, ותיקון אזהרות.

## 2. Backend (Next.js)

### 2.1 קבצים חדשים / משתנים
- `src/lib/validation/students.ts` — Zod: `studentSchema` (שם — שימוש חוזר ב־`fullName`; `birthDate` תאריך תקין לא בעתיד; טלפונים/אימיילים אופציונליים — שימוש חוזר ב־`phoneField`, ואימייל אופציונלי), `studentStatusSchema` (תאריך עתידי + `returnMode` חובה כשיש תאריך, **ללא ערך ברירת מחדל**), `studentSubjectSchema`, `professionalInfoSchema` (רמה מתוך enum, רקע עד 2,000 תווים).
- `src/lib/students/age.ts` — `ageOn(birthDate, today)` ו־`isMinor(...)` לפי תאריך היום ב־`Asia/Jerusalem` (פונקציות טהורות, נבדקות ב־Unit).
- `src/lib/students/labels.ts` — תוויות בעברית: רמות (מתחיל/בינוני/מתקדם), סטטוס (פעיל/לא פעיל), אופן חזרה („התראה למנהלים"/„הפעלה אוטומטית").
- `src/lib/errors.ts` — מפתחות חדשים: `teacher_not_qualified` („המורה שנבחר אינו מלמד את התחום הזה."), `teacher_inactive`, `subject_taken` („התלמיד כבר רשום לתחום הזה."), `skill_in_use` („לא ניתן להסיר תחום שהמורה מלמד בו תלמידים. החליפו קודם את המורה הקבוע של התלמידים."), `return_mode_required`, `return_date_past`, `birth_date_future`.
- `src/app/(app)/admin/settings/lesson-types/actions.ts` — הודעת מחיקת תחום בשימוש: „לא ניתן למחוק תחום שמשויכים אליו מורים או תלמידים".

### 2.2 Server Actions (כל אחת: `requireRole` → Zod → RPC → `revalidatePath` → הודעה בעברית)
- `src/app/(app)/admin/students/actions.ts` — `saveStudent`, `setStudentStatus`, `saveStudentSubject`, `removeStudentSubject`.
- `src/app/(app)/students/actions.ts` (משותף למנהל ולמורה) — `updateProfessionalInfo`. ההרשאה נבדקת ב־RPC לפי המשתמש המחובר; השרת לא מקבל תפקיד או מזהה מורה מהלקוח.

### 2.3 קריאת נתונים
- מסכים קוראים דרך Server Components עם לקוח המשתמש (RLS). **אין** שימוש ב־Secret Key ב־M3.
- חיפוש וסינון ב־Database: `ilike` על השם (עם escape ל־`%`/`_`), סטטוס על `students`, ותחום/רמה/מורה דרך `student_subjects!inner(...)` — כל התנאים חלים על **אותה** שורת תחום (למשל „פסנתר + מתקדם").
- אצל המורה, שאילתת `student_contacts` כלל אינה מבוצעת, וממילא חסומה ב־RLS.

## 3. מסכים (UI)

עברית RTL, CSS Modules + Tokens (ADR-1), Responsive לפי ADR-4, טבלאות שהופכות לכרטיסים מתחת ל־768px, Radix Dialog לטפסים — שימוש חוזר ברכיבי M2 (`Table`, `Badge`, `ColorChip`, `SelectField`, `ChoiceGroup`, `Dialog`, `ConfirmAction`, `Tabs`, `Avatar`, `PageHeader`, `Toolbar`).

### 3.1 רכיבים חדשים
- `src/components/students/StudentSubjectsList.tsx` — כרטיס לכל תחום: נקודת צבע + שם התחום, מורה קבוע (עם תווית „לא פעיל" אם צריך), Badge רמה, רקע מקצועי; כפתורי פעולה לפי `canEdit` לכל שורה. משמש גם מנהל וגם מורה.
- `src/components/students/ProfessionalInfoDialog.tsx` — רמה (Radio) + רקע (Textarea עם מונה תווים).
- `src/components/students/StudentFilters.tsx` — חיפוש + מסננים ב־URL (`?q=&status=&subject=&level=&teacher=`).

### 3.2 מסכים
| Route | מי | תוכן |
|---|---|---|
| `/admin/students` | Admin/Super | כותרת „תלמידים", „+ תלמיד חדש", חיפוש לפי שם, מסננים: סטטוס, תחום, רמה, מורה. טבלה: שם (אוואטר־אות), גיל, תחומים (Badges בצבע התחום), טלפון (תלמיד, ואם אין — של ההורה עם תווית „הורה"), סטטוס, פעולות (צפייה, עריכה). מצב ריק וגם „לא נמצאו תוצאות". |
| Dialog „תלמיד חדש" / „עריכת פרטים" | Admin/Super | שם מלא*, תאריך לידה* (ומתחתיו הגיל המחושב), טלפון, אימייל; אזור „פרטי הורה" (שם, טלפון, אימייל) — מוצג כשהתאריך מצביע על קטין, או כשכבר יש בו נתונים. אחרי יצירה — מעבר לפרטי התלמיד עם הצעה „הוספת תחום לימוד". |
| `/admin/students/[id]` | Admin/Super | כותרת: אוואטר, שם, גיל, Badge סטטוס. Tabs (מבוססי URL): **„פרטים כלליים"** — טלפון, אימייל, פרטי הורה, סטטוס ותאריך חזרה משוער + אופן החזרה; כפתורים „עריכה" ו„הפוך ללא פעיל"/„הפוך לפעיל". **„תחומי לימוד"** — `StudentSubjectsList` עם „+ הוספת תחום", עריכה (תחום קבוע, מורה, רמה, רקע) והסרה (עם אישור). |
| Dialog „הוספת / עריכת תחום" | Admin/Super | תחום (רק תחומים שהתלמיד עוד לא רשום אליהם) ⇒ מורה קבוע (רק מורים פעילים שמלמדים את התחום; אם אין — הודעה „אין מורה פעיל שמלמד תחום זה" וקישור למורים) ⇒ רמה ⇒ רקע מקצועי. בעריכה — התחום נעול. |
| Dialog „הפוך ללא פעיל" | Admin/Super | תאריך חזרה משוער (אופציונלי). כשמוזן תאריך מופיעה קבוצת Radio חובה **ללא בחירה מראש**: „התראה למנהלים — הסטטוס יישאר לא פעיל עד לשינוי ידני" / „הפעלה אוטומטית — הסטטוס ישתנה לפעיל, בלי שיבוצים אוטומטיים". שמירה ללא בחירה ⇒ שגיאה נגישה ליד השדה. אותו Dialog משמש לעדכון תאריך החזרה. |
| `/teacher/students` | מורה פעיל | כותרת „התלמידים שלי"; חיפוש ומסננים: סטטוס, תחום, רמה. טבלה: שם, גיל, התחומים שהמורה מלמד את התלמיד (Badges), רמה, סטטוס. **ללא** עמודות קשר. |
| `/teacher/students/[id]` | מורה פעיל, רק תלמיד שלו | כותרת: שם, גיל, סטטוס. `StudentSubjectsList` עם כל התחומים; כפתור „עריכת מידע מקצועי" רק בתחומים שהוא המורה הקבוע שלהם. תלמיד שאינו שלו / לא קיים ⇒ `notFound()` (לא חושפים קיום). |
| מורה לא פעיל | — | `/teacher/students*` מפנה ל־`/teacher` (כמו שאר הפעולות שחסומות לו); פריט הניווט אינו מוצג לו. |

### 3.3 ניווט (`src/lib/nav/items.ts`, `NavLinks.tsx`)
- Admin/Super: בית · **תלמידים** · מורים · משתמשים · הגדרות.
- מורה פעיל: בית · **התלמידים שלי**. מורה לא פעיל: בית בלבד (`navItemsForRole` יקבל גם סטטוס).
- אייקון חדש: `students` → `Users` / `GraduationCap` מ־lucide (המורים עוברים ל־`Music` אם צריך להבדיל).

### 3.4 דף פרטי מורה (קיים)
ללא שינוי מבני. השגיאה `skill_in_use` מוצגת בטופס עריכת המורה כשמנסים להסיר תחום בשימוש.

## 4. בדיקות

### 4.1 נתוני בדיקה
`scripts/seed-test-users.ts`: מורה בדיקה **שני** (`test-teacher2@example.test`) עם תחום משלו, כדי לבדוק „תחום שאינו שלו". תלמידי בדיקה נוצרים בבדיקות עצמן עם קידומת `rls-`/`e2e-` ונמחקים ב־`afterAll` (Development בלבד).

### 4.2 Unit (`tests/unit`)
`ageOn`/`isMinor` (יום הולדת היום, 29 בפברואר, אזור זמן), סכמות Zod (שדות חובה, אימייל/טלפון אופציונליים, תאריך לידה עתידי, תאריך חזרה עבר, **תאריך בלי בחירה ⇒ נכשל**), תוויות, `navItemsForRole` למורה פעיל/לא פעיל, מיפוי שגיאות חדשות.

### 4.3 RLS ו־RPC (`tests/rls/students.test.ts`, מול Development)
- **מורה:** רואה רק תלמידים שהוא מורה קבוע שלהם; רואה גם תחומים אחרים שלהם; `select` מ־`student_contacts` ⇒ 0 שורות; קריאה ישירה לתלמיד לא שלו ⇒ 0 שורות; `save_student`, `set_student_status`, `save_student_subject`, `remove_student_subject` ⇒ `not_allowed`; `update_professional_info` בתחום שלו ⇒ מצליח, בתחום של מורה 2 ⇒ `not_allowed`; `insert/update/delete` ישיר על שלוש הטבלאות ⇒ נחסם.
- **מורה לא פעיל:** לא רואה תלמידים ולא יכול לעדכן מידע מקצועי.
- **Admin:** יצירה ועדכון תלמיד + פרטי קשר; תלמיד בשני תחומים עם שני מורים שונים ומידע מקצועי נפרד; מורה שלא מלמד את התחום ⇒ `teacher_not_qualified`; מורה לא פעיל ⇒ `teacher_inactive`; תחום כפול ⇒ `subject_taken`; `set_student_status` עם תאריך בלי בחירה ⇒ `return_mode_required`; תאריך עבר ⇒ נדחה; חזרה ל„פעיל" מנקה את התאריך.
- **השפעה על M2:** הסרת תחום ממורה שמלמד בו תלמיד ⇒ `skill_in_use`; מחיקת תחום שרשום אליו תלמיד ⇒ נחסם.
- **אנונימי:** אין גישה לשום טבלת תלמידים.

### 4.4 E2E (`tests/e2e/students.spec.ts`, Desktop + Mobile)
1. Admin יוצר תלמיד קטין ⇒ אזור פרטי הורה מופיע; נשמר ומוצג ברשימה עם הגיל הנכון.
2. Admin מוסיף לתלמיד שני תחומים עם מורה הבדיקה ומורה 2, ברמות שונות ⇒ מוצגים בנפרד.
3. חיפוש לפי שם, וסינון לפי תחום + רמה + מורה ⇒ התלמיד נמצא; שילוב שלא מתאים ⇒ „לא נמצאו תוצאות".
4. „הפוך ללא פעיל" עם תאריך חזרה ⇒ שמירה בלי בחירה נחסמת עם הודעה; עם „התראה" ⇒ נשמר ומוצג.
5. מורה הבדיקה: רואה את התלמיד ב„התלמידים שלי", **אין** טלפון/אימייל/פרטי הורה בעמוד; עורך רמה ורקע בתחום שלו; בתחום של מורה 2 אין כפתור עריכה.
6. מורה הבדיקה פותח כתובת של תלמיד שאינו שלו ⇒ „לא נמצא"; `/admin/students` ⇒ `/forbidden`.
7. מסכים ב־375px ללא גלילה אופקית; Dialogs נגישים במקלדת.

### 4.5 בסיום
`npm run lint && npm run typecheck && npm test && npm run test:rls && npm run test:e2e` — הכול עובר. בדיקה ידנית בדפדפן (Desktop/Tablet/Mobile) של המסכים החדשים.

## 5. סדר ביצוע
1. Migration ⇒ `db:push` ל־Development ⇒ `db:types` ⇒ Advisors.
2. מורה בדיקה שני ב־`seed-test-users` + בדיקות RLS/RPC (לפני UI).
3. ולידציות, חישוב גיל, תוויות ושגיאות + Unit.
4. ניווט.
5. מנהל: רשימת תלמידים, יצירה/עריכה, פרטי תלמיד.
6. מנהל: תחומי לימוד של תלמיד, סטטוס ותאריך חזרה.
7. מורה: „התלמידים שלי" ופרטי תלמיד עם עריכת מידע מקצועי.
8. עדכוני M2: הודעת `skill_in_use` בעריכת מורה, הודעת מחיקת תחום.
9. E2E, Responsive ונגישות (Focus, Labels, Dialogs, מקלדת).
10. ADR-9 ו־ADR-10 ב־ARCHITECTURE.md, עדכון „פקודות הרצה" ב־CLAUDE.md אם השתנו, סימון 🟡 ב־MILESTONES.md.

## 6. Definition of Done — איך כל סעיף ייבדק
| סעיף | בדיקה |
|---|---|
| תלמיד בכמה תחומים, עם מורה קבוע ומידע מקצועי נפרדים לכל תחום | E2E 2, RLS Admin (שני תחומים / שני מורים), Unique תלמיד+תחום |
| מורה לא קורא/משנה פרטי קשר, ולא עורך תחום שאינו מלמד לאותו תלמיד | E2E 5–6, RLS מורה (`student_contacts` ⇒ 0 שורות, `update_professional_info` בתחום של מורה 2 ⇒ נחסם, כתיבה ישירה נחסמת) |
| תאריך חזרה מחייב בחירה בין התראה להפעלה אוטומטית, ללא ברירת מחדל | E2E 4, Unit Zod, RLS `return_mode_required`, Check Constraint ב־DB |
| Migration הוחל ונבדק על Development; תרחישי הרשאה וחיפוש עברו | `db:push` ל־Development, `npm run test:rls`, E2E 3 |

## 7. מחוץ לתחום של M3 (מתוכנן בהמשך)
ביטול שיבוצים בהשבתת תלמיד (M6) · ביצוע ההתראה/ההפעלה בתאריך החזרה (Cron, M8) · היסטוריית שיעורים ושיבוצים בפרופיל התלמיד (M5) · נוכחות (M7) · Audit של שינויים (M7) · Soft Delete, שחזור ומחיקת היסטוריה (M9) · ייצוא רשימת תלמידים (M10) · מספר תלמידים פעילים ב־Dashboard (M5).
