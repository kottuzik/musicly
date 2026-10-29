# ARCHITECTURE — מערכת לניהול בית ספר למוזיקה

**סטטוס:** תכנון טכני ל־MVP  
**עודכן:** 29.10.2026  
**מסמך מקור:** `PRD.md`  
**שפת המוצר:** עברית, RTL  
**פיתוח:** Claude Code · **ניהול קוד:** GitHub · **Hosting:** Vercel · **Database:** Supabase PostgreSQL

> מסמך זה מתרגם את דרישות ה־PRD לארכיטקטורה מוצעת. ההחלטות הטכנולוגיות כאן הן החלטות מימוש, ולא תוספת של יכולות מוצר. יש להעדיף את דרישות ה־PRD במקרה של אי־התאמה. המחקר והמחירים נבדקו מול תיעוד רשמי נכון למועד המסמך; תעריפים ומגבלות שירותים עשויים להשתנות.

## 1. Technology Stack שנבחר

| תחום | טכנולוגיה | תפקיד |
|---|---|---|
| סביבת פיתוח | **Claude Code** | כתיבת קוד, בדיקות, SQL Migrations ותחזוקה; אינו שירות Hosting |
| שפת פיתוח | **TypeScript** | טיפוסים משותפים בין Frontend, Backend ו־API |
| Web Framework | **Next.js (App Router) + React** | אפליקציה רספונסיבית, מסכים מוגנים, Server Components ו־Route Handlers |
| עיצוב | **Tailwind CSS** + CSS רגיל לפי הצורך | עיצוב RTL, רספונסיביות, עקביות ונגישות; ללא מערכת עיצוב מורכבת |
| רכיבי ממשק | **Radix UI primitives** ברכיבים הזקוקים לכך | Dialog, Select, Dropdown וכדומה עם בסיס נגיש; עיצוב מותאם למוצר |
| טפסים ואימות קלט | **React Hook Form + Zod** | ולידציה עקבית; Zod גם בגבולות Backend |
| לוח שנה | **FullCalendar React** (רכיבי Core/DayGrid/TimeGrid/Interaction) | תצוגות יום/שבוע/חודש, RTL, אינטראקציות שיבוץ; אין צורך בתוספים בתשלום |
| Backend | **Next.js Route Handlers / Server Actions** | שכבת API ולוגיקה עסקית; ללא שרת Node נפרד |
| Database | **Supabase PostgreSQL** | מקור אמת רלציוני: משתמשים, תלמידים, מורים, זמינות, שיעורים, בקשות, Audit |
| Authentication | **Supabase Auth** | אימייל/סיסמה, קישורי הזמנה, איפוס סיסמה וניהול Session |
| הרשאות | **PostgreSQL RLS + בדיקות הרשאה ב־Backend** | הגבלת גישה לפי תפקיד, שיוך תלמידים ומצב חשבון |
| עדכון בזמן אמת | **Supabase Realtime** | רענון רשימות, לוחות, בקשות והתראות ללא רענון דף |
| תזמון | **Supabase Cron (`pg_cron`)** | משימות חוזרות כגון תזכורות, תפוגה, מחיקות והפעלת תלמידים |
| משלוח אימייל | **Resend API + Resend SMTP ל־Supabase Auth** | התראות ותזכורות; מיילים של הזמנה/איפוס דרך Auth SMTP |
| AI Assistant | **OpenAI API**, קריאות Server-side בלבד | שאילתות חיפוש והצעת חלופות למנהלים, ללא הרשאות כתיבה |
| ייצוא | **CSV בשרת/בדפדפן**, Excel תואם CSV; **SheetJS/xlsx רק אם נדרש XLSX אמיתי** | ייצוא נתונים לפי הרשאות, ללא שירות צד שלישי |
| אחסון קבצים | **לא נדרש ב־MVP** | ה־PRD אינו מחייב העלאת מסמכים או תמונות; אין צורך ב־Supabase Storage כרגע |
| Hosting / CI/CD | **Vercel + GitHub** | Preview ל־Pull Requests ופריסה אוטומטית לענף Production |
| בדיקות | **Vitest + React Testing Library + Playwright** | בדיקות לוגיקה, UI ותהליכי הרשאות ושיבוץ |
| Database migrations | **Supabase CLI + קובצי SQL ב־GitHub** | ניהול גרסאות סכימה והחלה מבוקרת ב־Development וב־Production |

### 1.1 נימוקי בחירה והחלופות שנבדקו

