# תוכנית — Milestone 5: לוח שנה ושיבוץ שיעורים מקצה לקצה

> מקורות: `MILESTONES.md` (M5), `PRD.md` §3.1, §3.3, §4.1, §4.2, §4.5, §4.6, §4.9, §5.5; `ARCHITECTURE.md` §1, §3.1–3.2, §4.2, ADR-1, ADR-4, ADR-8, ADR-9, ADR-12; `DESIGN.md` §1.2–1.5, §2; `wireframes.png` / `mockups.png` (לוח שנה, תצוגת שיעור, יצירת שיעור/סדרה, דף הבית).
> עבודה מול Supabase **Development** בלבד. אין commit עד בקשה מפורשת.

## 0. החלטות שהתקבלו בתכנון (בתשובות המשתמש)

1. **סדרה עם שבועות בעייתיים:** הסדרה נוצרת בכל השבועות הפנויים. לפני השמירה מוצגת רשימת התאריכים הבעייתיים (מורה/תלמיד תפוסים, היעדרות מורה) — והם **לא נוצרים**. המנהל מטפל בהם בנפרד (למשל שיעור חד־פעמי במועד אחר).
2. **מורה בשיעור:** בשיעור חד־פעמי המורה הקבוע נבחר אוטומטית, ואפשר להחליפו במורה **פעיל** אחר שמלמד את התחום (מחליף). **סדרה שבועית תמיד עם המורה הקבוע** של התלמיד בתחום.

## 1. הנחות מימוש (נגזרות מה־spec, ללא דרישות חדשות)

