# Milestone 2 — ניהול מנהלים, מורים ותחומי לימוד

**מטרה (מ־MILESTONES.md):** לאפשר הקמה ותחזוקה של צוות ההוראה ומבנה ההרשאות של בית הספר.
**מקורות:** PRD §2.1, §3.1 (מסכים 5, 6, 9), §3.2, §4.1, §4.4, §5.2 · ARCHITECTURE §3.1–3.3, §4.1, §5.1–5.2, §8.3 · DESIGN §1.8, §1.9, §1.16, §1.17, §1.19.

## 0. החלטות שהתקבלו בתכנון

| נושא | החלטה | נימוק |
|---|---|---|
| מסירת קישור הרשמה | **המשתמש בחר:** המערכת יוצרת קישור אישי חד־פעמי, תקף **7 ימים**; המנהל מעתיק אותו (כפתור „העתק קישור”) או לוחץ „פתח במייל” (קישור `mailto:` עם נוסח מוכן בעברית) ושולח בעצמו. אין שליחת מייל אוטומטית בשלב זה. | עובד מיד, בלי חשבון בשירות מיילים. שליחה אוטומטית תתווסף עם Resend (Milestone 8). |
| מנגנון ההזמנה | טבלת `invitations` משלנו (Token אקראי; נשמר רק Hash של SHA-256), ולא `inviteUserByEmail` של Supabase. | לא תלוי ב־SMTP, תוקף 7 ימים (קישורי Auth של Supabase מוגבלים ל־24 שעות), והתפקיד נקבע מרשומת ההזמנה בשרת בלבד. → **ADR-6** |
| „הסרת מנהל” | הסרה = **השבתת החשבון** (`status = inactive`), עם אפשרות הפעלה מחדש. אין מחיקת חשבון Auth. | הפיך ובטוח; Soft Delete/מחיקה מוגדרים ב־PRD רק לתלמיד ולמורה (Milestone 9). → **ADR-7** |
| העברת Super Admin | פעולה אטומית אחת: המנהל הנבחר הופך ל־`super_admin` והמעביר הופך ל־`admin`. אחריה המעביר (כעת Admin) יכול להיות מושבת ע"י ה־Super Admin החדש. | תואם PRD §2.1 („רק לאחר מכן יוכל להסיר את חשבונו או להוריד את דרגתו"). ה־Trigger מ־M1 נשאר רשת ביטחון. |
| הרשאות מנהל („משנה הרשאות") | טבלת `admin_permissions` עם ההרשאה היחידה שמוגדרת ב־spec: `delete_student_history`. ב־M2 רק נשמרת ומוצגת; האכיפה בפועל ב־Milestone 9. | ARCHITECTURE §3.1. אין להמציא הרשאות נוספות. |
| מקור פרטי מורה | `teachers` הוא המקור לפרטי מורה (שם, טלפון, אימייל, סטטוס). כשיש למורה חשבון, השם/טלפון/סטטוס מסונכרנים ל־`profiles` באותה פעולה אטומית. | מורה קיים לפני שנרשם (ממתין להרשמה), ולכן אינו יכול להישען רק על `profiles`. |
| אימייל של מורה | ניתן לעריכה רק לפני שהמורה נרשם. אחרי ההרשמה מוצג לקריאה בלבד. | שינוי אימייל של חשבון Auth דורש תהליך אימות נפרד שאינו ב־spec. |
| סטטוס מורה | ב־M2: החלפת „פעיל”/„לא פעיל” נשמרת ומשפיעה על הגישה (מורה לא פעיל נכנס לצפייה בלבד, כמו ב־M1). ההשפעה על שיעורים (M6) ועל שחזור זמינות (M9) — בהמשך. | PRD §4.4; סינון לפי סטטוס נדרש כבר עכשיו. |
| צבע תחום | בעת יצירה מוקצה אוטומטית הצבע הפחות־בשימוש מתוך פלטה קבועה של 8 גוונים נגישים (נגזרים מה־Style Guide); המנהל יכול להחליף לצבע אחר מהפלטה. | PRD §4.1 („צבע אוטומטי") + MILESTONES („ניהול... צבעים"). |
| משך ברירת מחדל | נשמר כהגדרה בלבד. השאלה „שיבוצים חדשים בלבד / גם קיימים" תתווסף כשיהיו שיעורים (M6). | MILESTONES M2. |
| פריטים מהתמונות שלא נבנים | „שכר לשיעור" ו„הערות" במסך מורה; „שם בית ספר" ו„אזור זמן" בהגדרות; תמונות אנשים כאוואטר. | PRD גובר על פיצ'רים: שכר מורים מחוץ ל־MVP, ואין דרישה לשאר. אזור הזמן קבוע (`Asia/Jerusalem`). אוואטר = האות הראשונה של השם (כמו ב־M1), לפי כלל 7 ב־MILESTONES. |
| טאבים עתידיים | במסך מורה מוצג רק „פרטים כלליים"; „זמינות" (M4) ו„היסטוריית שיעורים" (M5) יתווספו בהמשך. במסך הגדרות — רק „תחומי לימוד"; „שעות פעילות" ו„ימי סגירה" ב־M4. בפרופיל — „פרטים אישיים" ו„שינוי סיסמה"; „העדפות" ב־M8. | אותו עיקרון כמו ADR-4: לא מציגים מסכים שעוד לא קיימים. |
| Realtime | לא נדרש ב־M2 (אין תור משותף או לוח). רשימות מתרעננות אחרי כל פעולה (`revalidatePath`). | ה־DoD של M2 לא דורש זמן אמת. |

## 1. Database — Migration חדש

קובץ: `supabase/migrations/20261029200000_teachers_subjects_admins.sql`

### 1.1 טבלאות

```sql
create table public.lesson_types (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 60),
  default_duration_minutes integer not null check (default_duration_minutes between 5 and 240),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at, updated_at
);
create unique index lesson_types_name_key on public.lesson_types (lower(trim(name)));

create table public.teachers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles (id) on delete set null,
  full_name text not null check (length(trim(full_name)) > 0),
  email text not null,          -- stored lower-case
  phone text,
  status public.user_status not null default 'active',
  created_at, updated_at
);
create unique index teachers_email_key on public.teachers (lower(email));

create table public.teacher_skills (
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  lesson_type_id uuid not null references public.lesson_types (id) on delete restrict,
  primary key (teacher_id, lesson_type_id)
);
create index teacher_skills_lesson_type_idx on public.teacher_skills (lesson_type_id);

create table public.admin_permissions (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  delete_student_history boolean not null default false,
  updated_at
);

create type public.invitation_role as enum ('admin', 'teacher');
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  role public.invitation_role not null,
  teacher_id uuid references public.teachers (id) on delete cascade,  -- required when role = 'teacher'
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  check ((role = 'teacher') = (teacher_id is not null))
);
-- At most one open invitation per email.
create unique index invitations_open_email_key on public.invitations (lower(email))
  where used_at is null and revoked_at is null;
```

- Triggers `set_updated_at` לכל הטבלאות עם `updated_at`.
- `on delete restrict` ב־`teacher_skills.lesson_type_id` הוא שחוסם מחיקת תחום משויך (PRD §4.1). ב־M3 יתווסף אותו FK מ־`student_subjects`.

### 1.2 RLS ו־GRANT

| טבלה | קריאה | כתיבה |
|---|---|---|
| `lesson_types` | כל משתמש פעיל (`current_user_role() is not null`) — המורים צריכים לראות שמות תחומים | Admin/Super Admin פעיל: `insert`, `update`, `delete` דרך RLS |
| `teachers` | Admin: הכול · Teacher (גם לא פעיל): רק השורה שלו (`profile_id = auth.uid()`) | רק דרך RPC (ללא GRANT כתיבה ל־`authenticated`) |
| `teacher_skills` | Admin: הכול · Teacher: רק של עצמו | רק דרך RPC |
| `admin_permissions` | Super Admin: הכול · Admin: השורה שלו | רק דרך RPC של Super Admin |
| `invitations` | אף אחד מהלקוח (RLS פעיל, ללא Policies, `revoke all`) | רק דרך RPC / שרת עם Secret Key |
| `profiles` | ללא שינוי מ־M1 | ללא GRANT כתיבה (כמו M1) — רק דרך RPC |

הערה: מורה לא פעיל צריך לקרוא את השורה שלו ב־`teachers` ⇒ ה־Policy של המורה משתמשת ב־`profile_id = auth.uid()` ולא ב־`current_user_role()` (שמחזיר null למשתמש לא פעיל).

### 1.3 פונקציות (RPC)

כל הפונקציות `security definer`, `set search_path = ''`, `revoke execute from public, anon`, ובודקות הרשאה **בתוך** הפונקציה לפי `current_user_role()`. שגיאות עסקיות נזרקות עם `errcode` קבוע + מפתח הודעה (למשל `P0001` + `'last_super_admin'`), והשרת ממפה אותן להודעות בעברית.

| פונקציה | מי | מה עושה |
|---|---|---|
| `save_teacher(p_id uuid, p_full_name, p_email, p_phone, p_lesson_type_ids uuid[]) returns uuid` | Admin/Super Admin | יוצר (כש־`p_id` null) או מעדכן מורה, ומחליף את רשימת התחומים — בטרנזקציה אחת. דורש לפחות תחום אחד. אוסר שינוי אימייל אם יש `profile_id`. אם למורה יש חשבון — מעדכן גם `profiles.full_name/phone`. אימייל שכבר קיים ב־`profiles` או אצל מורה אחר ⇒ שגיאה `email_taken`. |
| `set_teacher_status(p_teacher_id, p_status)` | Admin/Super Admin | משנה `teachers.status` ו־`profiles.status` (אם מקושר) יחד. |
| `create_invitation(p_role, p_teacher_id, p_full_name, p_email, p_token_hash) returns timestamptz` | Admin → רק `teacher`; Super Admin → `teacher` או `admin` | בודק שאין חשבון קיים לאימייל; מבטל (`revoked_at`) הזמנה פתוחה קודמת לאותו אימייל; יוצר הזמנה חדשה עם `expires_at = now() + 7 days`. עבור `teacher` — שם ואימייל נלקחים מרשומת המורה, ומוודא שעוד לא נרשם. |
| `revoke_invitation(p_invitation_id)` | כמו `create_invitation` לפי תפקיד ההזמנה | מסמן `revoked_at`. |
| `accept_invitation(p_token_hash, p_user_id) returns public.user_role` | **`service_role` בלבד** (GRANT רק לו) | נועל את שורת ההזמנה (`for update`), מוודא שלא נוצלה/בוטלה/פגה, יוצר `profiles` עם התפקיד **מתוך ההזמנה**, מקשר `teachers.profile_id` (למורה) או יוצר `admin_permissions` (למנהל), ומסמן `used_at`. |
| `set_admin_role(p_profile_id, p_status)` | Super Admin | השבתה/הפעלה של מנהל (`admin` בלבד, לא את עצמו). |
| `set_admin_permissions(p_profile_id, p_delete_student_history boolean)` | Super Admin | upsert ל־`admin_permissions` של Admin. |
| `transfer_super_admin(p_target_profile_id)` | Super Admin | היעד חייב להיות Admin פעיל. בטרנזקציה אחת: היעד ⇐ `super_admin`, המבצע ⇐ `admin`. |
| `update_own_profile(p_full_name, p_phone)` | כל משתמש **פעיל** | מעדכן את `profiles` של עצמו (ואת `teachers` אם מקושר). לא נוגע ב־role/status/email. |
| `pick_lesson_type_color() returns text` | Admin/Super Admin | מחזיר את הצבע הפחות־בשימוש מהפלטה. |

- הפלטה (8 צבעים) מוגדרת פעם אחת בקוד: `src/lib/lesson-types/colors.ts`. ב־DB נבדק רק פורמט HEX; הבדיקה ש„הצבע מהפלטה" נעשית ב־Zod בשרת. `pick_lesson_type_color(p_palette text[])` מקבל את הפלטה כפרמטר מהשרת, כדי שלא יהיו שתי רשימות.
- ה־Trigger `prevent_last_super_admin` מ־M1 נשאר ומגן גם על כל ה־RPC.

### 1.4 החלה ובדיקה
1. `npm run db:push` — על פרויקט **Development** בלבד (המקושר).
2. `npm run db:types` — עדכון `src/types/database.ts`.
3. בדיקת Advisors של Supabase (Security) על Development, ותיקון אזהרות אם יש.

## 2. Backend (Next.js)

### 2.1 קבצים חדשים
- `src/lib/supabase/admin.ts` — לקוח Supabase עם `SUPABASE_SECRET_KEY`, עם `import "server-only"`. משמש **רק** ל־(א) יצירת חשבון Auth בהרשמה מהזמנה, (ב) קריאה ל־`accept_invitation`, (ג) קריאת הזמנה לפי Hash להצגת דף ההרשמה. בכל שאר הפעולות — הלקוח של המשתמש (RLS).
- `src/lib/invitations/token.ts` — יצירת Token (`crypto.randomBytes(32)` → base64url), Hash ב־SHA-256, ובניית הקישור `${NEXT_PUBLIC_SITE_URL}/register?token=...`.
- `src/lib/validation/teachers.ts`, `src/lib/validation/lesson-types.ts`, `src/lib/validation/users.ts` — סכמות Zod (שם, אימייל lower-case, טלפון ישראלי גמיש `^[0-9+\-\s]{9,15}$` אופציונלי, משך 5–240 בכפולות של 5, צבע מהפלטה, לפחות תחום אחד).
- `src/lib/errors.ts` — מיפוי מפתחות שגיאה מה־RPC להודעות בעברית (`email_taken`, `last_super_admin`, `lesson_type_in_use`, `invitation_expired`, `not_allowed` וכו').
- `src/lib/auth/roles.ts` — הוספת `/register` ל־`PUBLIC_PREFIXES` ול־`GUEST_ONLY_PREFIXES`; פונקציה `isSuperAdmin`.

### 2.2 Server Actions (כל אחת: `requireRole` → Zod → RPC/RLS → `revalidatePath` → הודעת הצלחה/שגיאה בעברית)
- `src/app/(app)/admin/settings/lesson-types/actions.ts` — `createLessonType`, `updateLessonType`, `deleteLessonType` (שגיאת FK `23503` ⇒ „לא ניתן למחוק תחום שמשויכים אליו מורים").
- `src/app/(app)/admin/teachers/actions.ts` — `saveTeacher`, `setTeacherStatus`, `createTeacherInvitation` (מחזיר את הקישור פעם אחת להצגה), `revokeInvitation`.
- `src/app/(app)/admin/users/actions.ts` — `inviteAdmin`, `setAdminStatus`, `setAdminPermissions`, `transferSuperAdmin` (כולן Super Admin בלבד, נבדק גם בשרת וגם ב־RPC).
- `src/app/(app)/profile/actions.ts` — `updateOwnProfile`, `changePassword` (דורש סיסמה נוכחית: אימות ע"י `signInWithPassword` לפני `updateUser`).
- `src/app/(public)/register/actions.ts` — `register`: מאמת Token (Hash) ⇒ יוצר משתמש Auth עם `email_confirm: true` והסיסמה שנבחרה ⇒ `accept_invitation` ⇒ אם נכשל, מוחק את משתמש ה־Auth שנוצר (כמו בסקריפט M1) ⇒ `signInWithPassword` ⇒ הפניה לבית לפי התפקיד שחזר מה־DB.

### 2.3 אבטחה
- התפקיד בהרשמה נקבע **רק** מרשומת ההזמנה. הטופס אינו מכיל שדה תפקיד, והשרת מתעלם מכל שדה נוסף.
- Admin רגיל לא יכול ליצור הזמנת `admin` (נאכף ב־RPC, לא רק בממשק).
- הודעת שגיאה זהה לקישור לא קיים/פג/נוצל: „הקישור אינו תקף או שפג תוקפו. בקשו קישור חדש מהמנהל."
- הגבלת קצב פשוטה לא נדרשת בשלב זה (Token של 256 ביט אינו ניתן לניחוש); תתווסף עם Rate Limiting כללי ב־M11.
- `.env.example`: עדכון ההערה של `SUPABASE_SECRET_KEY` — כעת משמש גם את השרת (הרשמה מהזמנה), עדיין לעולם לא בדפדפן. **למשתמש:** להוסיף את `SUPABASE_SECRET_KEY` של Development גם ל־Vercel **Preview** (אדריך צעד־צעד בסיום הבנייה).

## 3. מסכים (UI)

כל המסכים: עברית RTL, CSS Modules + Tokens קיימים (ADR-1), Responsive לפי ADR-4, טבלאות שהופכות לכרטיסים מתחת ל־768px, Radix Dialog לטפסים ואישורים.

### 3.1 רכיבים משותפים חדשים (`src/components/ui/`)
`Table` (+ תצוגת כרטיסים במובייל), `Badge` (סטטוס), `SearchInput`, `Select` (native `<select>` מעוצב), `Dialog` / `ConfirmDialog` (Radix), `Tabs` (קישורים מבוססי URL), `ColorPicker` (Radio group של 8 צבעים עם שם נגיש לכל צבע), `CheckboxGroup` (בחירת תחומים), `CopyField` (שדה קריאה + „העתק קישור" + הודעת „הועתק").

### 3.2 מסכים
| Route | מי | תוכן |
|---|---|---|
| `/admin/teachers` | Admin/Super | כותרת „מורים", „+ מורה חדש", חיפוש לפי שם, מסנן תחום, מסנן סטטוס (פעיל / לא פעיל / ממתין להרשמה). טבלה: שם, תחומי הוראה (Badges בצבעי התחום), טלפון, סטטוס, פעולות (צפייה, עריכה). החיפוש והמסננים ב־URL (`?q=&subject=&status=`) ונעשים ב־Server Component. |
| `/admin/teachers/new` ו־Dialog עריכה | Admin/Super | טופס: שם מלא, אימייל, טלפון, תחומי הוראה (לפחות אחד). אחרי יצירה — מעבר לפרטי המורה עם הצעה „צור קישור הרשמה". |
| `/admin/teachers/[id]` | Admin/Super | כותרת עם אוואטר־אות ושם; Tab „פרטים כלליים": טלפון, אימייל, תחומים, סטטוס. כפתורים: „עריכה", „הפוך ללא פעיל"/„הפוך לפעיל" (עם Dialog אישור). אזור „חשבון במערכת": נרשם / ממתין להרשמה (תוקף עד...) / אין קישור — עם „צור קישור הרשמה" / „צור קישור חדש" / „בטל קישור". הקישור מוצג פעם אחת ב־Dialog עם `CopyField` + „פתח במייל" (`mailto:` עם נושא וגוף בעברית). |
| `/admin/users` | Admin/Super | כותרת „משתמשים", חיפוש, מסנן תפקיד. טבלה: שם, אימייל, תפקיד, סטטוס, פעולות. **Super Admin:** „+ מנהל חדש" (שם+אימייל ⇒ קישור הרשמה), השבתה/הפעלה של מנהל, „הרשאות" (Dialog עם מתג „מחיקת היסטוריית תלמידים" + הסבר שייכנס לשימוש בהמשך), „העבר תפקיד מנהל ראשי" (Dialog אזהרה עם בחירת מנהל פעיל). **Admin רגיל:** צפייה בלבד; שורת מורה מקשרת לפרטי המורה. הזמנות מנהלים ממתינות מוצגות בשורה עם סטטוס „ממתין להרשמה". |
| `/admin/settings` → `/admin/settings/lesson-types` | Admin/Super | Tab „תחומי לימוד": רשימת תחומים (נקודת צבע, שם, משך ברירת מחדל בדקות, מספר מורים), „+ תחום חדש", עריכה (שם, משך, צבע), מחיקה עם אישור. הודעה ליד שדה המשך: „שינוי המשך ישפיע על שיעורים חדשים. טיפול בשיעורים קיימים יתווסף בהמשך." |
| `/profile` | כל משתמש מחובר | Tabs: „פרטים אישיים" (שם, טלפון — עריכה; אימייל ותפקיד לקריאה בלבד) ו„שינוי סיסמה" (סיסמה נוכחית, חדשה, אימות). מורה לא פעיל: פרטים לקריאה בלבד, שינוי סיסמה מותר. |
| `/register?token=` | ציבורי (אורח בלבד) | אותו עיצוב כמו מסך ההתחברות: „הצטרפות למערכת", שם ואימייל מההזמנה (לקריאה בלבד), סיסמה + אימות סיסמה, „יצירת חשבון". קישור לא תקף ⇒ הודעת שגיאה + קישור להתחברות. אין בחירת תפקיד. |

### 3.3 ניווט (`src/lib/nav/items.ts`, `NavLinks.tsx`)
- Admin/Super Admin: בית · מורים · משתמשים · הגדרות.
- Teacher: בית.
- כולם: שם המשתמש/האוואטר בכותרת הופך לקישור ל־`/profile`, ובתפריט המובייל נוסף פריט „פרופיל".
- אייקונים (lucide): `GraduationCap` / `Users` / `Settings` / `UserRound`.
- `src/lib/auth/roles.ts`: `/profile` פתוח לכל משתמש מחובר (כבר כך כברירת מחדל); `/admin/*` נשאר מוגבל למנהלים.

## 4. בדיקות

### 4.1 משתמשי בדיקה
`scripts/seed-test-users.ts`: הוספת `superAdmin` (`test-super-admin@example.test`) ו־`admin2`. שורת `teachers` + תחום בדיקה למורה הבדיקה הקיים (כדי שה־RLS של המורה ייבדק). **לא נוגעים בחשבון ה־Super Admin האמיתי** של המשתמש. נתוני בדיקה שנוצרים בבדיקות מקבלים קידומת `e2e-`/`rls-` ונמחקים ב־`afterAll` דרך Secret Key (Development בלבד).

### 4.2 Unit (`tests/unit`)
ולידציות Zod (מורה, תחום, משתמש, הרשמה), יצירת Token/Hash, בניית קישור ו־`mailto`, מיפוי שגיאות, `navItemsForRole`, `canAccessPath` ל־`/register` ו־`/profile`.

### 4.3 RLS ו־RPC (`tests/rls`, מול Development)
- מורה: רואה רק את עצמו ב־`teachers`/`teacher_skills`; לא יכול לכתוב לשום טבלה; לא יכול לקרוא ל־`save_teacher`, `create_invitation`, `set_admin_*`, `transfer_super_admin`, `accept_invitation`.
- Admin: CRUD לתחומים; `save_teacher` עם כמה תחומים; `create_invitation` של `admin` ⇒ נדחה; לא רואה `invitations`; לא יכול לשנות `admin_permissions`.
- Super Admin: הזמנת מנהל; השבתה/הפעלה; הרשאות; העברת תפקיד (בין שני משתמשי בדיקה, והחזרה); ניסיון להוריד את עצמו כשהוא האחרון ⇒ נחסם.
- מחיקת תחום משויך ⇒ נחסם; אימייל כפול ⇒ נחסם.
- `accept_invitation`: Token פג/נוצל/בוטל ⇒ נדחה; הזמנת מורה ⇒ נוצר `teacher` ולא `admin` גם אם מנסים לשלוח תפקיד אחר; שימוש כפול באותו Token במקביל ⇒ רק אחד מצליח.
- `update_own_profile`: לא משנה role/status; מורה לא פעיל ⇒ נחסם.

### 4.4 E2E (`tests/e2e/staff.spec.ts`, Desktop + Mobile)
1. Admin יוצר תחום לימוד ⇒ מופיע עם צבע.
2. Admin יוצר מורה עם שני תחומים ⇒ מופיע ברשימה; חיפוש וסינון לפי תחום מוצאים אותו.
3. Admin יוצר קישור הרשמה ⇒ בהקשר דפדפן חדש: פתיחת הקישור, קביעת סיסמה ⇒ מגיע ל־`/teacher`; אין בטופס שדה תפקיד; גישה ל־`/admin/teachers` ⇒ `/forbidden`.
4. אותו קישור בשנית ⇒ הודעת „הקישור אינו תקף".
5. Admin רגיל ב־`/admin/users`: אין כפתורי ניהול מנהלים.
6. Super Admin: הזמנת מנהל ⇒ הרשמה ⇒ מגיע ל־`/admin`.
7. פרופיל: עדכון שם ⇒ מופיע בכותרת; שינוי סיסמה עם סיסמה נוכחית שגויה ⇒ שגיאה.
8. מסכים ב־375px ללא גלילה אופקית.

### 4.5 בסיום
`npm run lint && npm run typecheck && npm test && npm run test:rls && npm run test:e2e` — הכול עובר. בדיקה ידנית בדפדפן (Desktop/Tablet/Mobile) של כל המסכים החדשים.

## 5. סדר ביצוע
1. Migration ⇒ `db:push` ל־Development ⇒ `db:types` ⇒ Advisors.
2. `seed-test-users` מעודכן ובדיקות RLS/RPC (לפני UI — כדי לוודא שההרשאות נכונות בבסיס).
3. רכיבי UI משותפים + ניווט.
4. תחומי לימוד (מסך + Actions).
5. מורים: רשימה, יצירה/עריכה, פרטים, סטטוס.
6. הזמנות והרשמה (`/register`).
7. ניהול משתמשים (Super Admin).
8. פרופיל.
9. בדיקות Unit/E2E, Responsive ונגישות (Focus, Labels, Dialogs, מקלדת).
10. ADR-6 ו־ADR-7 ב־ARCHITECTURE.md, עדכון `.env.example`, סימון 🟡 ב־MILESTONES.md.

## 6. Definition of Done — איך כל סעיף ייבדק
| סעיף | בדיקה |
|---|---|
| הוספה/עדכון מורים ותחומי הוראה; מורה יכול ללמד כמה תחומים | E2E 1–2, RLS `save_teacher` עם כמה תחומים |
| הזמנת מורה והרשמתו בלי אפשרות להעניק לעצמו הרשאת מנהל | E2E 3–4, RLS `accept_invitation`/`create_invitation` |
| רק Super Admin מנהל מנהלים; לא ניתן להסיר את ה־Super Admin האחרון | E2E 5–6, RLS Super Admin + Trigger |
| כל שינוי Schema ב־Migration על Development; בדיקות RLS והרשאות עוברות | `db:push` ל־Development, `npm run test:rls` |

## 7. מחוץ לתחום של M2 (מתוכנן בהמשך)
זמינות מורה (M4) · השפעת השבתת מורה על שיעורים (M6) · שינוי משך על שיעורים קיימים (M6) · Soft Delete ומחיקת מורה (M9) · אכיפת `delete_student_history` (M9) · שליחת קישור במייל אוטומטית והעדפות התראות (M8) · Audit (M7).