- **Next.js** נבחר מול React + Vite עם Backend נפרד ו־Remix/React Router Framework: אפליקציה אחת ל־Frontend ול־Backend, תיעוד נרחב, התאמה ישירה ל־Vercel ולפיתוח ב־Claude Code. אין צורך ב־Express/NestJS או ב־microservices. האפליקציה אינה זקוקה ל־SSR לשם SEO, אך ה־Server Components ו־Route Handlers שימושיים להגנה על נתונים ולפעולות מאובטחות.
- **Supabase PostgreSQL** נבחר בהתאם לאילוץ המאושר, והוא מתאים יותר מ־Firestore/NoSQL למודל היחסים ולבדיקות התנגשויות. Supabase מספק גם Auth ו־Realtime, ולכן אין צורך בשירותים נפרדים לאלה.
- **Supabase Auth** נבחר מול Auth.js ושירותי זהויות חיצוניים: הוא משתלב ב־Postgres/RLS ותומך באימייל וסיסמה ובהזמנות. ספק SMTP חיצוני נחוץ למסירת אימייל אמינה ב־Production.
- **Supabase Cron** נבחר מול Vercel Cron ושירות תורים עצמאי: משימות תזכורת דורשות רזולוציה טובה יותר מפעם ביום; ב־Vercel Hobby תדירות Cron מוגבלת לפעם ביום. אין צורך ב־Redis/BullMQ עבור בית ספר קטן. [מקור](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- **Resend** נבחר מול SendGrid ו־AWS SES בזכות API ו־SMTP פשוטים, תיעוד מתאים ל־Next.js ותוכנית כניסה קטנה. שירות המייל המובנה של Supabase Auth אינו מתאים ל־Production. [מקור](https://supabase.com/docs/guides/auth/auth-smtp)
- **FullCalendar** נבחר מול בניית לוח מאפס ו־React Big Calendar: תמיכה מוכחת בתצוגות יום/שבוע/חודש, RTL ואינטראקציות. לוגיקת סדרות והרשאות **לא** תישען על ספריית התצוגה.
- **OpenAI API** נבחר מול מודלים דרך ספקי AI אחרים בשל תיעוד רחב וממשק API מוכר; המודל המדויק יוגדר ב־Environment Variable וייבחר מבין מודלים זמינים התומכים ב־Structured Outputs. לא נדרש Vector Database, Embeddings או Agent אוטונומי: השאילתות מבוססות נתונים מובנים.
- **אין Supabase Storage, שירות חיפוש, Redis, Message Broker או ORM חובה**. קריאות הנתונים יתבצעו באמצעות Supabase JS והפעולות האטומיות באמצעות PostgreSQL Functions. הימנעות מ־ORM נוסף מצמצמת שכבת תיאום מול RLS ו־Migrations.

### 1.2 עלויות ומגבלות חשובות

- **Supabase Free:** נכון למועד הבדיקה, עד **שני פרויקטים פעילים בחינם** (מתאים בדיוק ל־Development ו־Production), כ־500MB Database לכל פרויקט; פרויקט Free בעל פעילות מועטה עשוי להיות מושהה לאחר כשבוע. השהיה אינה מוחקת את הנתונים, אך האתר לא יעבוד כרגיל עד שחזור הפרויקט. אין להסתמך על Free לפרויקט עסקי פעיל ללא תוכנית התאוששות. תוכנית Pro מתחילה ב־**$25 לחודש** לארגון, אך פרויקט נוסף עשוי לחייב עלות Compute נפרדת; יש לבדוק חשבון בפועל לפני שדרוג. [תמחור](https://supabase.com/pricing) · [פרויקטים](https://supabase.com/docs/guides/platform/billing-on-supabase) · [השהיה](https://supabase.com/kb/faqs/platform/free-project-pausing)
- **Vercel Hobby:** מיועדת לשימוש אישי ולא מסחרי. אם בית הספר משתמש במערכת להפעלה עסקית אמיתית, יש לבחור תוכנית מתאימה כגון **Pro** (מחיר בסיס שפורסם: **$20 לחודש**, לפני תוספות ומסים). אין להניח שמותר להפעיל בית ספר מסחרי ב־Hobby. [תנאים](https://vercel.com/legal/terms) · [תמחור](https://vercel.com/pricing)
- **Resend Free:** בעת הבדיקה פורסמו **3,000 הודעות בחודש ועד 100 ביום**; הזמנות, איפוס סיסמה ותזכורות חולקים מכסה רלוונטית בהתאם לחשבון. יש להגדיר דומיין שולח מאומת ולנטר שימוש. [תמחור](https://resend.com/pricing)
- **AI:** עלות לפי שימוש במודל הנבחר. יש להגדיר תקרת הוצאה, מגבלת בקשות ו־Timeout; אם השירות אינו זמין, ניהול בית הספר ימשיך לפעול ללא AI.
- **גיבויים:** תוכנית Free אינה מספקת אותן אפשרויות גיבוי ושחזור של Pro. עבור נתוני תלמידים אמיתיים נדרשת מדיניות גיבוי חיצונית/תוכנית בתשלום בהתאם לרמת הסיכון; אין להניח ש־GitHub או Migrations מגבים נתונים. [Checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
- אין צורך ברכישת שירות אחסון קבצים ב־MVP. מחירי ספקים, מכסות API ותנאי שימוש ייבדקו מחדש לפני מעבר ל־Production.

## 2. מבנה המערכת והאחריות של כל שכבה

```text
דפדפן (Hebrew / RTL)
  ├── React UI + FullCalendar + Forms
  ├── Supabase Auth session
  └── Supabase Realtime (אירועי שינוי מורשים)
             │ HTTPS
             ▼
Vercel — Next.js App Router
  ├── Server Components: קריאת נתונים למסכים
  ├── Route Handlers / Server Actions: פעולות עסקיות מאובטחות
  ├── Authorization + Validation (Zod)
  ├── AI read-only endpoint ───────► OpenAI API
  └── Email dispatcher ────────────► Resend API
             │
             ▼
Supabase Development / Production (פרויקטים נפרדים)
  ├── Auth
  ├── PostgreSQL + RLS + SQL Functions + Audit
  ├── Realtime
  └── Cron: תזכורות, תפוגה, מחיקה, הפעלה, הרחבת סדרות
```

### 2.1 עקרונות מימוש

1. **Monolith מודולרי:** Repository יחיד ופריסת Next.js אחת; חלוקה ל־Modules לפי תחום עסקי ולא לפי microservices.
2. **PostgreSQL הוא מקור האמת:** כל שינוי בשיעור, סטטוס, הרשאה או בקשה נכתב למסד הנתונים. מצב UI אינו מחליף בדיקת Backend.
3. **הפרדה בין קריאה לפעולות רגישות:** מסכים יכולים לקרוא דרך Supabase Client מוגבל RLS או Server Components; פעולות שמשנות כמה ישויות יבוצעו דרך Backend ו־Database transaction / RPC מוגבלת.
4. **אין שימוש ב־Secret Key בדפדפן.** כל גישה מורחבת לנתונים תיעשה רק בשרת, לאחר בדיקת זהות והרשאות.
5. **Realtime מיועד לסנכרון UI, לא להבטחת עקביות:** אחרי הודעת שינוי יש לרענן את הנתונים המורשים; החלטה עסקית תיבדק מחדש בתוך Transaction.
6. **שעה מקומית:** ממשק בית הספר פועל לפי `Asia/Jerusalem`. מועדים מוחלטים נשמרים כ־`timestamptz` ב־UTC; הגדרות שבועיות נשמרות כיום בשבוע + שעה מקומית + אזור זמן. שינויי שעון קיץ נפתרים בעת יצירת מופעים.

### 2.2 Modules לוגיים

| Module | אחריות |
|---|---|
| Identity & Access | התחברות, הזמנה, איפוס, Super Admin, Admin, Teacher, הרשאות מיוחדות, סטטוס משתמש |
| School Settings | שעות פעילות לפי יום, תחומי לימוד, משכי ברירת מחדל, חגים וימי סגירה |
| Teachers & Availability | פרטי מורה, תחומי הוראה, זמינות שבועית, היעדרויות ובקשות להסרת זמינות |
| Students & Subjects | פרטי תלמיד, שיוך לתחומים, מורה קבוע, מידע מקצועי לכל תחום, חזרה מפעילות לא פעילה |
| Scheduling | שיעור בודד, סדרות שבועיות, שיבוץ, שינוי חלקי, החלפת מורה, ביטול ושחזור |
| Attendance & Audit | דיווח נוכחות, תיקונים, היסטוריית סטטוסים ופעולות |
| Requests & Notifications | תור משותף, בקשות חריגה, התראות, ארכיון, העדפות ותזכורות |
| Dashboard & Export | נתוני סיכום, חיפוש, סינון וייצוא מורשה |
| AI Assistant | חיפוש מובנה בשפה טבעית והצעת אפשרויות בלבד |
| Background Jobs | עיבוד משימות מתוזמנות, Email Outbox, מחיקות ותפוגות |

## 3. Data Model

### 3.1 ישויות וקשרים מרכזיים

שמות הישויות להלן הם שמות לוגיים מומלצים, לא התחייבות לשמות קבצים או Classes. בכל טבלה יהיו `id`, תאריכי יצירה/עדכון ומפתחות זרים לפי הצורך.

| ישות / טבלה | נתונים וקשרים חיוניים |
|---|---|
| `auth.users` | חשבונות Supabase Auth; זהות משתמש מקורית |
| `profiles` | `auth_user_id`, שם, פרטי קשר, `role` (`super_admin`/`admin`/`teacher`), `status`; קישור למורה לפי הצורך |
| `admin_permissions` | הרשאות מיוחדות לכל Admin, כולל `delete_student_history`; Super Admin יכול לשנותן |
| `teachers` | פרטי מורה, `profile_id`, סטטוס, `deleted_at`, `purge_after` |
| `lesson_types` | תחום לימוד, משך ברירת מחדל בדקות, צבע, סטטוס |
| `teacher_skills` | Many-to-Many בין מורים לתחומי לימוד |
| `students` | פרטים אישיים ופרטי קשר, סטטוס, תאריך חזרה, אופן חזרה (`notify`/`auto`), `deleted_at`, `purge_after` |
| `student_subjects` | קשר תלמיד–תחום, `regular_teacher_id`, רמה, רקע מקצועי; Unique לתלמיד+תחום |
| `operating_hours` | יום בשבוע, `open_time`, `close_time`, enabled; טווחים לפי יום |
| `teacher_availability` | מורה, יום בשבוע, טווח שעה מקומית, תוקף; זמינות פעילה |
| `availability_requests` | בקשה להסרת זמינות קבועה או חד־פעמית, פרטי שינוי, סטטוס, גרסה ומאשר |
| `teacher_absences` | טווחי היעדרות מאושרים לפי תאריך/שעה |
| `school_closures` | תאריך, סיבת סגירה, מקור הצעה/הזנה, סטטוס |
| `lesson_series` | תלמיד, תחום, מורה קבוע, יום/שעה שבועיים, משך, תאריך התחלה וסיום אופציונלי, מצב סדרה |
| `lessons` | מפגש קונקרטי: `series_id` אופציונלי, תלמיד, תחום, מורה בפועל, התחלה/סיום UTC, סטטוס, `requires_attention`, `version`, מקור חריגה |
| `lesson_change_requests` | בקשות מורה לשינוי/ביטול, הצעות חלופה, סטטוס וגרסה |
| `exception_booking_requests` | שיבוץ מחוץ לזמינות, מורה, תלמיד, מועד, סטטוס (`pending`/`approved`/`rejected`/`expired`/`cannot_schedule`/`cancelled`) |
| `attendance` | שיעור, סטטוס נוכחות, הערה אופציונלית, משתמש מדווח |
| `audit_events` | מי פעל, מתי, ישות, פעולה, ערך קודם/חדש לפי הרשאה, מזהה פעולה |
| `notifications` | משתמש יעד, סוג, הפניה לישות, תאריך קריאה, תאריך העברה לארכיון |
| `notification_preferences` | משתמש, ערוץ פנימי או פנימי+אימייל |
| `reminder_preferences` | מורה, enabled, רשימת מרווחי תזכורת; דריסה ברמת שיעור בטבלה נלווית |
| `reminder_jobs` | שיעור, מורה, מועד שליחה, ערוץ, סטטוס, מפתח Idempotency |
| `email_outbox` | סוג הודעה, נמען, Payload מינימלי, מועד שליחה, ניסיונות וסטטוס |
| `history_snapshots` | מידע היסטורי מינימלי לשיעור לאחר מחיקת פרופיל תלמיד/מורה, ללא פרטי קשר |

### 3.2 כללים מחייבים במודל

- **מורה קבוע אחד לכל תלמיד ותחום:** `student_subjects` מחזיק `regular_teacher_id`; מורה מחליף נרשם ב־`lessons.teacher_id` עבור מפגש יחיד. שינוי קבוע בסדרה מתאריך מסוים מחייב גרסה/פיצול הגדרה עתידית, בלי לשנות שיעורי עבר.
- **שיעורים קבועים:** `lesson_series` היא תבנית שבועית; `lessons` הם מופעים אמיתיים, כולל חריגות, ביטולים, סגירות ונוכחות. לא משנים שיעורי עבר כשמשנים את התבנית.
- **סדרה ללא תאריך סיום:** אין ליצור אינסוף שורות. המערכת מייצרת מופעים בחלון מתגלגל של **12 חודשים קדימה**, ומאריכה את החלון בעבודה מתוזמנת; הממשק יכול לחשב תצוגת סדרה מעבר לחלון, אך שיבוץ מאושר מחייב יצירת מופע ובדיקת התנגשות ב־Database. יש להבטיח שלא נוצר מופע כפול באמצעות Unique Key `(series_id, occurrence_date)` או מזהה מופע יציב, גם לאחר שינויים.
- **סגירת סדרה וחידושה:** ביטול מפגשים עתידיים משאיר אותם עם סטטוס `cancelled` והיסטוריה; חידוש אותה סדרה יוצר/משחזר מופעים החל מתאריך נבחר, רק כאשר הבדיקות עוברות. מפגשים בעייתיים מסומנים לטיפול.
- **סטטוסים נפרדים:** `lesson.status` מבדיל `scheduled`, `cancelled`, `closed_day`; `requires_attention` הוא דגל נפרד, לא סטטוס שמבטל שיעור. `attendance.status` נשמר בנפרד מסטטוס שיעור. בקשות ממתינות אינן שיעורים מאושרים.
- **מועדים של שיעור:** טווח `[start_at, end_at)` מאפשר שיעורים צמודים ללא חפיפה. חובה לבדוק חפיפה עבור **מורה וגם תלמיד**. ב־PostgreSQL מומלץ להשתמש ב־`tstzrange` ו־GiST Exclusion Constraints (עם `btree_gist`) לשיעורים בסטטוס משובץ; כל שינוי מרובה מופעים מבוצע ב־Transaction. אילוצי Database מגנים גם מפני שתי בקשות מקבילות.
- **זמינות ואישור חריגה:** גם אם אין התנגשות, שיבוץ מחוץ לזמינות דורש אישור מורה. בקשה ממתינה אינה חוסמת טווח. אישור נבדק שוב ב־Transaction; אם המועד נתפס, הבקשה נסגרת `cannot_schedule`.
- **פעולה על בקשה:** `status` + `version` משמשים ל־Optimistic Concurrency. עדכון מותר רק אם הסטטוס והגרסה עדיין צפויים; אחרת מחזירים שגיאת התנגשות ומרעננים UI.
- **היסטוריית נוכחות:** `audit_events` שומר ערך קודם/חדש ומבצע; ביטול בדיעבד אינו מוחק Audit. נתוני Dashboard אינם סופרים שיעור שבוטל כ„התקיים”.
- **מחיקת תלמיד:** `deleted_at` ו־`purge_after` מאפשרים שחזור במשך 30 יום. לאחר מכן פרטים מזהים ונתונים מקצועיים נמחקים; `history_snapshots` שומר רק שם, תאריך/שעה, תחום, שם מורה וסטטוס נוכחות. השם הוא עדיין מידע אישי.
- **מחיקת מורה:** אותו Soft Delete ל־30 יום; שמו נשמר בהיסטוריה, ללא פרטי קשר. גישה של מורה לא פעיל מוגבלת ל־Read Only על ההיסטוריה שלו.
- **מחיקת היסטוריה לפי אדם:** כדי לא למחוק בטעות מידע של תלמיד אחר או מורה אחר, מחיקת היסטוריה **מסירה לצמיתות את המידע והקישור ההיסטורי של האדם שנבחר**, כולל רשומות המוקדשות לו; כאשר רשומת שיעור משותפת לאחרים, נשמר רק החלק הנדרש לתיעוד האחרים ללא זהות האדם שנמחק. לא מוחקים אוטומטית את כל השיעור של משתתף אחר. הפעולה האטומית תוודא שלא נשארים פרטי האדם ב־Snapshot, באינדקס חיפוש, בייצוא או ב־Payload של התראה. מדיניות שמירת Audit חייבת להימנע משכפול פרטים שנמחקו.
- **הרשאות מחיקת היסטוריה:** תלמיד — Super Admin או Admin עם `delete_student_history`; מורה — כל Admin/Super Admin. בשני המקרים נדרש אישור מפורש בממשק; בשרת נדרשת בדיקת הרשאה מחודשת.
- **ללא קבצים:** אין להוסיף עמודות URL למסמכים או Bucket ללא דרישת מוצר.

### 3.3 שמירת נתונים ואינדקסים

- Foreign Keys לשיוכים, Unique Constraints לתחומים ולמופעים, Check Constraints למשך שיעור חיובי ולשעות תקינות.
- אינדקסים לפי `teacher_id/start_at`, `student_id/start_at`, `series_id`, `status`, `deleted_at/purge_after`, `notifications.user_id/read_at`, `reminder_jobs.due_at/status`.
- חיפוש לפי שם באמצעות PostgreSQL ו־indexes מתאימים; אין צורך במנוע חיפוש נפרד.
- טבלאות Audit והיסטוריה אינן חשופות לכתיבה ישירה מהלקוח. מחיקות היסטוריה דורשות Transaction מתועדת בלי לשמור מחדש את הפרטים שנמחקו.
- אין נתוני Production בסביבת Development. לצורך בדיקות משתמשים בנתוני דמה בלבד.

## 4. APIs ו־Data Flow

### 4.1 גבולות API

ה־Frontend אינו רשאי לבצע פעולות ניהול רגישות באמצעות עדכון ישיר של טבלאות. שכבת Backend מרכזת הרשאות, Validation, Transaction ו־Audit. דוגמאות לממשקים לוגיים (לא חוזה URL מחייב):

| תחום API | פעולות |
|---|---|
| Identity | הזמנת מורה, יצירת מנהל בידי Super Admin, איפוס סיסמה, שינוי סטטוס, הרשאות |
| Students / Teachers | CRUD מורשה, Soft Delete, שחזור, שינוי סטטוס, מחיקת היסטוריה |
| Scheduling | יצירה חד־פעמית/סדרה, Preview לשינוי מרובה, שמירה חלקית, הפסקה/חידוש, ביטול/שחזור |
| Availability | הוספת זמינות, בקשת הסרה, אישור/דחייה, היעדרות ומועדים מושפעים |
| Requests | תור משותף, אישור/דחייה מותנים בגרסה, בקשות חריגה |
| Attendance | דיווח/תיקון, היסטוריית שינויים |
| Notifications | קריאה, סימון כנקרא, ארכיון, העדפות, דריסת תזכורת |
| Dashboard / Export | שאילתות מסוכמות, סינון וייצוא CSV/Excel לפי הרשאה |
| AI | שאלות מנהל על מידע מורשה והצעות ללא כתיבה |

- קריאות משתמש נבדקות לפי Session תקף ו־role מה־Database; לא מסתמכים על `role` שנשלח ב־Request Body.
- נתונים משתנים נבדקים ב־Zod ב־Backend, כולל תאריכים, משך, מזהים וסטטוסים.
- לשינויים מרובי רשומות יש לבצע **פעולה אטומית אחת** ב־PostgreSQL RPC / Transaction, ולא סדרת HTTP Requests נפרדים שעלולה להיעצר באמצע.
- עבור קריאות המשמשות את UI ניתן להשתמש ב־Server Components או ב־Supabase JS עם RLS, לפי צורך; אין לחשוף נתונים נוספים באמצעות Server Actions.
- אין להפעיל `service_role` על בקשות משתמש רגילות; הוא שמור למשימות מערכת ולאדמיניסטרציה מבוקרת בלבד.

### 4.2 תרחישים עיקריים

**שיבוץ שיעור:** מנהל שולח פרטי תלמיד/תחום/מורה/מועד → Backend מאמת הרשאות ומורה מתאים → SQL בודק שעות פעילות, זמינות, חפיפות תלמיד/מורה וסגירות → אם מחוץ לזמינות, נרשמת בקשת אישור בלי לשריין שעה → אחרת נכתב שיעור ב־Transaction → נוצר Audit ו־Notification → Realtime מרענן לוחות.

**אישור בקשת חריגה:** מורה מאשר → Backend בודק שהבקשה `pending` ושהמועד טרם חלף → בודק מחדש התנגשויות → אם פנוי נוצר שיעור מאושר והבקשה נסגרת; אם תפוס, נסגרת `cannot_schedule` ונשלחת התראה למנהל. שתי הפעולות אטומיות.

**הסרת זמינות:** מורה יוצר בקשה → Admin מאשר → המערכת מציגה מפגשים מושפעים והחלטות לכל מפגש → Transaction מעדכן זמינות ומפגשים רק בהתאם להחלטות, מתעד Audit ומודיע למורה. בקשה ללא שיעורים מושפעים עדיין דורשת אישור.

**שינוי סדרה:** Backend מחשב מפגשים עתידיים בחלון הרלוונטי ומציג Preview → מנהל בוחר מפגשים → Transaction משנה רק מפגשים שאינם מתנגשים, משאיר בעייתיים לטיפול ומעדכן את הגדרת הסדרה לעתיד ללא שינוי שיעורי עבר. פעולות חוזרות לא ייצרו כפילויות.

**ביטול ושחזור:** ביטול משחרר שעה אך שומר רשומה; שחזור בודק זמינות והתנגשויות, מאפשר מועד חלופי ומתעד היסטוריה. אם מורה משחזר מחוץ לשעות פעילות, נדרשים אישור אזהרה והתראה למנהלים; אם מנהל משחזר מחוץ לזמינות מורה, נדרש אישור המורה.

**התראות:** שינוי עסקי נרשם ב־DB יחד עם רשומות Notification/Email Outbox; Realtime מודיע למשתמשים מורשים; עובד מתוזמן שולח אימייל לפי העדפה. סימון נקרא וארכיון משנים את רשומת ההתראה, בלי למחוק אותה.

## 5. Authentication, Authorization, אבטחה ופרטיות

### 5.1 Authentication והזמנות

- Supabase Auth באמצעות אימייל וסיסמה; איפוס דרך קישור חד־פעמי באימייל; Session מאובטח עם Cookies ב־Next.js בהתאם לתיעוד Supabase SSR. החבילה `@supabase/ssr` דורשת בדיקת תאימות לגרסה בפועל מאחר שהתיעוד מציין שהיא עדיין Beta. [מקור](https://supabase.com/docs/guides/auth/server-side)
- אין הרשמה ציבורית חופשית. Super Admin יוצר/מזמין Admin; מנהל מורשה יוצר/מזמין Teacher. הרשמה מקישור למורה מקבעת `teacher` בצד השרת ואינה מקבלת Role מהלקוח.
- מנגנון הזמנה חד־פעמי, מוגבל בזמן ומקושר לאימייל שהוזמן. יצירת פרופיל/שיוך תפקיד מתבצעת ב־Backend; יש למנוע חשבון פעיל ללא שיוך תפקיד מורשה.
- לפחות Super Admin אחד בכל עת; העברת תפקיד והסרת Super Admin מתבצעות ב־Transaction עם בדיקת מניעת „מנהל ראשי אחרון”.
- חשבון מורה לא פעיל יכול להתחבר אך יקבל הרשאת צפייה בהיסטוריית שיעוריו בלבד. משתמש Soft Deleted לא יכול לבצע פעולות או להתחבר לאזור המערכת; שחזור מנהל מחזיר את ההרשאות בהתאם לסטטוס שנבחר.

### 5.2 Authorization ו־RLS

- RLS פעיל לכל טבלת נתונים נגישה ב־Supabase API, עם `GRANT` מינימלי. `anon` לא יקבל גישה לנתוני בית הספר; `authenticated` יקבל רק את הפעולות הדרושות. [מקור](https://supabase.com/docs/guides/database/postgres/row-level-security)
- Admin/Super Admin רואים נתוני ניהול לפי הרשאות. רק Super Admin משנה תפקידי מנהלים והרשאותיהם. מחיקת היסטוריית תלמידים מותנית בהרשאה מפורשת.
- Teacher רואה רק שיעורים שלו ותלמידים המשויכים אליו; עריכת מידע מקצועי מותרת רק ב־`student_subjects` של תלמידים ותחומים שהוא מלמד. אין גישת כתיבה לפרטי קשר של תלמידים.
- מורה לא פעיל: מדיניות Read Only להיסטוריה האישית בלבד, לא ללוח עתידי, פרטי תלמידים או שינוי נוכחות.
- משתמש לא יכול לשנות `role`, `permissions`, `teacher_id` או `status` של עצמו דרך API רגיל. שדות רגישים נכתבים רק ב־Backend מורשה.
- RLS לבדו אינו מחליף בדיקת הרשאות ב־Route Handlers; במיוחד כאשר נעשה שימוש בפעולה עם הרשאות מורחבות. שימוש ב־`SECURITY DEFINER` רק בפונקציות מצומצמות עם `search_path` קשיח והרשאות `EXECUTE` מוגבלות.
- Realtime מוגדר לערוצים פרטיים/אירועי Postgres Changes בהתאם ל־RLS, ללא Broadcast פומבי של פרטי תלמידים. לאחר שינוי הרשאות יש לרענן Session/Subscriptions; אין להסתמך על JWT ישן לתקופה בלתי מוגבלת. [מקור](https://supabase.com/docs/guides/realtime/authorization)

### 5.3 הגנת מידע

- HTTPS בלבד; סודות ב־Environment Variables / Secret Manager, לא ב־GitHub ולא בקוד דפדפן.
- הפרדה בין Publishable Key (מותר בלקוח עם RLS) לבין Secret Key (שרת בלבד, עוקף RLS). [מקור](https://supabase.com/docs/guides/getting-started/api-keys)
- Rate Limiting לקריאות AI, הזמנות ופעולות רגישות; בדיקת Origin/CSRF בממשקים שמשתמשים ב־Cookies; הגנת XSS באמצעות React escaping ובלי HTML לא מהימן.
- לוגים אינם מכילים סיסמאות, Tokens, פרטי קשר מלאים או טקסטים חופשיים של תלמידים. Audit מתעד שינוי נדרש בלי לשכפל מידע אישי שנועד להימחק.
- מניעת אינדוקס: `robots.txt` ו־`noindex`, אך כל הנתונים מאחורי Authentication/RLS; אין לראות ב־`robots.txt` מנגנון אבטחה.
- פעולות מחיקה בלתי הפיכות מציגות אזהרה, דורשות אישור מפורש ונבדקות שוב בשרת.
- נתוני תלמידים, לרבות שמות בהיסטוריה, הם מידע אישי. יש לצמצם גישה, לקבוע גיבויים ותהליך מחיקה שמכבד את ההרשאות וה־PRD; בדיקה משפטית/פרטיות נפרדת נדרשת לפני שימוש אמיתי בנתוני קטינים.

## 6. משימות רקע, תזכורות ואימייל

### 6.1 Supabase Cron

`pg_cron` מריץ פעולות SQL/Database Functions במחזורים קבועים. ניתן להשתמש בו גם להפעלת Endpoint מאובטח אם יש צורך בשליחת אימייל חיצונית; אין להריץ שרת Background קבוע ב־Vercel. [תיעוד](https://supabase.com/docs/guides/cron)

| עבודה מתוזמנת | התנהגות |
|---|---|
| `dispatch_due_reminders` | איתור תזכורות שהגיע זמנן, לפי בחירות 24h/12h/2h/1h/Custom, ושליחתן ללא כפילות |
| `dispatch_email_outbox` | שליחת אימיילים דרך Backend מאובטח + Resend; Retry מוגבל וכשל גלוי בלוג |
| `expire_exception_requests` | סגירת בקשות ממתינות שמועד השיעור המבוקש עבר ל־„פג תוקף” |
| `activate_or_notify_students` | בתאריך חזרה: התראה למנהל או הפעלה אוטומטית, לפי הבחירה המחייבת בעת ההגדרה |
| `purge_soft_deleted_records` | מחיקה סופית של פרופילי תלמידים ומורים לאחר 30 יום, תוך שימור Snapshot מינימלי |
| `extend_recurring_lessons` | יצירת מופעים עתידיים בחלון מתגלגל ללא כפילויות, תוך סימון התנגשויות לטיפול |

- משימות תזכורת ואימייל חייבות להיות **Idempotent**: מזהה ייחודי למורה+שיעור+מועד תזכורת+ערוץ, נעילת עבודה/Claim אטומי, סטטוס `pending/sending/sent/failed` ומספר ניסיונות.
- יש להבחין בין „נשלח לספק” לבין „נמסר לנמען”; אין הבטחה למסירה או לזמן מדויק ברמת שנייה. משימה שמאחרת לא תשלח תזכורת שכבר אינה רלוונטית.
- כאשר שיעור מבוטל, נדחה, מוחלף מורה או משתנות העדפות, יש לבטל/לחשב מחדש Reminder Jobs שלא נשלחו.
- Cron SQL שמשנה נתונים יכול לרוץ בתוך Supabase; שליחת אימייל דורשת קריאה מאובטחת ל־Next.js Backend או פונקציית שרת ייעודית. אם משתמשים ב־`pg_net`, יש להביא בחשבון שהרכיב מתועד כ־Beta; אפשר לבחור בהפעלת Endpoint מאובטח דרך Supabase Cron. אין לשמור API Key גלוי בטבלת Cron או ב־SQL Migration. [מקור](https://supabase.com/docs/guides/database/extensions/pg_net)
- אין תזכורות אוטומטיות לתלמידים או להורים.

### 6.2 אימייל ואמינות

- **Supabase Auth SMTP:** Resend SMTP מוגדר **בנפרד בכל פרויקט** לצורך הזמנות, אימות כתובת ואיפוס סיסמה. שירות SMTP ברירת המחדל של Supabase מוגבל, אינו מיועד ל־Production ועלול לשלוח רק לכתובות מורשות. [מקור](https://supabase.com/docs/guides/auth/auth-smtp)
- **התראות עסקיות:** Next.js Backend שולח דרך Resend API לפי `notification_preferences`. ההתראה בתוך המערכת נרשמת גם כאשר המשתמש בחר לקבל בנוסף אימייל.
- יש להגדיר Sender Domain מאומת, SPF/DKIM בהתאם לספק, כתובת שולח תקינה, מעקב שגיאות ותקרת שימוש.
- תבניות אימייל בעברית, RTL, עם פרטי שיעור מינימליים וללא חשיפת נתוני תלמידים מעבר לנדרש.

## 7. AI Assistant — Read Only

- זמין ל־Admin/Super Admin בלבד. ה־Backend מאמת הרשאה לפני כל שאלה.
- המודל **אינו מקבל גישה ישירה ל־Database או ל־Secret Key**. הוא מקבל תוצאות של פעולות קריאה מוגדרות מראש, כגון `find_available_teachers`, `find_lessons`, `suggest_alternative_slots`, שה־Backend מפעיל לאחר בדיקת הרשאות.
- שימוש ב־Structured Outputs / Schema Validation כדי לפרש כוונת משתמש ולהחזיר תוצאה מובנית; תוצאות נבדקות מול נתוני אמת לפני הצגה. אין לבצע SQL חופשי שנוצר על ידי המודל.
- כל הצעה מוצגת למנהל; ביצוע שיבוץ, ביטול, שינוי או מחיקה אפשרי **רק דרך UI רגיל ובאישור מפורש**, עם בדיקות הרשאה והתנגשויות. אין AI write tools.
- מגבלת בקשות, Timeout, טיפול בכשל והגבלת תקציב. המערכת תמשיך לעבוד גם כאשר שירות AI אינו זמין.
- יש לצמצם מידע אישי שנשלח למודל; לא לשלוח פרטי קשר של קטינים אם אינם נחוצים לשאלה.

## 8. Development, Production, GitHub ו־Deployment

### 8.1 הפרדת סביבות מחייבת

**שני פרויקטים עצמאיים בענן Supabase:** `music-school-dev` ו־`music-school-prod` (שמות מוצעים). אין Docker ואין צורך ב־Supabase Local. כל הבדיקות מתבצעות מול Development בענן.

| הגדרה | Development | Production |
|---|---|---|
| Supabase Project | פרויקט Development בלבד | פרויקט Production בלבד |
| Database | נתוני דמה ובדיקות | נתוני משתמשים אמיתיים |
| Local `.env.local` | `NEXT_PUBLIC_SUPABASE_URL` ו־Publishable Key של Development בלבד; סודות Development נחוצים בלבד | **אסור לשמור פרטי Production מקומיים** |
| Vercel Preview | משתני Development בלבד; URL Preview מוגבל בגישה בהתאם לצורך | לא מתחבר ל־Production |
| Vercel Production | לא משמש לפעילות אמיתית | URL ו־Publishable Key של Production; סודות Production נשמרים **רק ב־Vercel Production Environment** |
| SMTP / Resend | דומיין/מפתח Development והגבלות שליחה לנמעני בדיקה | דומיין/מפתח Production; נמענים אמיתיים |
| AI | מפתח/תקציב Development | מפתח/תקציב Production |
| Cron | פעיל לפי צורכי בדיקות; לא שולח לאנשים אמיתיים | משימות Production בלבד |

- `NEXT_PUBLIC_*` חשוף ללקוח ולכן מותר בו רק URL ו־Publishable Key. `SUPABASE_SECRET_KEY`, `RESEND_API_KEY`, `OPENAI_API_KEY` וסודות Cron יהיו Server-only.
- **חריג תפעולי מוגבל:** כדי לבצע Migration ל־Production, נדרשת הרשאה מאובטחת ל־Database Production. היא תישמר **רק ב־GitHub Actions Secrets/Environment מוגן**, ולא במחשב המשתמש או בקובצי `.env`. בכך נשמר העיקרון שפרטי הרצה של Production קיימים ב־Vercel בלבד, לצד אישורי Deployment/Migration מוגנים ב־CI. אין להעביר את אישורי ה־Production ל־Claude Code או להרצה מקומית.
- כתובות Redirect של Supabase Auth, תבניות אימייל, SMTP, הגדרות אבטחה ו־Secrets יוגדרו בנפרד לכל פרויקט.

### 8.2 GitHub ופריסה אוטומטית

- Git Repository פרטי אחד ב־GitHub, הכולל קוד Next.js, קובצי `supabase/migrations/*.sql`, בדיקות ומסמכי אפיון. אין לשמור בו סיסמאות, Tokens, `.env.local` או נתוני Production.
- Branch עבודה/PR → בדיקות אוטומטיות (`lint`, `typecheck`, `test`, `build`) → **Vercel Preview Deployment** המחובר ל־Supabase Development.
- Branch `main` הוא ענף Production. מיזוג ל־`main` יוצר Vercel Production Deployment אוטומטי; **אולם עבור שינויי Database תלויי גרסה, אין למזג לפני שה־Migration ל־Production הושלם בהצלחה**. [Vercel Git](https://vercel.com/docs/git)
- כדי לאפשר זאת בלי פריסה ידנית: Workflow נפרד ב־GitHub Actions, המופעל ידנית רק לאחר **אישור המשתמש**, מפעיל Migrations של הגרסה המאושרת ב־Production. רק לאחר הצלחתו מאשרים Merge של קוד האפליקציה ל־`main`. Branch Protection מונע Merge מוקדם.
- שינוי סכימה צריך להיות **Backward Compatible** עם גרסת האפליקציה שעדיין רצה (Expand → Deploy → Contract). שינוי שובר־תאימות מחייב שתי פריסות/שני Migrations מבוקרים, ולא מחיקה מוקדמת של עמודות המשמשות את האתר החי.
- Rollback של Vercel **אינו מחזיר אחורה Database Migration**. Rollback למסד יבוצע רק לפי תוכנית התאוששות וגיבוי; אין להריץ `db reset` על Production.

### 8.3 נוהל Database Migrations — ללא Supabase מקומי

1. Claude Code יוצר קובץ SQL גרסתי בתיקיית `supabase/migrations` ומוסיף בדיקות SQL/הרשאות מתאימות. אין לערוך סכימה ישירות ב־Supabase Dashboard כדרך העבודה הרגילה.
2. CI או פעולה מבוקרת של Claude Code מחיל את ה־Migration על **Development בענן בלבד**, באמצעות Supabase CLI המקושר לפרויקט Development. אין להריץ `supabase start`, `supabase db reset` או Docker במחשב המשתמש.
3. בדיקות תרחישים, RLS, התנגשויות, מחיקות ושחזורים רצות מול Development. המשתמש בודק את האתר ב־Preview או בהרצה מקומית המחוברת ל־Development.
4. לאחר שהמשתמש מאשר את הגרסה, מפעילים **GitHub Actions Workflow מוגן ל־Production Migrations**, באמצעות אישורי Production השמורים ב־GitHub Environment בלבד; ה־Workflow מבצע `supabase db push` על פרויקט Production ומדווח הצלחה/כישלון. זהו הגורם היחיד המורשה להחיל Migrations ב־Production.
5. **רק לאחר שה־Migration עבר בהצלחה**, ממזגים את שינויי האפליקציה ל־`main`; Vercel מפרסמת אוטומטית את הגרסה החדשה. אם ה־Migration נכשל, אין Merge ואין פריסת קוד תלוי־סכימה.
6. יש לשמור `schema_migrations` עקבי בין סביבות ולמנוע שתי הרצות Production במקביל באמצעות GitHub Actions Concurrency Lock.

**חשוב:** תיעוד Supabase מציג לעיתים פיתוח מקומי עם Docker, אך `supabase db push` יכול לעבוד מול פרויקט מרוחק. הארכיטקטורה הזו בוחרת במפורש **Development בענן**; אין להפעיל פקודות שמוחקות נתונים בסביבת Production. [Supabase Migrations](https://supabase.com/docs/guides/deployment/database-migrations)

### 8.4 הגדרות שאינן מועברות אוטומטית ב־Migrations

- Auth: Redirect URLs, Site URL, SMTP, Email Templates, Password/Session Settings, Rate Limits, Providers והגדרות הרשמה.
- API Keys, Secrets, Credentials, Vercel Environment Variables ו־GitHub Actions Secrets.
- Domain/DNS ואימות שולח ב־Resend, מפתחות OpenAI ותקרות שימוש.
- הגדרות Project ברמת Supabase Dashboard: אזור, Compute/Plan, גיבויים, התראות תפעוליות.
- Supabase Storage Buckets ו־Policies — **לא נדרשים כעת**; אם יידרשו בעתיד, יש לנהל בנפרד לפי תמיכת כלי הפריסה בפועל.
- Realtime publication/channel configuration, Cron Secrets והרשאות גישה — יש להבחין בין הגדרות המנוהלות ב־SQL Migrations לבין הגדרות Dashboard; לבדוק בכל סביבה לאחר פריסה.
- נתוני משתמשים אמיתיים, נתוני דמה וחשבונות התחלתיים אינם חלק מ־Schema Migration.

## 9. איכות, בדיקות ותפעול

- **Unit/Integration:** ולידציה, זמינות, טווחי זמן, שינויי שעון קיץ, הרשאות וסטטוסים; בדיקות Database/RLS מול Development בענן או סביבת CI מבודדת לפי היכולת.
- **E2E:** התחברות, הזמנה, איפוס, יצירת שיעור, התנגשויות מקבילות, בקשות מורה, שינוי סדרה חלקי, ביטול/שחזור, Soft Delete, תזכורות והרשאות.
- **Concurrency:** בדיקות שתי פעולות מקבילות לאותו מורה/תלמיד, ושני מנהלים המטפלים באותה בקשה. Constraint במסד חייב למנוע מצב לא תקין גם אם שתי בקשות עברו Validation מוקדם.
- **Realtime:** בדיקת שני משתמשים מחוברים במקביל, עדכון לוח ובקשות ללא רענון ידני, ובדיקת מניעת חשיפת מידע למורה לא מורשה.
- **Accessibility:** ניווט מקלדת, Focus, Dialogs, הודעות שגיאה, RTL עקבי ולוח שנה שמיש גם בנייד.
- **Observability:** Vercel Logs, Supabase Logs ו־Cron History; מעקב שגיאות שליחת אימייל, Cron, Database ו־AI. לא לשלוח מידע אישי רגיש ללוגים.
- **גיבויים ושחזור:** לפני שימוש עסקי אמיתי לקבוע מנגנון גיבוי אוטומטי ותהליך שחזור שנבדק; Migrations ו־Git אינם גיבוי נתונים.
- **Scalability:** עבור בית ספר יחיד וארבעה מורים בתחילת הדרך, Monolith + PostgreSQL מנוהל מספקים בסיס מתאים. ניתן להרחיב משאבים בהמשך בלי להחליף ארכיטקטורה.

## 10. נקודות תשומת לב וגבולות ההחלטה

1. **מחיקת היסטוריה משותפת:** ה־PRD מאפשר מחיקת היסטוריה לפי תלמיד או מורה. מימוש בטוח דורש הסרת שיוך האדם שנמחק בלי להשמיד בטעות מידע של אנשים אחרים. יש לאמת זאת בבדיקות פרטיות ובדיקות עסקיות.
2. **שיעורים חוזרים ללא סוף:** נדרש מנגנון חלון מתגלגל; יש לוודא שהארכת החלון לא יוצרת שיעורים כפולים או מתנגשים, וששינויים עתידיים חלים על מופעים שטרם נוצרו.
3. **שחזור שיעור בעבר:** ה־PRD מתיר שחזור גם למועד שכבר עבר; הדבר מחייב Audit מדויק, ואין לפרש זאת כהרשאה לדרוס היסטוריית נוכחות.
4. **תזכורות מרובות:** זמני שליחה מותאמים אישית עלולים להגדיל שימוש באימייל. יש לבדוק מכסות בפועל ולהבטיח שהעדפות מורה לא גורמות למשלוח כפול.
5. **Supabase Free ו־Vercel Hobby:** מתאימים לניסוי ופיתוח במסגרת תנאיהם, אך אינם בהכרח פתרון מתאים לבית ספר מסחרי פעיל. Production אמיתי מחייב בחינת תוכניות בתשלום, גיבוי ומדיניות פרטיות.
6. **אין תוספות מוצר:** אין פורטל תלמידים, תשלומים, ניהול חדרים, אפליקציה Native, שליחת הודעות להורים או AI אוטונומי.

## 11. מקורות רשמיים מרכזיים

- [Next.js — Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- [Supabase — Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase — Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization)
- [Supabase — Cron](https://supabase.com/docs/guides/cron)
- [Supabase — Server-Side Auth](https://supabase.com/docs/guides/auth/server-side)
- [Supabase — Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase — Pricing](https://supabase.com/pricing)
- [Supabase — Free Project Pausing](https://supabase.com/kb/faqs/platform/free-project-pausing)
- [Supabase — Production Checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Vercel — Git Deployments](https://vercel.com/docs/git)
- [Vercel — Cron Limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Vercel — Terms](https://vercel.com/legal/terms)
- [Vercel — Pricing](https://vercel.com/pricing)
- [Resend — Pricing](https://resend.com/pricing)

---

**סוף מסמך ARCHITECTURE — MVP.**

## החלטות מרכזיות (ADRs)

### ADR-1: CSS רגיל במקום Tailwind
**הקשר:** טבלת ה־Stack ב־§1 מציינת Tailwind CSS + CSS רגיל לפי הצורך. בתחילת Milestone 1 המשתמש ביקש במפורש לעבוד עם CSS רגיל.
**החלטה:** עיצוב באמצעות CSS Modules לכל רכיב, וקובץ `globals.css` עם Design Tokens כ־CSS Custom Properties (צבעים, טיפוגרפיה, רדיוסים, צללים) לפי ה־Style Guide. שימוש ב־CSS Logical Properties לתמיכת RTL. Tailwind אינו מותקן.
**השלכות:** אין תלות ב־Tailwind או ב־PostCSS. רכיבים חדשים משתמשים במשתני ה־Tokens הקיימים ובקובץ `*.module.css` משלהם.

### ADR-2: קובץ סביבה מקומי `.env`
**הקשר:** §8.1 מזכיר `.env.local`; כללי העבודה ב־`CLAUDE.md` מגדירים `.env.example` שמועתק ל־`.env`.
**החלטה:** הקובץ המקומי הוא `.env` (Next.js טוען אותו באותו אופן). הוא מכיל ערכי Development בלבד ואינו נכנס ל־Git.
**השלכות:** אין שינוי בעיקרון: אין פרטי Production במחשב המקומי.

### ADR-3: `profiles.id` זהה ל־`auth.users.id`
**הקשר:** §3.1 מציע עמודת `auth_user_id` בטבלת `profiles`.
**החלטה:** המפתח הראשי של `profiles` הוא מזהה המשתמש ב־Auth עצמו (FK ל־`auth.users`), בלי עמודה נפרדת.
**השלכות:** מדיניות RLS פשוטה יותר (`id = auth.uid()`). פרופיל נוצר רק בקוד שרת מורשה; אין יצירה אוטומטית בהרשמה (הרשמה ציבורית כבויה).

### ADR-4: נקודות שבירה ותפריט ניווט
**הקשר:** DESIGN.md אינו מגדיר Breakpoints או תפריט למובייל.
**החלטה:** Sidebar קבוע מימין מ־1024px ומעלה; מתחת לכך כפתור תפריט בכותרת שפותח את אותו ניווט כמגירה (Radix Dialog). פריטי ניווט מוצגים רק למסכים שכבר נבנו, וכל Milestone מוסיף את שלו ב־`src/lib/nav/items.ts`.
**השלכות:** אין קישורים שבורים למסכים עתידיים; התאמה ל־Tablet/Mobile בלי מסכים נפרדים.

### ADR-5: קישורי איפוס סיסמה עם תבניות המייל המובנות
**הקשר:** בתוכנית Free של Supabase לא ניתן לערוך תבניות מייל בלי SMTP מותאם.
**החלטה:** `/auth/confirm` תומך גם ב־`code` (PKCE, תבנית ברירת המחדל) וגם ב־`token_hash` (תבנית מותאמת בעתיד). בקשת האיפוס נשלחת מהאפליקציה עצמה, ולכן הקישור צריך להיפתח באותו דפדפן. Super Admin ראשון נוצר בסקריפט ללא סיסמה וקובע סיסמה דרך „שכחת סיסמה?”.
**השלכות:** כשיוגדר SMTP של Resend (לפי §6.2) אפשר לעבור לתבנית עם `token_hash`, שעובדת גם בדפדפן אחר.

### ADR-6: קישורי הרשמה מטבלת `invitations` עם שליחה ידנית
**הקשר:** §5.1 מגדיר הזמנה חד־פעמית, מוגבלת בזמן ומקושרת לאימייל. שליחת מייל אוטומטית דורשת SMTP/Resend שעוד לא הוגדרו, וקישורי Auth של Supabase מוגבלים ל־24 שעות. המשתמש בחר בשליחה ידנית של הקישור.
**החלטה:** טבלת `invitations` משלנו: Token אקראי של 256 ביט נוצר בשרת, ורק ה־Hash (SHA-256) שלו נשמר. הקישור תקף 7 ימים, לשימוש אחד, ומוצג למנהל פעם אחת להעתקה או לפתיחת מייל מוכן (`mailto:`). בהרשמה השרת יוצר את חשבון ה־Auth עם ה־Secret Key ומפעיל `accept_invitation` (מותר ל־`service_role` בלבד), שקובע את התפקיד **מתוך רשומת ההזמנה**. Admin יכול להזמין מורים בלבד; רק Super Admin מזמין מנהלים — נאכף בפונקציית ה־Database.
**השלכות:** `SUPABASE_SECRET_KEY` משמש כעת גם בשרת (`src/lib/supabase/admin.ts`, `server-only`) וצריך להיות מוגדר ב־Vercel Preview/Production. כשיוגדר Resend (Milestone 8) אפשר להוסיף שליחה אוטומטית של אותו קישור.

### ADR-7: „הסרת מנהל” היא השבתת חשבון
**הקשר:** ה־PRD מאפשר ל־Super Admin להסיר מנהלים, אך Soft Delete ומחיקה סופית מוגדרים רק לתלמידים ולמורים.
**החלטה:** הסרת מנהל משנה את `profiles.status` ל־`inactive` (מנהל לא פעיל אינו יכול להתחבר), עם אפשרות הפעלה מחדש. חשבון ה־Auth אינו נמחק. העברת תפקיד Super Admin היא פעולה אטומית אחת (היעד ⇐ `super_admin`, המעביר ⇐ `admin`), וה־Trigger מ־Milestone 1 ממשיך למנוע מצב ללא Super Admin פעיל.
**השלכות:** פעולה הפיכה ובטוחה; אם בעתיד יידרש מחיקת חשבון מנהל, תתווסף כפעולה נפרדת.

### ADR-8: `teachers` כמקור לפרטי מורה, מסונכרן ל־`profiles`
**הקשר:** מורה נוצר לפני שנרשם, ולכן אין לו עדיין `profiles`.
**החלטה:** `teachers` מחזיק שם, אימייל, טלפון וסטטוס. כשהמורה רשום, שינוי שם/טלפון/סטטוס מתעדכן גם ב־`profiles` באותה פונקציה אטומית (`save_teacher`, `set_teacher_status`, `update_own_profile`). אימייל של מורה רשום אינו ניתן לשינוי. כל כתיבה ל־`teachers`, `teacher_skills`, `admin_permissions` ו־`invitations` מתבצעת רק דרך פונקציות Database שבודקות הרשאה; תחומי לימוד נכתבים ישירות תחת RLS למנהלים.
**השלכות:** אין פיצול מידע בין הטבלאות; מורה לא פעיל רואה את השורה שלו לפי `profile_id` גם בלי תפקיד פעיל.
