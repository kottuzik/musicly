# Milestone 4 — שעות פעילות, זמינות מורים וימי סגירה

**מטרה (מ־MILESTONES.md):** לבנות מקור אמין למועדים שבהם מותר להציע שיעורים.
**מקורות:** PRD §2.1, §2.2, §3.1 (מסכים 5, 8, 9), §3.4, §4.2, §4.6, §4.8, §5.2–5.5 · ARCHITECTURE §2.1–2.2, §3.1–3.3, §4.1–4.2, §5.2, §8.3, ADR-1, ADR-4, ADR-8 · DESIGN §1.9, §1.10, §1.11, §1.17 · wireframes/mockups: „זמינות מורה", „בקשות אישור (רשימה)", „הגדרות בית ספר".

## 0. החלטות שהתקבלו בתכנון

| נושא | החלטה | נימוק |
|---|---|---|
| חגים מוצעים | **המשתמש בחר:** רשימה מלאה — ימי שבתון (ראש השנה א׳+ב׳, יום כיפור, סוכות, שמחת תורה, פסח א׳, שביעי של פסח, שבועות, יום העצמאות) + ערבי חג, חול המועד, חנוכה, פורים, ל״ג בעומר, יום הזיכרון ותשעה באב. **אף יום לא נחסם בלי בחירת מנהל.** ימי שבתון מסומנים „יום שבתון" ברשימה כדי להקל על הבחירה, אבל לא מסומנים מראש. | PRD §4.6. |
| מקור תאריכי החגים | חישוב בקוד שלנו לפי לוח השנה העברי המובנה בדפדפן/Node (`Intl.DateTimeFormat` עם `calendar: "hebrew"`), כולל כללי הזזה של יום העצמאות/הזיכרון ותשעה באב. בלי ספרייה חיצונית ובלי שירות חיצוני. | ספריית הלוח העברי המוכרת (`@hebcal/core`) ברישיון GPL; החישוב פשוט ונבדק ב־Unit מול תאריכים ידועים. → **ADR-11** |
| שעות פעילות | **טווח אחד לכל יום** (פתיחה–סגירה). יום בלי שורה = סגור. אין שעות ברירת מחדל — בהתחלה כל הימים סגורים. | PRD §4.2, wireframe „הגדרות בית ספר". |
| זמינות מורה | כמה טווחים לכל יום (כפתור „הוספת טווח שעות" כמו ב־wireframe). טווחים לא חופפים לאותו מורה; טווחים צמודים (16:00–18:00 + 18:00–20:00) מותרים. דקות בקפיצות של 15. | DESIGN §1.10. |
| זמינות רק בתוך שעות פעילות | הוספת זמינות (מורה **או** מנהל) מחוץ לשעות הפעילות של אותו יום — נחסמת בשרת וב־Database (`outside_operating_hours`). | DoD 1. |
| שינוי שעות פעילות כשיש זמינות מחוץ להן | לא נמחקת ולא משתנה אוטומטית. במסך הזמינות היא מסומנת „מחוץ לשעות הפעילות", ובשמירת שעות הפעילות מוצגת אזהרה עם מספר הטווחים שיצאו מחוץ לשעות. טיפול בשיעורים מושפעים — M6. | PRD §4.2 („אינו מבטל אוטומטית"). |
| הוספת זמינות | נכנסת לתוקף **מיד**, בלי בקשה. | PRD §4.2, DoD 2. |
| הסרה קבועה | **המשתמש בחר:** המורה בוחר „החל מתאריך" (היום או בעתיד). אחרי אישור — הטווח מקבל `valid_to` = יום לפני התאריך. עד האישור הטווח נשאר פעיל ומסומן „ממתין להסרה". | PRD §4.2. |
| הסרה חד־פעמית | המורה בוחר טווח קבוע + תאריך אחד (באותו יום בשבוע). אחרי אישור נוצרת היעדרות בשעות של הטווח באותו תאריך. | PRD §4.2. |
| היעדרות | **המשתמש בחר:** שתי צורות — טווח ימים שלמים (מתאריך עד תאריך), או יום אחד עם שעות מ–עד. סיבה — טקסט אופציונלי (עד 500 תווים). | PRD §4.2. |
| מנהל עורך זמינות | **המשתמש בחר:** מנהל יכול במסך המורה להוסיף זמינות, להסיר (קבוע/חד־פעמי) ולהזין היעדרות — **ישירות, בלי בקשה**. הפעולה נרשמת כבקשה „אושרה" שהמנהל עצמו יצר ואישר — כך כל הסרה מתועדת (מי, מתי, מה). | „החלטה מתועדת של מנהל". |
| סטטוסי בקשה | `pending` (ממתינה) → `approved` (אושרה) / `rejected` (נדחתה, עם הערה אופציונלית) / `cancelled` (המורה ביטל לפני טיפול). אין „בטיפול" — כל פעולה מיידית ואטומית, ומניעת טיפול כפול נעשית בבדיקת סטטוס+גרסה. | PRD §3.4, ARCHITECTURE §3.2. |
| טיפול כפול | אישור/דחייה נשלחים עם `version` שהמנהל ראה. ה־Database מעדכן רק אם `status = 'pending'` והגרסה זהה; אחרת `request_already_handled` („הבקשה כבר טופלה בידי מנהל אחר") והמסך מתרענן. | DoD 3. |
| זמן אמת | Supabase Realtime (`postgres_changes`, כפוף ל־RLS) על טבלאות הבקשות, הזמינות, ההיעדרויות ושעות הפעילות. רכיב לקוח קטן מאזין ומרענן את הנתונים (`router.refresh()`). | DoD 3, ARCHITECTURE §2.1 (5). |
| ימי סגירה | יום סגירה = טווח תאריכים (יום אחד או כמה) + שם. מקור: „חג" (מהרשימה) או „מיוחד" (הזנה ידנית). ביטול יום סגירה משנה סטטוס ל„בוטל" (נשמר בהיסטוריה), לא נמחק. | PRD §4.6, ARCHITECTURE §3.1 (`status`). |
| שיעורים מושפעים | אין עדיין שיעורים. הצגת שיעורים מושפעים, סימון „לא מתקיים – יום סגירה", „דורש טיפול" והחלטות לכל שיעור — **M5/M6**. בדיאלוגים של אישור הסרה/היעדרות וסגירה תוצג שורה: „אין שיעורים מושפעים" (מקום מוכן להמשך). | MILESTONES M4. |
| מורה לא פעיל | אינו יכול להוסיף זמינות או לשלוח בקשות (`not_allowed`); הפריט „הזמינות שלי" לא מוצג לו. בקשותיו הממתינות נשארות בתור למנהל. | PRD §2.1. |
| התראות | מרכז ההתראות ושליחת מייל — **M8**. ב־M4 המורה רואה את סטטוס הבקשות שלו (והערת הדחייה) במסך הזמינות, בזמן אמת. | MILESTONES M8. |
| אזור זמן | שעות פעילות וזמינות נשמרות כשעה מקומית (`time`) של בית הספר; תאריכים — `date` לפי `Asia/Jerusalem` (`school_today()` הקיים). כך אין בעיות שעון קיץ. | ARCHITECTURE §9. |
| פריטים מהתמונות שלא נבנים | טאב „פרטים כלליים" בהגדרות (שם בית הספר, אזור זמן) ו„הגדרות התראה" — אינם ב־PRD/M4. אזור הזמן קבוע: `Asia/Jerusalem`. | DESIGN §1.17 (רק מה שב־PRD). |

## 1. Database — Migration חדש

קובץ: `supabase/migrations/20261101100000_availability_closures.sql`
(`btree_gist` מופעל אם אינו קיים — נדרש לאילוצי אי־חפיפה.)

### 1.1 טיפוסים וטבלאות

```sql
create extension if not exists btree_gist with schema extensions;

create type public.availability_request_kind as enum ('remove_weekly', 'remove_once', 'absence');
create type public.request_status as enum ('pending', 'approved', 'rejected', 'cancelled');
create type public.closure_source as enum ('holiday', 'custom');
create type public.closure_status as enum ('active', 'cancelled');

-- One opening range per weekday; a missing row means closed. 0 = Sunday.
create table public.operating_hours (
  day_of_week smallint primary key check (day_of_week between 0 and 6),
  open_time   time not null,
  close_time  time not null check (close_time > open_time),
  updated_by  uuid references public.profiles (id),
  updated_at  timestamptz not null default now()
);

create table public.teacher_availability (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.teachers (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time  time not null,
  end_time    time not null check (end_time > start_time),
  valid_from  date not null default public.school_today(),
  valid_to    date,                         -- inclusive last day; null = open-ended
  created_by  uuid references public.profiles (id),
  created_at, updated_at,
  check (valid_to is null or valid_to >= valid_from - 1),  -- removal on the start day closes it immediately
  check (extract(minute from start_time)::int % 15 = 0 and extract(minute from end_time)::int % 15 = 0),
  -- No overlapping slots for the same teacher, day and validity period (adjacent slots allowed).
  exclude using gist (
    teacher_id with =, day_of_week with =,
    tsrange('2000-01-01'::date + start_time, '2000-01-01'::date + end_time) with &&,
    daterange(valid_from, valid_to, '[]') with &&
  )
);
create index teacher_availability_teacher_idx on public.teacher_availability (teacher_id, day_of_week);

create table public.availability_requests (
  id              uuid primary key default gen_random_uuid(),
  teacher_id      uuid not null references public.teachers (id) on delete cascade,
  kind            public.availability_request_kind not null,
  availability_id uuid references public.teacher_availability (id) on delete set null, -- remove_weekly / remove_once
  start_date      date not null,          -- remove_weekly: effective-from; remove_once: the date; absence: first day
  end_date        date,                   -- absence: last day (= start_date for a single day)
  start_time      time,                   -- absence with hours (single day only) / remove_once copies the slot
  end_time        time,
  reason          text check (length(reason) <= 500),
  status          public.request_status not null default 'pending',
  version         integer not null default 1,
  requested_by    uuid not null references public.profiles (id),
  decided_by      uuid references public.profiles (id),
  decided_at      timestamptz,
  decision_note   text check (length(decision_note) <= 500),
  created_at, updated_at,
  check ((start_time is null) = (end_time is null)),
  check (start_time is null or end_time > start_time),
  check (start_time is null or end_date is null or end_date = start_date),   -- hours only on a single day
  check (end_date is null or end_date >= start_date),
  check (kind = 'absence' or availability_id is not null or status <> 'pending')
);
create index availability_requests_status_idx on public.availability_requests (status, created_at);
create index availability_requests_teacher_idx on public.availability_requests (teacher_id, created_at desc);
-- At most one pending permanent-removal request per slot.
create unique index availability_requests_one_pending_removal
  on public.availability_requests (availability_id) where status = 'pending' and kind = 'remove_weekly';

-- Approved absences (created only by approve/direct-admin actions).
create table public.teacher_absences (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.teachers (id) on delete cascade,
  request_id  uuid not null unique references public.availability_requests (id),
  start_date  date not null,
  end_date    date not null check (end_date >= start_date),
  start_time  time,            -- null = whole days
  end_time    time,
  created_at  timestamptz not null default now(),
  check ((start_time is null) = (end_time is null)),
  check (start_time is null or (end_date = start_date and end_time > start_time))
);
create index teacher_absences_teacher_idx on public.teacher_absences (teacher_id, start_date);

create table public.school_closures (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) between 2 and 100),
  start_date   date not null,
  end_date     date not null check (end_date >= start_date),
  source       public.closure_source not null,
  holiday_key  text,            -- e.g. 'yom-kippur-2026'; set only for source = 'holiday'
  status       public.closure_status not null default 'active',
  created_by   uuid references public.profiles (id),
  cancelled_by uuid references public.profiles (id),
  cancelled_at timestamptz,
  created_at, updated_at,
  check ((source = 'holiday') = (holiday_key is not null))
);
-- The same holiday cannot be active twice.
create unique index school_closures_holiday_active on public.school_closures (holiday_key) where status = 'active';
create index school_closures_dates_idx on public.school_closures (start_date, end_date) where status = 'active';
```

- Triggers `set_updated_at` לטבלאות עם `updated_at`; ב־`availability_requests` ה־Trigger גם מעלה את `version` בכל עדכון.
- הבקשה `availability_requests` היא גם יומן ההחלטות (מי ביקש, מי החליט, מתי, הערה) — עד שיתווסף `audit_events` ב־M7.

### 1.2 פונקציות עזר

| פונקציה | מה עושה |
|---|---|
| `within_operating_hours(p_day smallint, p_start time, p_end time) returns boolean` | `stable`: האם הטווח כולו בתוך שעות הפעילות של היום (יום סגור ⇒ `false`). ישמש גם ב־M5. |
| `can_manage_teacher_availability(p_teacher_id uuid) returns boolean` | `security definer`, `stable`: מנהל פעיל, או מורה פעיל כש־`p_teacher_id = current_teacher_id()`. |

### 1.3 RLS ו־GRANT

| טבלה | קריאה | כתיבה |
|---|---|---|
| `operating_hours` | כל משתמש פעיל (מנהל או מורה פעיל) | רק דרך RPC (מנהל) |
| `teacher_availability` | מנהל: הכול · מורה פעיל: שלו בלבד | רק דרך RPC |
| `availability_requests` | מנהל: הכול · מורה פעיל: שלו בלבד | רק דרך RPC |
| `teacher_absences` | מנהל: הכול · מורה פעיל: שלו בלבד | רק דרך RPC |
| `school_closures` | כל משתמש פעיל | רק דרך RPC (מנהל) |

- `revoke all ... from anon, authenticated` ואז `grant select` ל־`authenticated` (כמו ב־M2/M3). מורה לא פעיל: `current_teacher_id()` ⇒ `null` ⇒ לא רואה.
- Realtime: `alter publication supabase_realtime add table` ל־`operating_hours`, `teacher_availability`, `availability_requests`, `teacher_absences`, `school_closures`. אירועי `postgres_changes` כפופים ל־RLS, כך שמורה מקבל רק את האירועים שלו.

### 1.4 פונקציות פעולה (RPC)

כולן `security definer`, `set search_path = ''`, `revoke execute from public, anon`, בדיקת הרשאה **בתוך** הפונקציה, שגיאות `P0001` + מפתח קבוע.

| פונקציה | מי | מה עושה |
|---|---|---|
| `set_operating_hours(p_days jsonb)` | מנהל | מחליף בטרנזקציה אחת את כל שבעת הימים (`[{day, open, close}]`; יום חסר = סגור). מחזיר את מספר טווחי הזמינות הפעילים שיצאו מחוץ לשעות (לאזהרה). |
| `add_availability(p_teacher_id, p_day, p_start, p_end) returns uuid` | מורה פעיל (עצמו) / מנהל | בודק `within_operating_hours` (`outside_operating_hours`), קפיצות 15 דק׳ ואי־חפיפה (`availability_overlap`, מתוך אילוץ ה־Exclusion). נכנס לתוקף מהיום. |
| `request_availability_removal(p_availability_id, p_kind, p_date, p_reason) returns uuid` | מורה פעיל (טווח שלו) | `remove_weekly`: תאריך היום או עתידי; בקשה ממתינה כפולה ⇒ `removal_pending`. `remove_once`: תאריך עתידי/היום שיום השבוע שלו תואם לטווח (`date_not_matching_day`) ושהטווח בתוקף בו; מעתיק את שעות הטווח. |
| `request_absence(p_start_date, p_end_date, p_start_time, p_end_time, p_reason) returns uuid` | מורה פעיל | לא בעבר (`date_past`); שעות רק ביום אחד. |
| `cancel_availability_request(p_id, p_version)` | המורה שביקש | רק `pending` + גרסה תואמת ⇒ `cancelled`. |
| `decide_availability_request(p_id, p_version, p_approve boolean, p_note text)` | מנהל | `update ... where id = p_id and status = 'pending' and version = p_version` — אם לא עודכנה שורה ⇒ `request_already_handled`. באישור, באותה טרנזקציה: `remove_weekly` ⇒ `valid_to = start_date - 1` (אם התאריך כבר עבר — מהיום); `remove_once`/`absence` ⇒ שורה ב־`teacher_absences`. |
| `admin_remove_availability(p_availability_id, p_kind, p_date, p_reason)` / `admin_add_absence(p_teacher_id, ...)` | מנהל | יוצר בקשה עם `status = 'approved'`, `requested_by = decided_by = המנהל`, ומחיל מיד את אותה לוגיקה (פונקציה פנימית משותפת `apply_availability_request`). |
| `save_closure(p_name, p_start_date, p_end_date, p_holiday_key)` | מנהל | יוצר יום סגירה (חג — עם מפתח; מיוחד — בלי). חג שכבר פעיל ⇒ `closure_exists`. |
| `cancel_closure(p_id)` | מנהל | `status = 'cancelled'`, `cancelled_by/at`. |

`apply_availability_request` אינה נחשפת ל־`authenticated` (`revoke execute`).

### 1.5 החלה ובדיקה
1. `npm run db:push` — על **Development** בלבד.
2. `npm run db:types`.
3. Supabase Advisors (Security + Performance) על Development ותיקון אזהרות.
4. בדיקה שהטבלאות נוספו ל־Publication של Realtime ב־Development.

## 2. Backend (Next.js)

### 2.1 קבצים חדשים / משתנים
- `src/lib/time/weekdays.ts` — שמות ימים בעברית (ראשון…שבת), פורמט שעה `HH:MM`, רשימת שעות בקפיצות 15 דק׳ לבחירה, `dayOfWeek(date)` לפי `Asia/Jerusalem`.
- `src/lib/holidays/israeli.ts` — `israeliHolidays(fromDate, toDate)`: מחזיר `{ key, name, startDate, endDate, isRestDay }` לפי `Intl.DateTimeFormat("en-u-ca-hebrew")`. כולל כללי הזזה: יום העצמאות (ה׳ באייר; שישי/שבת ⇒ חמישי קודם, שני ⇒ שלישי), יום הזיכרון (יום לפניו), תשעה באב (שבת ⇒ ראשון), פורים באדר/אדר ב׳, חנוכה 8 ימים. פונקציות טהורות.
- `src/lib/availability/effective.ts` — `effectiveSlots(slots, absences, date)` ו־`slotStatus(...)` לתצוגה: פעיל / ממתין להסרה / מסתיים בתאריך / מחוץ לשעות הפעילות.
- `src/lib/availability/labels.ts` — תוויות: סוג בקשה („הסרה קבועה", „הסרה חד־פעמית", „היעדרות"), סטטוס („ממתינה", „אושרה", „נדחתה", „בוטלה"), מקור סגירה („חג", „מיוחד").
- `src/lib/validation/availability.ts` — Zod: `operatingHoursSchema` (לכל יום: סגור או פתיחה<סגירה), `availabilitySlotSchema`, `removalRequestSchema`, `absenceSchema` (שעות רק ביום אחד, תאריך לא בעבר), `decisionSchema` (`id`, `version`, `approve`, הערה עד 500), `closureSchema`.
- `src/lib/errors.ts` — מפתחות חדשים: `outside_operating_hours` („הטווח חורג משעות הפעילות של בית הספר ביום זה."), `availability_overlap` („הטווח חופף לזמינות קיימת."), `removal_pending` („כבר נשלחה בקשה להסרת טווח זה."), `date_not_matching_day`, `date_past`, `request_already_handled` („הבקשה כבר טופלה בידי מנהל אחר. הרשימה עודכנה."), `closure_exists`, `invalid_time_step`.
- `src/components/realtime/LiveRefresh.tsx` — רכיב לקוח: `supabase.channel(...).on("postgres_changes", { table }, () => router.refresh())` עם השהיה קצרה (debounce) וניקוי בעת יציאה.

### 2.2 Server Actions (כל אחת: `requireRole` → Zod → RPC → `revalidatePath` → הודעה בעברית)
- `src/app/(app)/admin/settings/hours/actions.ts` — `saveOperatingHours`.
- `src/app/(app)/admin/settings/closures/actions.ts` — `addHolidayClosure`, `addCustomClosure`, `cancelClosure`.
- `src/app/(app)/availability/actions.ts` (משותף מורה/מנהל; ההרשאה נבדקת ב־RPC לפי המשתמש המחובר, ה־`teacherId` לא מקנה הרשאה) — `addAvailability`, `requestRemoval`, `requestAbsence`, `cancelRequest`, `adminRemoveAvailability`, `adminAddAbsence`.
- `src/app/(app)/admin/requests/actions.ts` — `decideRequest` (מחזיר הודעה מיוחדת ל־`request_already_handled`).

### 2.3 קריאת נתונים
Server Components עם לקוח המשתמש (RLS), בלי Secret Key. הצעות חגים מחושבות בשרת לשנה הקרובה (מהיום ועד 12 חודשים קדימה) ומסומנות אם כבר נבחרו.

## 3. מסכים (UI)

עברית RTL, CSS Modules + Tokens (ADR-1), Responsive לפי ADR-4, טבלאות ⇒ כרטיסים מתחת ל־768px, Radix Dialog לטפסים, שימוש חוזר ברכיבים קיימים (`Table`, `Badge`, `SelectField`, `ChoiceGroup`, `Dialog`, `ConfirmAction`, `Tabs`, `PageHeader`, `Toolbar`, `Alert`).

### 3.1 רכיבים חדשים
- `src/components/availability/WeeklyAvailability.tsx` — כמו ב־wireframe „זמינות מורה": שורה לכל יום (ראשון–שבת) עם שעות הפעילות של היום כתווית קטנה; רשימת הטווחים (שעה–שעה) עם Badge סטטוס; „+ הוספת טווח שעות" (Dialog עם בחירת התחלה/סיום בקפיצות 15 דק׳, מוגבל לשעות הפעילות); תפריט לכל טווח: „הסרה קבועה…" / „הסרה לתאריך אחד…". יום סגור: „בית הספר סגור ביום זה". משמש מורה ומנהל (`mode="teacher" | "admin"` משנה ניסוח: „שליחת בקשה" לעומת „הסרה").
- `src/components/availability/RemovalDialog.tsx`, `AbsenceDialog.tsx` — טפסים עם תאריכים, שעות וסיבה; במצב מורה מוסבר „הבקשה תיכנס לתוקף רק אחרי אישור מנהל".
- `src/components/availability/RequestsList.tsx` — טבלה: תאריך שליחה, סוג, פרטים (יום/שעות/תאריכים), סטטוס, הערת מנהל, פעולות. משמש את המורה (עם „ביטול בקשה") ואת התור.
- `src/components/availability/AbsencesList.tsx` — היעדרויות מאושרות קרובות.

### 3.2 מסכים
| Route | מי | תוכן |
|---|---|---|
| `/admin/settings/hours` | מנהל | טאב „שעות פעילות": 7 שורות (ראשון–שבת), לכל יום מתג „פתוח" + שעת פתיחה/סגירה. כולם סגורים בהתחלה, עם הסבר „עדיין לא הוגדרו שעות פעילות". שמירה אחת. אם טווחי זמינות יצאו מחוץ לשעות — Alert אזהרה עם המספר. |
| `/admin/settings/closures` | מנהל | טאב „ימי סגירה": (1) **„חגים בשנה הקרובה"** — רשימה עם שם, תאריך עברי־לועזי, תווית „יום שבתון" למי שזה נכון, וכפתור „הגדרה כיום סגירה" / „יום סגירה ✓". (2) **„ימי סגירה"** — טבלה של ימי הסגירה הפעילים (שם, תאריכים, מקור) עם „ביטול" (ConfirmAction), ו„+ יום סגירה מיוחד" (שם, מתאריך, עד תאריך). מסנן „הצגת ימי סגירה שבוטלו". |
| `/admin/teachers/[id]` | מנהל | Tabs (URL): „פרטים" (קיים) · **„זמינות"** — `WeeklyAvailability mode="admin"`, „+ היעדרות", רשימת היעדרויות קרובות, ובקשות של המורה (עם אישור/דחייה מכאן). |
| `/admin/requests` | מנהל | כותרת „בקשות אישור". Tabs: **„ממתינות"** (ברירת מחדל, עם מספר) · „טופלו". מסנן סוג (הכול / הסרה קבועה / הסרה חד־פעמית / היעדרות) וחיפוש לפי שם מורה. טבלה: תאריך, מורה, סוג, פרטים, סטטוס, פעולות („אישור" / „דחייה" — Dialog עם הערה אופציונלית ושורת „אין שיעורים מושפעים"). `LiveRefresh` על `availability_requests`. |
| `/teacher/availability` | מורה פעיל | כותרת „הזמינות שלי". `WeeklyAvailability mode="teacher"`, „+ דיווח היעדרות", „הבקשות שלי" (`RequestsList` עם ביטול ממתינות), היעדרויות מאושרות קרובות, וימי סגירה קרובים (קריאה בלבד). `LiveRefresh` על בקשות, זמינות, היעדרויות, שעות פעילות וסגירות. |
| מורה לא פעיל | — | `/teacher/availability` מפנה ל־`/teacher`. |

### 3.3 ניווט (`src/lib/nav/items.ts`)
- מנהל: בית · תלמידים · מורים · **בקשות** · משתמשים · הגדרות. אייקון `requests` ⇒ `ClipboardCheck` (lucide).
- מורה פעיל: בית · התלמידים שלי · **הזמינות שלי** (אייקון `availability` ⇒ `CalendarClock`).
- `SettingsTabs`: תחומי לימוד · **שעות פעילות** · **ימי סגירה**.

## 4. בדיקות

### 4.1 נתוני בדיקה
שימוש במורי הבדיקה הקיימים. שעות פעילות, זמינות, בקשות וימי סגירה נוצרים בבדיקות עצמן ומנוקים ב־`afterAll` (Development בלבד). בדיקות ששעות הפעילות משפיעות עליהן שומרות את המצב הקודם ומחזירות אותו.

### 4.2 Unit (`tests/unit/availability.test.ts`)
- `israeliHolidays`: תאריכים ידועים — יום כיפור 2026 (21.9.2026), ראש השנה תשפ״ז (12–13.9.2026), פסח א׳ 2027 (22.4.2027), יום העצמאות 2027 (12.5.2027, בלי הזזה), יום העצמאות 2025 (ה׳ באייר בשבת ⇒ הוקדם ל־1.5.2025), תשעה באב 2025 (ט׳ באב בשבת ⇒ נדחה ל־3.8.2025), פורים בשנה מעוברת (באדר ב׳), חנוכה 8 ימים.
- `effectiveSlots`: טווח עם `valid_to`, היעדרות יום שלם, היעדרות שעות.
- סכמות Zod: פתיחה≥סגירה נכשל, שעות בלי קפיצה של 15 נכשל, היעדרות עם שעות על כמה ימים נכשלת, תאריך עבר נכשל.
- תוויות, מפתחות שגיאה חדשים, `navItemsForRole` עם הפריטים החדשים.

### 4.3 RLS ו־RPC (`tests/rls/availability.test.ts`, מול Development)
- **שעות פעילות:** מנהל מגדיר שעות שונות לכל יום; מורה ⇒ `not_allowed`; עדכון ישיר לטבלה ⇒ נחסם.
- **זמינות:** מורה מוסיף בתוך השעות ⇒ פעיל מיד; מחוץ לשעות / ביום סגור ⇒ `outside_operating_hours`; חפיפה ⇒ `availability_overlap`; צמוד ⇒ מותר; למורה אחר ⇒ `not_allowed`; מורה לא פעיל ⇒ `not_allowed`; מורה רואה רק את שלו.
- **הסרה והיעדרות:** בקשת הסרה קבועה ⇒ הטווח **עדיין פעיל** עד אישור; בקשה כפולה ⇒ `removal_pending`; היעדרות ממתינה ⇒ אין שורה ב־`teacher_absences`; אישור ⇒ `valid_to` / היעדרות נוצרים; דחייה ⇒ אין שינוי.
- **טיפול כפול:** שני מנהלים (Admin + Super Admin) מאשר/דוחה **במקביל** (`Promise.all`) עם אותה גרסה ⇒ בדיוק אחד מצליח, השני `request_already_handled`; גרסה ישנה ⇒ נדחה.
- **מנהל ישיר:** `admin_remove_availability` ⇒ חל מיד ונרשמת בקשה `approved` עם המנהל כמבקש ומאשר.
- **מורה:** לא יכול `decide_availability_request`; לא יכול לבטל בקשה של מורה אחר; `apply_availability_request` לא נגישה.
- **ימי סגירה:** מנהל יוצר חג ומיוחד; חג כפול ⇒ `closure_exists`; ביטול ⇒ `cancelled` ואפשר לבחור שוב; מורה רואה ואינו יכול לכתוב.
- **אנונימי:** אין גישה לאף טבלה חדשה.

### 4.4 E2E (`tests/e2e/availability.spec.ts`, Desktop + Mobile)
1. מנהל מגדיר שעות פעילות שונות לראשון ולשלישי ושומר ⇒ מוצגות אחרי רענון.
2. מורה מוסיף זמינות בתוך השעות ⇒ מופיעה מיד; בחירת שעות מחוץ לטווח אינה אפשרית / נחסמת עם הודעה.
3. מורה מבקש הסרה קבועה ⇒ הטווח מסומן „ממתין להסרה" ועדיין מוצג.
4. **זמן אמת:** שני דפדפנים — מנהל א׳ ומנהל ב׳ פתוחים על `/admin/requests`; הבקשה מופיעה אצל שניהם **בלי רענון**. מנהל א׳ מאשר ⇒ אצל מנהל ב׳ היא עוברת ל„טופלו" בלי רענון; אצל המורה הטווח נעלם/מסומן „מסתיים ב…" בלי רענון.
5. **טיפול כפול:** מנהל ב׳ לוחץ „דחייה" על דף ישן (לפני הרענון) ⇒ הודעה „הבקשה כבר טופלה בידי מנהל אחר".
6. מורה מדווח היעדרות יום אחד עם שעות ⇒ ממתינה; מנהל דוחה עם הערה ⇒ המורה רואה „נדחתה" + ההערה.
7. מנהל בוחר חג מהרשימה ומוסיף יום סגירה מיוחד ⇒ מוצגים בטבלה ואצל המורה; ביטול ⇒ נעלם מהרשימה הפעילה.
8. מסכים ב־375px ללא גלילה אופקית; Dialogs נגישים במקלדת.

### 4.5 בסיום
`npm run lint && npm run typecheck && npm test && npm run test:rls && npm run test:e2e` — הכול עובר. בדיקה ידנית בדפדפן (Desktop/Tablet/Mobile).

## 5. ADR שיתווסף ל־ARCHITECTURE.md
- **ADR-11: חישוב חגים ישראליים בקוד** — `Intl` עם לוח עברי, בלי ספרייה ברישיון GPL; כללי הזזה מכוסים בבדיקות.
- **ADR-12: זמינות כשעה מקומית ובקשה כיומן החלטות** — `time` + `valid_from/valid_to` לזמינות; `availability_requests` מתעדת גם פעולות ישירות של מנהל (כבקשה מאושרת), עד ל־Audit של M7.

## 6. סדר ביצוע
1. Migration ⇒ `db:push` ל־Development ⇒ `db:types` ⇒ Advisors ⇒ בדיקת Realtime Publication.
2. בדיקות RLS/RPC (לפני UI), כולל אישור מקביל.
3. חגים, ימים/שעות, זמינות אפקטיבית, ולידציות, תוויות ושגיאות + Unit.
4. ניווט ו־`SettingsTabs`.
5. מנהל: שעות פעילות.
6. מורה: „הזמינות שלי" — הוספה, בקשות הסרה, היעדרות, ביטול בקשה.
7. מנהל: תור „בקשות אישור" + `LiveRefresh`; טאב „זמינות" בפרטי מורה (כולל פעולות ישירות).
8. מנהל: ימי סגירה וחגים.
9. ADR-11, ADR-12; E2E (כולל שני דפדפנים), Responsive ונגישות.