- **מי יוצר שיעורים:** מנהל בלבד (Admin/Super Admin). מורה צופה בלוח שלו, ומאשר/דוחה בקשות שיבוץ מחוץ לזמינותו.
- **משך:** שיעור חד־פעמי — ברירת המחדל של התחום, ניתן לשינוי לשיעור הזה בלבד (5–240 דק'). סדרה — משך ברירת המחדל של התחום (נשמר על הסדרה). שעת התחלה ברבע שעה עגול (כמו בזמינות).
- **מיקום:** `school` („בבית הספר”) / `zoom` („בזום”), חובה, ברירת מחדל „בבית הספר”. נשמר על הסדרה ומועתק לכל מפגש.
- **„כמה מפגשים שבועיים”:** בטופס סדרה אפשר להוסיף כמה שורות „יום + שעה”; כל שורה היא `lesson_series` נפרדת, וכולן נשמרות בפעולה אטומית אחת.
- **שעות פעילות:** שיבוץ מחוץ לשעות הפעילות (או ביום שבית הספר סגור בו לפי שעות הפעילות) — אזהרה ואישור מפורש של המנהל (`p_confirm_outside_hours`). ללא אישור — השרת מחזיר `outside_hours_confirm_required`.
- **זמינות מורה:** מועד פנוי = מכוסה כולו ע״י טווחי זמינות בתוקף באותו תאריך (כולל טווחים צמודים, למשל 10–12 + 12–14), פחות היעדרויות מאושרות. מועד מחוץ לשעות הפעילות הוא תמיד גם מחוץ לזמינות → אחרי אישור האזהרה נוצרת בקשה למורה.
- **שיעור מחוץ לזמינות:**
  - חד־פעמי → בקשת חריגה למורה (לא נוצר שיעור, השעה לא נשמרת).
  - סדרה → בקשת חריגה אחת לכל הסדרה, אם **המועד השבועי** אינו בזמינות הקבועה של המורה. שבוע בודד שבו המורה מסר היעדרות בתוך סדרה שבשאר השבועות זמינה — נחשב „בעייתי” ומדולג (החלטה 1), ולא הופך את כל הסדרה לבקשה.
- **התנגשויות:** נבדקות תמיד ב־Database (גם בבקשה, וגם שוב באישור). קודם התנגשויות, ואז זמינות: מועד תפוס נחסם מיד (`teacher_busy` / `student_busy`), בלי ליצור בקשה.
- **ימי סגירה:** שיעור חד־פעמי ביום סגירה פעיל — נחסם (`closed_day`). בסדרה — מפגש שחל ביום סגירה נוצר בסטטוס `closed_day` („לא מתקיים – יום סגירה”), לא נחשב בהתנגשויות. בנוסף, `save_closure` (מ־M4) יסמן אוטומטית שיעורים `scheduled` שכבר קיימים בטווח הסגירה כ־`closed_day` (PRD §4.6 „מסומנים אוטומטית”). **ביטול** יום סגירה ושחזור השיעורים — M6.
- **סטטוס תלמיד/מורה:** משבצים רק תלמיד פעיל ותחום רשום שלו, ומורה פעיל המלמד את התחום (`teacher_skills`).
- **חלון מתגלגל:** ביצירת סדרה נוצרים מופעים מתאריך ההתחלה עד המוקדם מבין תאריך הסיום ו־12 חודשים קדימה (`generated_until` נשמר על הסדרה). הארכה אוטומטית ע״י Cron (`extend_recurring_lessons`) — M8.
- **תפוגת בקשות:** בקשה שמועד השיעור (או המפגש הראשון בסדרה) עבר — `expired`. ב־M5 התפוגה מתבצעת „בעצלתיים”: הפונקציה `expire_exception_requests()` רצה בתחילת כל טעינת מסך בקשות/Dashboard ובתחילת כל החלטה; תזמון Cron — M8.
- **התראות:** טבלת התראות ושליחת אימייל — M8. ב־M5 המנהל רואה בקשות שנסגרו כ„לא ניתן לשבץ” בתור הבקשות (מתעדכן בזמן אמת), והמורה רואה את בקשותיו במסך „בקשות”.
- **תצוגת שיעור** ב־M5 היא לקריאה בלבד. כפתורי עריכה/ביטול/שחזור — M6. דיווח נוכחות — M7.
- **תצוגות הלוח:** גם למורה יש תצוגת יום, שבוע וחודש, כמו למנהל (PRD §4.9).
- **מסנן „הצג שיעורים מבוטלים”:** נבנה כבר עכשיו (סטטוס `cancelled` קיים במודל), אף שביטול ייווצר רק ב־M6. מפגשי „יום סגירה” מוצגים בלוח בסגנון מעומעם עם התווית „לא מתקיים – יום סגירה”.
- **Dashboard מנהל:** כרטיסים — תלמידים פעילים, מורים פעילים, שיעורי היום, שיעורי השבוע, בקשות ממתינות (זמינות + חריגה); רשימת „השיעורים הקרובים” של היום. „ביטולים/שינויים אחרונים” ו„שעות פנויות” — יתווספו כשיהיו ביטולים ושינויים (M6), לא ב־M5.

## 2. Database — Migration חדש

קובץ: `supabase/migrations/20261102100000_lessons_scheduling.sql`. כל השגיאות העסקיות ב־`P0001` עם מפתח יציב (כמו ב־M4).

### 2.1 טיפוסים
- `lesson_location`: `school`, `zoom`.
- `lesson_status`: `scheduled`, `cancelled`, `closed_day`.
- `series_status`: `active`, `ended`.
- `exception_request_status`: `pending`, `approved`, `rejected`, `expired`, `cannot_schedule`, `cancelled`.
- `exception_request_kind`: `single`, `series`.

### 2.2 טבלאות
- **`lesson_series`**: `id`, `student_id`, `lesson_type_id`, `teacher_id` (המורה הקבוע), `student_subject_id` (FK, restrict), `day_of_week`, `start_time` (time מקומי), `duration_minutes`, `location`, `start_date`, `end_date` (nullable), `generated_until` (date), `status`, `created_by`, timestamps. Checks: quarter-hour, `end_date >= start_date`, `extract(dow from start_date) = day_of_week`.
- **`lessons`**: `id`, `series_id` (nullable), `occurrence_date` (date מקומי), `student_id`, `lesson_type_id`, `teacher_id` (המורה בפועל), `start_at`/`end_at` (`timestamptz`), `location`, `status` (ברירת מחדל `scheduled`), `requires_attention` (bool, default false — לשימוש M6), `version` (int), `exception_request_id` (nullable FK — מקור חריגה), `outside_hours` (bool — שובץ באישור חריגת שעות), `created_by`, timestamps.
  - `unique (series_id, occurrence_date)` — אין מופע כפול.
  - **Exclusion constraints** (`btree_gist`):
    `exclude using gist (teacher_id with =, tstzrange(start_at, end_at, '[)') with &&) where (status = 'scheduled')`, ואותו דבר ל־`student_id`. `[)` מאפשר שיעורים צמודים.
  - Checks: `end_at > start_at`.
  - אינדקסים: `(teacher_id, start_at)`, `(student_id, start_at)`, `(series_id)`, `(status, start_at)`, `(lesson_type_id)`.
  - Trigger `bump_lesson_version` (גרסה עולה בכל עדכון; ל־M6).
- **`exception_booking_requests`**: `id`, `kind`, `student_id`, `lesson_type_id`, `teacher_id`, `student_subject_id`, `location`, `start_date` (תאריך השיעור / תחילת הסדרה), `start_time`, `duration_minutes`, `end_date` (סדרה, nullable), `first_start_at` (timestamptz — לתפוגה), `outside_hours` (bool), `status`, `version`, `requested_by`, `decided_by`, `decided_at`, `decision_note`, `result_note` (למשל „המועד נתפס”), `lesson_id` / `series_id` (התוצאה אחרי אישור), timestamps. Trigger גרסה (`bump_request_version` הקיים).

### 2.3 פונקציות עזר (security definer, `search_path = ''`, ללא grant ללקוח אלא אם צוין)
- `local_ts(p_date date, p_time time) → timestamptz` — `(p_date + p_time) at time zone 'Asia/Jerusalem'` (פותר שעון קיץ).
- `teacher_available_on(p_teacher uuid, p_date date, p_start time, p_end time) → boolean` — איחוד טווחי `teacher_available` בתוקף בתאריך (טווחים צמודים מתמזגים) מכסה את `[start,end)`, ואין היעדרות מאושרת שחופפת (יום שלם או שעות).
- `teacher_weekly_covers(p_teacher, p_day, p_start, p_end, p_from date) → boolean` — לסדרה: הזמינות הקבועה מכסה את המועד השבועי מתאריך ההתחלה (בלי להתחשב בהיעדרויות).
- `closure_on(p_date) → boolean` — יש יום סגירה פעיל בתאריך.
- `lesson_conflict(p_teacher, p_student, p_start_at, p_end_at) → text` — `'teacher_busy'` / `'student_busy'` / null, מול שיעורים `scheduled`.
- `validate_booking(...)` — בדיקות משותפות: תלמיד פעיל, `student_subject` קיים לתלמיד ולתחום, מורה פעיל עם `teacher_skills` לתחום, סדרה ⇐ מורה = `regular_teacher_id`, quarter-hour, משך 5–240, תאריך לא בעבר (ושעה לא עברה היום).
- `generate_series_occurrences(p_series_id, p_until date) → table(occurrence_date, result)` — יוצר מופעים מ־`generated_until+1` עד `p_until`: יום סגירה ⇒ `closed_day`; התנגשות או היעדרות ⇒ מדולג ומוחזר כ„בעייתי”; אחרת `scheduled`. מעדכן `generated_until`. משמש גם ב־M8.
- `expire_exception_requests() → integer` — `pending` עם `first_start_at <= now()` ⇒ `expired`. Grant ל־authenticated (בטוח, Idempotent).

### 2.4 פונקציות פעולה (grant ל־authenticated, בדיקת הרשאה בפנים)
- **`book_lesson(p_student_id, p_lesson_type_id, p_teacher_id, p_date, p_start_time, p_duration, p_location, p_confirm_outside_hours boolean) → jsonb`**
  מנהל בלבד. `validate_booking` → יום סגירה ⇒ `closed_day` → התנגשות ⇒ `teacher_busy`/`student_busy` → מחוץ לשעות ללא אישור ⇒ `outside_hours_confirm_required` → מחוץ לזמינות ⇒ יוצר `exception_booking_requests` ומחזיר `{result: 'request', request_id}` → אחרת `insert` ל־`lessons` ומחזיר `{result: 'lesson', lesson_id}`. `exclusion_violation` (מרוץ מקבילי) ⇒ `teacher_busy`/`student_busy` לפי שם האילוץ.
- **`preview_series(p_student_id, p_lesson_type_id, p_meetings jsonb, p_start_date, p_end_date) → jsonb`**
  מנהל בלבד, קריאה בלבד. לכל מפגש שבועי: האם מחוץ לשעות, האם מחוץ לזמינות הקבועה, רשימת תאריכים בעייתיים (עם סיבה: מורה תפוס / תלמיד תפוס / היעדרות מורה), תאריכי סגירה, ומספר המפגשים שייווצרו. משמש למסך האישור לפני שמירה.
- **`create_series(p_student_id, p_lesson_type_id, p_meetings jsonb, p_start_date, p_end_date, p_location, p_confirm_outside_hours) → jsonb`**
  מנהל בלבד. `p_meetings` = `[{"day":1,"start":"16:00"}, ...]`. מורה = הקבוע, משך = ברירת מחדל. לכל מפגש: אם מחוץ לזמינות הקבועה ⇒ בקשת חריגה (`kind = series`); אחרת יוצר `lesson_series` + `generate_series_occurrences`. הכול ב־Transaction אחת. מחזיר לכל מפגש: נוצר / נשלחה בקשה, ורשימת תאריכים שדולגו.
  (תאריך ההתחלה מתיישר ליום השבוע של כל מפגש: המופע הראשון הוא היום המתאים הראשון ≥ `p_start_date`.)
- **`respond_exception_request(p_id, p_version, p_approve boolean, p_note text)`**
  המורה של הבקשה בלבד (פעיל). קודם `expire_exception_requests()`. נעילת השורה ובדיקה `status = 'pending' and version = p_version` (אחרת `request_already_handled`). דחייה ⇒ `rejected`. אישור ⇒ בדיקה מחדש: תלמיד/מורה עדיין פעילים, אין יום סגירה (חד־פעמי), אין התנגשות ⇒ יוצר שיעור/סדרה (מקור `exception_request_id`, הסכמת המורה מכסה את חריגת הזמינות) וסטטוס `approved`; אם תפוס ⇒ `cannot_schedule` + `result_note`. בסדרה: תאריכים תפוסים מדולגים (החלטה 1); `cannot_schedule` רק אם המפגש הראשון תפוס.
- **`cancel_exception_request(p_id, p_version)`** — מנהל, בקשה `pending` בלבד ⇒ `cancelled`.
- **`list_calendar_lessons(p_from timestamptz, p_to timestamptz, p_teacher_id, p_student_id, p_lesson_type_id, p_include_cancelled boolean)`** — מחזירה שורות לתצוגה: מזהה, זמנים, סטטוס, מיקום, `series_id`, שם תלמיד, שם מורה, שם וצבע תחום. מנהל — הכול; מורה פעיל — רק `teacher_id = current_teacher_id()` (כולל שיעורי מחליף: שם התלמיד בלבד, ללא פרטי קשר — ADR-9 נשמר). מורה לא פעיל — ריק ב־M5 (היסטוריה ב־M9).
- **`get_lesson(p_id)`** — אותם כללים, שורה אחת + פרטי סדרה (יום, שעה, תאריך סיום).

### 2.5 שינויים בפונקציות קיימות
- **`save_closure`** — אחרי יצירת הסגירה: `update lessons set status = 'closed_day' where status = 'scheduled' and occurrence_date between ...`.
- **`remove_student_subject`** — חסימה (`subject_has_lessons`) אם יש שיעורים `scheduled` עתידיים או סדרה פעילה.
- **`save_student_subject`** — שינוי מורה קבוע כשיש סדרה פעילה / שיעורים עתידיים: חסימה (`regular_teacher_has_lessons`) עם הסבר שהחלפת מורה בסדרה תגיע ב־M6.
- **מחיקת תחום לימוד (שיפור מ־M2)** — פונקציה חדשה `delete_lesson_type(p_id uuid, p_remove_from_teachers boolean)`: נחסם אם רשומים לתחום תלמידים (`lesson_type_has_students`), אם יש שיעורים/סדרות בתחום (`lesson_type_has_lessons`), או אם זה התחום היחיד של מורה כלשהו (`lesson_type_only_skill`, עם שמות המורים). אם יש מורים ו־`p_remove_from_teachers = false` ⇒ `lesson_type_has_teachers`. אחרת מוחק את `teacher_skills` ואת התחום באותה Transaction. בנוסף `lesson_type_delete_info(p_id)` — רשימת המורים המושפעים וסיבות חסימה, לתצוגת הדיאלוג.

### 2.6 RLS, הרשאות, Realtime
- RLS על `lesson_series`, `lessons`, `exception_booking_requests`. `revoke all` מ־anon/authenticated; `grant select` ל־authenticated בלבד; **אין** insert/update/delete ישיר — הכול דרך הפונקציות.
- `select`: מנהל — הכול; מורה פעיל — `teacher_id = current_teacher_id()`.
- `alter publication supabase_realtime add table public.lessons, public.lesson_series, public.exception_booking_requests;`
- `revoke execute ... from public, anon, authenticated` לכל הפונקציות, ו־`grant` רק לפונקציות הפעולה/קריאה שבסעיף 2.4 ול־`delete_lesson_type`, `lesson_type_delete_info`, `expire_exception_requests`.
- אחרי החלה: `npm run db:push` (Development) ו־`npm run db:types`.
- הרצת `get_advisors` (security/performance) מול Development ותיקון אזהרות רלוונטיות (למשל אינדקסים ל־FK).

## 3. ספריות

- התקנת FullCalendar (MIT, לפי ARCHITECTURE §1): `@fullcalendar/react`, `@fullcalendar/core`, `@fullcalendar/daygrid`, `@fullcalendar/timegrid`, `@fullcalendar/interaction`. לפני השימוש — בדיקת תיעוד עדכני (Context7) ל־React 19 / Next 16, RTL (`direction: 'rtl'`, `locale: 'he'`), `timeZone` ואירועים. אין תוספים בתשלום.
- קריאת המדריכים הרלוונטיים ב־`node_modules/next/dist/docs/` (לפי `AGENTS.md`) לפני כתיבת דפים/Server Actions.

## 4. קוד אפליקציה

### 4.1 Lib
- `src/lib/lessons/labels.ts` — תוויות סטטוס שיעור, מיקום („בבית הספר” / „בזום”), סטטוסי בקשת חריגה (`ממתין לאישור מורה`, `אושר`, `נדחה`, `פג תוקף`, `לא ניתן לשבץ`, `בוטל`).
- `src/lib/lessons/time.ts` — המרות `Asia/Jerusalem` ↔ UTC, טווחי יום/שבוע/חודש לשאילתה, עיצוב „16:00–16:45”. בדיקות Unit כולל מעבר שעון קיץ.
- `src/lib/lessons/queries.ts` (`server-only`) — `loadCalendarLessons`, `loadLesson`, `loadBookingOptions` (תלמידים פעילים + תחומיהם + המורה הקבוע, מורים פעילים לפי תחום, משך ברירת מחדל), `loadDashboard` (מונים + שיעורים קרובים), `loadExceptionRequests`.
- `src/lib/lessons/actions.ts` — Server Actions: `bookLesson`, `previewSeries`, `createSeries`, `respondExceptionRequest`, `cancelExceptionRequest`. בדיקת תפקיד (`requireRole`) + Zod + קריאה ל־RPC; מיפוי `result` להודעה מתאימה.
- `src/lib/validation/lessons.ts` — סכמות Zod (תאריך, quarter-hour, משך 5–240, מיקום, 1–7 מפגשים שבועיים ללא כפילות יום+שעה, `endDate >= startDate`).
- `src/lib/errors.ts` — מפתחות חדשים: `teacher_busy`, `student_busy`, `closed_day`, `outside_hours_confirm_required`, `student_inactive`, `subject_not_enrolled`, `teacher_not_regular`, `date_past`, `subject_has_lessons`, `regular_teacher_has_lessons`, `lesson_type_has_students`, `lesson_type_has_lessons`, `lesson_type_only_skill`, `lesson_type_has_teachers`.

### 4.2 לוח שנה (מנהל ומורה)
- `src/components/calendar/LessonCalendar.tsx` (client) — FullCalendar, RTL, עברית, `timeZone: 'Asia/Jerusalem'`. מנהל ומורה: יום/שבוע/חודש (PRD §4.9). צבע בלוק לפי התחום; תוכן: תחום — תלמיד (+ מורה במנהל), אייקון/תווית „בזום” כשרלוונטי (לא צבע בלבד); `closed_day` מעומעם עם תווית. שינוי טווח/תצוגה ⇒ עדכון ה־URL (`?view=&date=`) והשרת טוען את הטווח. בנייד: ברירת מחדל „יום” גם למנהל וגם למורה כשהרוחב צר (התאמה בלבד, אותם נתונים).
- `src/components/calendar/CalendarFilters.tsx` — מנהל: מורה, תלמיד, תחום, תאריך (קפיצה), „הצג שיעורים מבוטלים”. מורה: „הצג מבוטלים” בלבד. הסינון ב־URL.
- `src/components/calendar/LessonDetails.tsx` — פאנל פרטים (Dialog ב־Radix, לפי ה־Mockup): תלמיד, מורה (וסימון „מחליף” אם אינו הקבוע), תחום, תאריך, שעה, משך, מיקום, סטטוס, „חלק מסדרה שבועית — יום X בשעה Y, עד תאריך / ללא תאריך סיום”. ללא פעולות עריכה ב־M5.
- דפים: `src/app/(app)/admin/calendar/page.tsx`, `src/app/(app)/teacher/calendar/page.tsx`, עם `LiveRefresh tables={["lessons","exception_booking_requests"]}`.

### 4.3 יצירת שיעור / סדרה (מנהל)
- `src/components/lessons/BookLessonDialog.tsx` — כפתור „שיעור חדש” בלוח (וב־Dashboard). Tabs „שיעור בודד” / „סדרת שיעורים” (לפי ה־Wireframe).
  - שדות משותפים: תלמיד (פעילים) ⇐ תחום (מתחומי התלמיד) ⇐ מורה (ברירת מחדל: הקבוע; בשיעור בודד — אפשר לבחור מורה פעיל אחר בתחום, מסומן „מחליף”; בסדרה — מוצג לקריאה), מיקום (Radio: בבית הספר / בזום).
  - שיעור בודד: תאריך, שעת התחלה (רבע שעה), משך (ברירת מחדל מהתחום, ניתן לשינוי), שעת סיום מחושבת לתצוגה.
  - סדרה: תאריך התחלה, תאריך סיום (לא חובה, „ללא תאריך סיום”), רשימת מפגשים שבועיים (יום + שעה) עם „הוספת מפגש שבועי”, משך = ברירת מחדל (לקריאה).
  - עזרה לבחירה: לפי המורה והיום, הצגת טווחי הזמינות של המורה ושעות הפעילות באותו יום (מידע בלבד; הבדיקה בשרת).
- זרימת שמירה:
  - שיעור בודד: `bookLesson` ⇒ אם `outside_hours_confirm_required` ⇒ Dialog אזהרה („המועד מחוץ לשעות הפעילות… לשבץ בכל זאת?”) ⇒ שליחה חוזרת עם אישור. תוצאה `request` ⇒ הודעה „המועד מחוץ לזמינות המורה. נשלחה בקשת אישור למורה — השעה אינה שמורה עד לאישורו.”
  - סדרה: `previewSeries` ⇒ מסך סיכום: כמה מפגשים ייווצרו, תאריכי סגירה, **תאריכים בעייתיים שלא ייווצרו** (עם סיבה), מפגשים שיישלחו כבקשה למורה, אזהרת שעות פעילות עם תיבת אישור ⇒ „שמירה” ⇒ `createSeries`.
- `src/components/ui/Field` הקיים, `SelectField`, `ChoiceGroup`, `Dialog`, `Tabs`, `Alert` — שימוש חוזר; CSS Modules (ADR-1).

### 4.4 בקשות שיבוץ מחוץ לזמינות
- **מנהל — `/admin/requests`:** Tabs „זמינות והיעדרויות” (קיים) / „שיבוץ מחוץ לזמינות” (חדש). טבלה: תאריך יצירה, תלמיד, מורה, תחום, מועד (או „סדרה: יום X בשעה Y מ־…”), מיקום, סטטוס, הערת תוצאה; פעולה „ביטול בקשה” ל־`pending`. סינון לפי סטטוס.
- **מורה — `/teacher/requests` (חדש):** בקשות השיבוץ שהופנו אליו: פרטים, „אישור” / „דחייה” (עם הערה אופציונלית) — `ConfirmAction` עם version; סטטוסים סגורים כהיסטוריה. הודעה ברורה כשהבקשה כבר טופלה / נסגרה כ„לא ניתן לשבץ”.
- שני המסכים עם `LiveRefresh` על `exception_booking_requests` ו־`lessons`, וקריאה ל־`expire_exception_requests()` בטעינה.

### 4.5 Dashboards
- `src/app/(app)/admin/page.tsx` — כרטיסי מדדים (Mockup „דף הבית”): תלמידים פעילים, מורים פעילים, שיעורי היום, שיעורי השבוע (שבוע ראשון–שבת), בקשות ממתינות (זמינות + שיבוץ). רשימת „השיעורים הקרובים” של היום (שעה, תחום — תלמיד, מורה, מיקום), קישור ללוח השנה. `LiveRefresh` על `lessons`, `availability_requests`, `exception_booking_requests`, `students`, `teachers`.
- `src/app/(app)/teacher/page.tsx` — מורה פעיל: שיעורים קרובים (היום + 7 ימים), בקשות שיבוץ ממתינות לאישורו (מספר + קישור). מורה לא פעיל — ללא שינוי (היסטוריה ב־M9). `LiveRefresh`.
- `src/app/(app)/Home.module.css` — עדכון לפריסת כרטיסים ורשימה; רספונסיבי.

### 4.6 ניווט
- `src/lib/nav/items.ts` — אייקון `calendar`; מנהל: „לוח שנה” (`/admin/calendar`) אחרי „בית”; מורה פעיל: „הלוח שלי” (`/teacher/calendar`), „בקשות” (`/teacher/requests`). `NavLinks`/`AppShell` — מיפוי אייקון חדש (lucide). בדיקת `canAccessPath` לנתיבים החדשים.

### 4.7 שיפורים מ־M1/M2
- **כפתור עין לסיסמה:** רכיב `src/components/ui/PasswordField.tsx` (עוטף את `Field`): כפתור `type="button"` בתוך השדה (צד שמאל ב־RTL, logical properties), `aria-label` „הצגת הסיסמה”/„הסתרת הסיסמה”, `aria-pressed`, `aria-controls`, נגיש במקלדת, Focus נראה; אייקונים `Eye`/`EyeOff`. החלפה ב־`LoginForm`, `RegisterForm` (2), `ResetPasswordForm` (2), `ProfileForms` (3). שמירה על `autoComplete` הקיים. עדכון בדיקות E2E שמחפשות `getByLabel("סיסמה")` ל־`{ exact: true }` כדי שלא יתנגשו עם תווית הכפתור.
- **תחום חדש מתוך חלונית מורה:** ב־`TeacherDialog` — קישור/כפתור „הוספת תחום חדש” שפותח טופס קצר בתוך החלונית (שם + משך ברירת מחדל). Server Action `createLessonTypeInline` (הלוגיקה של `createLessonType` הקיים, צבע אוטומטי דרך `pick_lesson_type_color`) מחזיר `{id, name, color}`; הרכיב מוסיף אותו לרשימת האפשרויות ומסמן אותו מיד. גם כשאין עדיין תחומים כלל — הטופס זמין (במקום ההפניה להגדרות בלבד). `ChoiceGroup` יעבור למצב מבוקר כדי לשמור סימונים קיימים.
- **מחיקת תחום עם מורים:** בדף תחומי הלימוד, דיאלוג מחיקה חדש `DeleteLessonTypeDialog`: טוען `lesson_type_delete_info`. אם אין שיוכים — מחיקה רגילה. אם יש מורים בלבד — רשימת המורים המושפעים + תיבת אישור מפורש „הסרת התחום מכל המורים ומחיקתו” ⇒ `delete_lesson_type(id, true)`. אם יש תלמידים רשומים, שיעורים בתחום, או שזה התחום היחיד של מורה — הפעולה חסומה עם הסבר מה לעשות קודם (ובמקרה האחרון, שמות המורים). השרת בודק הכול שוב.

## 5. בדיקות

### 5.1 Unit (`tests/unit/lessons.test.ts`)
- המרת תאריך+שעה מקומית ל־UTC, כולל ימי מעבר שעון קיץ/חורף.
- טווחי יום/שבוע/חודש לשאילתה; תווית שעה.
- סכמות Zod: quarter-hour, משך, מפגשים כפולים, תאריך סיום לפני התחלה.
- `PasswordField` (React Testing Library): החלפת `type`, תוויות נגישות, `aria-pressed`.

### 5.2 RLS / Database (`tests/rls/lessons.test.ts`, מול Development)
- מורה אינו יכול `insert/update/delete` ישיר ל־`lessons`/`lesson_series`/`exception_booking_requests`, ואינו קורא שיעורים של מורה אחר; מנהל קורא הכול; `anon` — כלום.
- `book_lesson` בידי מורה ⇒ `not_allowed`.
- התנגשות מורה ותלמיד נחסמת; **שיעורים צמודים** (16:00–16:45 ו־16:45–17:30) מותרים.
- **שתי קריאות מקבילות** (`Promise.all`) לאותו מורה/מועד עם תלמידים שונים, ולאותו תלמיד עם מורים שונים ⇒ בדיוק אחת מצליחה.
- מחוץ לזמינות ⇒ בקשה, ואין שיעור; בקשה ממתינה אינה חוסמת שיבוץ אחר באותה שעה.
- אישור מאוחר אחרי שהשעה נתפסה ⇒ `cannot_schedule`; אישור כפול / version ישן ⇒ `request_already_handled`; תפוגה ⇒ `expired` (בקשה עם מועד שעבר, שנוצרה ע״י service key לבדיקה).
- מחוץ לשעות פעילות בלי אישור ⇒ `outside_hours_confirm_required`; עם אישור ⇒ נוצר (או בקשה אם מחוץ לזמינות).
- סדרה ללא/עם תאריך סיום: מספר המופעים, `unique (series_id, occurrence_date)`, יום סגירה ⇒ `closed_day`, שבוע עם התנגשות/היעדרות ⇒ מדולג ומדווח; מופעים בחלון 12 חודשים בלבד.
- יום סגירה חדש מסמן שיעורים קיימים כ־`closed_day`.
- `delete_lesson_type`: חסימה עם תלמידים / תחום יחיד / שיעורים; הסרה אטומית מכל המורים במקרה התקין.
- ניקוי נתוני הבדיקה בסיום (לפי `PREFIX`, כמו בבדיקות הקיימות).

### 5.3 E2E (`tests/e2e/lessons.spec.ts`, Playwright, Desktop + Mobile כמו הקיים)
- מנהל יוצר שיעור בודד „בזום” ⇒ מופיע בלוח המנהל ובלוח המורה עם הסימון; פרטי שיעור מציגים את המיקום.
- מנהל יוצר סדרה עם שני מפגשים שבועיים וללא תאריך סיום, ואחת עם תאריך סיום ⇒ מופיעות בשבועות הבאים.
- ניסיון חפיפה ⇒ הודעת שגיאה ברורה.
- שיבוץ מחוץ לזמינות ⇒ בקשה; המורה מאשר במסך „בקשות” ⇒ השיעור מופיע **בלי רענון** אצל המנהל (שני דפדפנים, כמו ב־M4).
- Dashboard מנהל מתעדכן בלי רענון כשנוצר שיעור להיום.
- כפתור עין בהתחברות; הוספת תחום מתוך חלונית מורה; מחיקת תחום עם מורים.
- בדיקה ידנית/צילומי מסך: RTL, Mobile/Tablet/Desktop של הלוח, הדיאלוגים וה־Dashboard; ניווט מקלדת בדיאלוגים.

### 5.4 בסיום
`npm run lint && npm run typecheck && npm test && npm run test:rls && npm run test:e2e` + `npm run build`. סגירת השרת שהורץ לבדיקות.

## 6. תיעוד

- **ADR-13** ב־`ARCHITECTURE.md`: מודל השיעורים — `lesson_series` + `lessons` עם Exclusion Constraints ל־`[start,end)` לשיעורים `scheduled`; בדיקות ופעולות דרך פונקציות Database בלבד; דילוג על שבועות בעייתיים ביצירת סדרה (החלטת משתמש); חלון 12 חודשים עם `generated_until`; תפוגה „בעצלתיים” עד Cron ב־M8; קריאת לוח דרך `list_calendar_lessons` כדי שמורה מחליף יראה שם תלמיד בלי פרטי קשר.
- עדכון „פקודות הרצה” ב־`CLAUDE.md` רק אם משתנה (לא צפוי).
- סימון 🟡 ליד Milestone 5 ב־`MILESTONES.md` בסיום הבנייה.

## 7. מחוץ ל־M5 (מתוכנן לבאות)

עריכה/ביטול/שחזור שיעור וסדרה, החלפת מורה בסדרה, השפעת השבתת תלמיד/מורה, ביטול יום סגירה ושחזור שיעורים, השפעת אישור היעדרות/הסרת זמינות על שיעורים קיימים — **M6**. נוכחות ו־Audit — **M7**. התראות, אימייל, Cron (תפוגה והארכת סדרות) — **M8**. היסטוריית מורה לא פעיל — **M9**.

## 8. Definition of Done — איך ייבדק

| תנאי | בדיקה |
|---|---|
| שיעור בודד וסדרה ללא/עם תאריך סיום נוצרים ומוצגים בלוחות הנכונים, כולל „בבית הספר”/„בזום” | E2E יצירה + לוח מנהל ומורה + פרטי שיעור; RLS על מספר מופעים |
| התנגשות נחסמת גם בשתי פעולות מקבילות; שיעורים צמודים מותרים | RLS מקבילי (`Promise.all`) + בדיקת שיעורים צמודים |
| בקשה חריגה אינה תופסת שעה; אישור מאוחר בודק שוב; `פג תוקף`/`לא ניתן לשבץ` מתועדים | RLS + E2E אישור מורה; תצוגת סטטוסים בתור המנהל ואצל המורה |
| Dashboard ולוח מתעדכנים בלי רענון; Migrations, RLS ו־Responsive ב־Development | E2E שני דפדפנים; `db:push` ל־Development; advisors; צילומי Mobile/Tablet/Desktop |
