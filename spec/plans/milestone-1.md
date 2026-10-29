# תוכנית — Milestone 1: בסיס מוצר, סביבות, התחברות והרשאות

**מקורות:** `MILESTONES.md` (Milestone 1), `ARCHITECTURE.md` (§1, §2, §3.1, §5, §8), `PRD.md` (§2.1, §3.1–3.2, §3.5, §5.2, §5.4), `DESIGN.md` (§1.1, §1.2, מבנה ניווט, §2), תמונות `wireframes.png`, `mockups.png`, `style-guide.png`, תיקיית `assets/`.

**מצב נוכחי:** אין קוד בפרויקט; אין git repo מקומי. קיימים `CLAUDE.md`, `.gitignore`, `spec/`, `assets/`. במחשב מותקנים Node 24 ו־npm 12; אין Supabase CLI / gh / Vercel CLI מותקנים גלובלית.

---

## 1. היקף

### בתוך ה־Milestone
- פרויקט Next.js (App Router) + React + TypeScript + Tailwind, בעברית RTL, עם Design Tokens מה־Style Guide וגופן Heebo.
- חיבור ל־Supabase **Development** בלבד (Auth + Postgres), דרך `@supabase/ssr` עם Cookies.
- Migration ראשון: טבלת `profiles`, תפקידים `super_admin`/`admin`/`teacher`, סטטוס, פונקציות עזר, RLS ו־GRANTs מינימליים.
- יצירה מבוקרת של Super Admin ראשון ב־Development (סקריפט שרת).
- מסכים: התחברות, „שכחת סיסמה?”, קביעת סיסמה חדשה מהקישור באימייל, יציאה, בית למנהל, בית למורה, מסך „אין הרשאה”, מסך „החשבון אינו פעיל/לא משויך”.
- Layout מוגן: Sidebar ימני ב־Desktop, תפריט נפתח ב־Tablet/Mobile, Header עם שם המשתמש וכפתור יציאה.
- מניעת אינדוקס (`robots.txt`, `noindex`, Header `X-Robots-Tag`).
- בדיקות: Lint, Typecheck, Build, Vitest (לוגיקה), בדיקות RLS מול Development, Playwright (התחברות/יציאה/ניווט לפי תפקיד ב־3 גדלי מסך).
- הדרכה צעד־אחר־צעד למשתמש: שני פרויקטי Supabase, הגדרות Auth, מילוי `.env`, וחיבור GitHub + Vercel (בשלב הדחיפה).

### מחוץ ל־Milestone (לא לבנות עכשיו)
- הוספת מנהלים/מורים, הזמנת מורה והרשמה מקישור, `admin_permissions`, העברת Super Admin → Milestone 2.
- כל נתוני בית הספר (תלמידים, שיעורים, זמינות וכו'), Dashboard עם מדדים אמיתיים, Realtime, Cron, Resend, AI.
- מסך פרופיל/החלפת סיסמה מתוך המערכת, ניהול משתמשים, הגדרות → Milestones הבאים.
- פריטי ניווט למסכים שעוד לא נבנו **לא יוצגו** (כדי לא להציג קישורים שבורים). הניווט ייבנה כרכיב שמקבל רשימת פריטים לפי תפקיד, וכל Milestone יוסיף את הפריטים שלו.
- ניהול חדרים — מחוץ ל־MVP לחלוטין.
- Supabase Storage — לא נדרש; התמונות נטענות מ־`assets/`.

---

## 2. שלבי הדרכה למשתמש (נעשים על ידך, אני מדריך בשפה פשוטה)

הבנייה תעצור בנקודות האלה ותבקש ממך לבצע. **Claude לא יוצר חשבונות, לא מקליד סיסמאות ולא קורא את `.env`.**

1. **חשבון Supabase ושני פרויקטים:** יצירת `music-school-dev` ו־`music-school-prod` (אזור קרוב, למשל Frankfurt/EU). הסבר קצר על תוכנית Free: עד 2 פרויקטים פעילים, ~500MB לכל פרויקט, פרויקט לא פעיל כשבוע עלול להיות מושהה (הנתונים לא נמחקים, אבל צריך להפעיל אותו מחדש בלוח הבקרה).
2. **שמירת פרטים בנפרד:** לכל פרויקט — Project URL, Publishable Key; ל־Development בלבד גם Secret Key. פרטי Production **לא** נכנסים למחשב — הם יישמרו רק ב־Vercel Production בשלב הדחיפה.
3. **הגדרות Auth בפרויקט Development** (בלוח הבקרה של Supabase):
   - כיבוי הרשמה ציבורית (Allow new users to sign up = Off).
   - Site URL = `http://localhost:3000`; Redirect URLs: `http://localhost:3000/**` (וכתובות Vercel Preview יתווספו בהמשך).
   - בדיקה שתבנית מייל איפוס הסיסמה מפנה לכתובת האפליקציה (`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`). את הטקסט המדויק אכין לך להדבקה.
   - הסבר: שירות המייל המובנה של Supabase מוגבל (מעט מיילים בשעה, ורק לכתובות של חברי הצוות בפרויקט) — מספיק לבדיקות שלך עכשיו; SMTP של Resend יוגדר בהמשך לפי ARCHITECTURE.
4. **מילוי `.env`:** אני יוצר `.env.example` ומעתיק אותו פעם אחת ל־`.env`; אתה ממלא את ערכי ה־Development.
5. **חיבור Supabase CLI ל־Development:** אתה מריץ בטרמינל `npx supabase login` (נפתח דפדפן) ו־`npx supabase link --project-ref <dev-ref>` (מקליד את סיסמת מסד הנתונים בעצמך). אחר כך אני מריץ `npx supabase db push` — מול Development בלבד.
6. **Super Admin ראשון:** אתה נותן לי את כתובת האימייל שלך (זו שרשומה בחשבון Supabase), אני מריץ סקריפט שיוצר אותו ב־Development ושולח לך מייל לקביעת סיסמה.
7. **(בשלב הדחיפה, אחרי אישורך)** יצירת repo פרטי ב־GitHub, חיבור Vercel ל־repo, והגדרת משתנים: Preview → Development; Production → Production. ראה סעיף 10.

---

## 3. מבנה הפרויקט וקבצים ליצור

```text
musicly/
├── .env.example                  # variable names only, no values
├── .env                          # copied once from .env.example; user fills (never read by Claude)
├── package.json
├── next.config.ts                # X-Robots-Tag header, image config
├── tsconfig.json
├── eslint.config.mjs
├── postcss.config.mjs
├── vitest.config.ts
├── playwright.config.ts
├── middleware.ts (or proxy.ts per installed Next.js version)  # session refresh + route guard
├── supabase/
│   ├── config.toml               # from `supabase init`
│   └── migrations/
│       └── <timestamp>_identity_and_roles.sql
├── scripts/
│   ├── create-super-admin.ts     # controlled first Super Admin (Development only)
│   └── seed-test-users.ts        # test admin/teacher/inactive-teacher for automated tests
├── src/
│   ├── app/
│   │   ├── layout.tsx            # <html lang="he" dir="rtl">, Heebo, noindex metadata
│   │   ├── globals.css           # Tailwind + design tokens
│   │   ├── robots.ts             # Disallow: /
│   │   ├── page.tsx              # redirects by role → /admin | /teacher | /login
│   │   ├── (auth)/
│   │   │   ├── layout.tsx        # centered card, soft gradient background
│   │   │   ├── login/page.tsx
│   │   │   ├── forgot-password/page.tsx
│   │   │   └── reset-password/page.tsx
│   │   ├── auth/
│   │   │   ├── confirm/route.ts  # verifies email link token_hash → session → next
│   │   │   └── signout/route.ts  # POST: sign out → /login
│   │   ├── (app)/
│   │   │   ├── layout.tsx        # requires session + profile; Sidebar + Header
│   │   │   ├── admin/page.tsx    # admin/super_admin home
│   │   │   └── teacher/page.tsx  # teacher home (active / inactive variant)
│   │   ├── forbidden/page.tsx    # „אין לך הרשאה לצפות בדף זה”
│   │   └── account-unavailable/page.tsx  # no profile / disabled account
│   ├── components/
│   │   ├── ui/                   # Button, Input, Label, Alert, Card (style-guide variants)
│   │   ├── nav/Sidebar.tsx       # role-based items, active state
│   │   ├── nav/MobileNav.tsx     # Radix Dialog drawer for < lg
│   │   └── nav/Header.tsx        # user name, role label, logout
│   ├── lib/
│   │   ├── supabase/server.ts    # createServerClient (cookies)
│   │   ├── supabase/client.ts    # createBrowserClient
│   │   ├── supabase/admin.ts     # secret-key client, server-only, scripts/system use only
│   │   ├── auth/session.ts       # getCurrentProfile(), requireRole()
│   │   ├── auth/roles.ts         # role types, homePathForRole(), canAccessPath()
│   │   ├── nav/items.ts          # nav items per role
│   │   └── validation/auth.ts    # Zod schemas: login, forgot, reset
│   └── types/database.ts         # generated by `supabase gen types` (Development)
└── tests/
    ├── unit/                     # Vitest: roles, path guard, Zod schemas
    ├── rls/                      # Vitest against Development: RLS on profiles
    └── e2e/                      # Playwright: auth flows, role routing, viewports
```

---

## 4. תלויות

התקנה בגרסאות היציבות העדכניות בזמן הבנייה (לבדוק תיעוד עדכני דרך Context7 לפני כתיבת קוד ל־Next.js ול־`@supabase/ssr`, כי ה־API שלהם משתנה בין גרסאות):

- **Runtime:** `next`, `react`, `react-dom`, `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `react-hook-form`, `@hookform/resolvers`, `@radix-ui/react-dialog`, `lucide-react` (אייקוני Outline דקים, תואמים לסגנון ב־Style Guide).
- **Dev:** `typescript`, `tailwindcss` (+ PostCSS plugin לפי הגרסה), `eslint` + `eslint-config-next`, `vitest`, `@testing-library/react`, `jsdom`, `@playwright/test`, `supabase` (CLI כ־devDependency, מורץ ב־`npx`), `tsx` (להרצת הסקריפטים), `dotenv`.
- **לא בשלב זה:** FullCalendar, Resend, OpenAI, Radix Select וכו'.

---

## 5. משתני סביבה (`.env.example`)

```text
# Supabase — DEVELOPMENT project only
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
# Server-only. Used by scripts and tests only, never in browser code.
SUPABASE_SECRET_KEY=
# Base URL of the app, used for email redirect links
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

- הסקריפטים והבדיקות טוענים את `.env` דרך `dotenv` — Claude מריץ אותם, אך לא פותח/מדפיס את הקובץ.
- `src/lib/supabase/admin.ts` מסומן `import "server-only"`.
- בדיקה אוטומטית ב־Vitest שמוודאת שאף קובץ ב־`src/` שאינו server-only לא מייבא את `SUPABASE_SECRET_KEY`.

---

## 6. מסד נתונים — Migration `identity_and_roles`

```sql
-- enums
create type public.user_role   as enum ('super_admin', 'admin', 'teacher');
create type public.user_status as enum ('active', 'inactive');

-- profiles: one row per auth user; created only by trusted server code
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null check (length(trim(full_name)) > 0),
  email       text not null,
  phone       text,
  role        public.user_role   not null,
  status      public.user_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
```

(ב־ARCHITECTURE השדה נקרא `auth_user_id`; כאן ה־`id` עצמו הוא מזהה המשתמש ב־Auth — זה מפשט את ה־RLS. יתועד כ־ADR.)

**פונקציות עזר** (`security definer`, `set search_path = ''`, `stable`, `EXECUTE` ל־`authenticated` בלבד):
- `public.current_user_role() returns public.user_role` — מחזיר את התפקיד של `auth.uid()` רק אם הסטטוס `active`, אחרת null.
- `public.is_admin() returns boolean` — `current_user_role() in ('super_admin','admin')`.

**Trigger:** `updated_at` מתעדכן אוטומטית.

**Trigger הגנה:** `prevent_last_super_admin` — חוסם עדכון/מחיקה שישאירו 0 Super Admins פעילים (הבסיס לכלל „תמיד יישאר Super Admin אחד”; הממשק לניהול מנהלים ייבנה ב־M2).

**RLS על `profiles`:**
- `enable row level security` + `force row level security`.
- `revoke all on public.profiles from anon, authenticated;` ואז `grant select on public.profiles to authenticated;` — **אין** INSERT/UPDATE/DELETE מהלקוח בשלב זה (שינוי תפקיד/סטטוס רק בקוד שרת מורשה).
- Policy `profiles_select_own`: `using (id = auth.uid())`.
- Policy `profiles_select_admin`: `using (public.is_admin())` — מנהל פעיל רואה את כל הפרופילים (נחוץ ל־M2).
- מורה אינו רואה פרופילים של אחרים; `anon` לא רואה דבר.

**לא כלול:** אין Trigger שיוצר פרופיל אוטומטית בהרשמה — הרשמה ציבורית כבויה, ופרופיל נוצר רק מסקריפט/Backend. משתמש Auth ללא פרופיל → נחסם (`/account-unavailable`).

אחרי ה־push: `npx supabase gen types typescript --linked > src/types/database.ts`.

---

## 7. אימות, Session והגנת נתיבים

### 7.1 Middleware / Proxy
- מרענן את ה־Session בכל בקשה (לפי תבנית `@supabase/ssr` העדכנית, עם `getUser()`/`getClaims()` — לא `getSession()` לצורכי הרשאה).
- נתיבים ציבוריים: `/login`, `/forgot-password`, `/reset-password`, `/auth/*`, `/robots.txt`, קבצים סטטיים.
- משתמש לא מחובר שמנסה להגיע לנתיב מוגן → `/login?next=<path>` (רק נתיב פנימי; אין Open Redirect).
- משתמש מחובר שנכנס ל־`/login` → מועבר לבית שלו.

### 7.2 בדיקת הרשאה בצד השרת (לא רק בממשק)
- `getCurrentProfile()` קורא את הפרופיל מה־DB (לפי RLS) — לא סומך על נתונים מהלקוח.
- `requireRole(['super_admin','admin'])` בראש `admin/page.tsx`; `requireRole(['teacher'])` בראש `teacher/page.tsx`. תפקיד לא מתאים → `/forbidden`.
- אין פרופיל / סטטוס `inactive` של מנהל → `/account-unavailable` + אפשרות יציאה.
- מורה `inactive` → מותר להיכנס ל־`/teacher` במצב צפייה בלבד, עם הודעה: „החשבון שלך אינו פעיל. ניתן לצפות בהיסטוריית השיעורים בלבד.” (ההיסטוריה עצמה תתווסף כשיהיו שיעורים).

### 7.3 זרימות
| זרימה | התנהגות |
|---|---|
| התחברות | Server Action: Zod → `signInWithPassword` → הפניה לפי תפקיד. שגיאה כללית אחידה: „האימייל או הסיסמה שגויים” (לא חושפים אם המשתמש קיים). |
| שכחת סיסמה | Server Action: `resetPasswordForEmail(email, { redirectTo: SITE_URL/auth/confirm?next=/reset-password })`. תמיד אותה הודעה: „אם הכתובת רשומה במערכת, נשלח אליה קישור לאיפוס סיסמה.” |
| קישור מהמייל | `/auth/confirm` → `verifyOtp({ type, token_hash })` → Session → `/reset-password`. קישור פג/שגוי → `/forgot-password?error=link` עם הודעה. |
| סיסמה חדשה | טופס סיסמה + אימות סיסמה (מינימום 8 תווים) → `updateUser({ password })` → הודעת הצלחה → בית לפי תפקיד. |
| יציאה | טופס POST ל־`/auth/signout` → `signOut()` → `/login`. |

---

## 8. ממשק ועיצוב

### 8.1 בסיס
- `<html lang="he" dir="rtl">`; Heebo דרך `next/font/google` (Regular/Medium/Semibold/Bold, subset hebrew+latin).
- Design Tokens ב־`globals.css` (Tailwind theme): כל צבעי טבלת DESIGN §2.1 בשמות סמנטיים (`primary`, `primary-light`, `primary-lighter`, `accent`, `secondary`, `secondary-light`, `success`, `warning`, `error`, `text-primary`, `text-secondary`, `border`, `background`, `surface`), וסולם הטיפוגרפיה H1–Small.
- CSS Logical Properties (`ms-`, `me-`, `ps-`, `pe-`, `start`, `end`) בלבד — לא `left`/`right`.
- שדות אימייל: `dir="ltr"` מקומי עם יישור לימין בתצוגה.
- Focus גלוי (טבעת סגולה), תוויות לכל שדה, הודעות שגיאה עם `aria-describedby` ו־`role="alert"`.
- בדיקת קונטרסט: טקסט לבן על `#6B46C1` עובר; צבעי Success/Warning/Error משמשים כרקע בהיר עם טקסט כהה, לא כטקסט על לבן.

### 8.2 רכיבי UI (`components/ui`)
- `Button` — וריאנטים לפי Style Guide: Primary (סגול/לבן), Secondary (לילך בהיר), Outline (לבן עם גבול סגול), Danger (ורוד־אדום בהיר); מצב `loading`/`disabled`.
- `Input`, `Label`, `Alert` (info/success/error עם אייקון), `Card`.

### 8.3 מסך התחברות (DESIGN §1.1, Mockup „התחברות”)
- רקע בהיר עם גרדיאנט סגול־ורוד־תכלת עדין ומוטיבי תווים מופשטים (CSS/SVG פשוט, לא תמונה חדשה).
- כרטיס לבן במרכז: `assets/logo-music.webp` (ייבוא סטטי דרך `next/image` מהנתיב המקורי — הקובץ לא מועתק ולא משנה שם), כותרת „ברוכים הבאים”, תת־כותרת „למערכת ניהול בית הספר למוזיקה”, שדות „אימייל” ו„סיסמה”, כפתור „התחברות”, קישור „שכחת סיסמה?”.
- `assets/hero-image.png` (חדר מוזיקה — תואם „Imagery Style”): **תמונת צד דקורטיבית רק ב־Desktop רחב** (`lg+`), עם `alt=""`. אם תיראה עמוסה מול ה־Mockup — מוותרים עליה. אין שימוש בתמונות האנשים (`*-m`/`*-w`) ב־M1, כי אין נתון שמשייך אותן לאדם.
- מסכי „שכחת סיסמה” ו„סיסמה חדשה” באותה מסגרת כרטיס.

### 8.4 Layout מוגן (DESIGN „מבנה ניווט כללי”, Mockup „דף הבית”)
- **Desktop (`lg` ומעלה):** Sidebar קבוע מימין, רקע בהיר, לוגו + „בית הספר למוזיקה” למעלה, פריטים עם אייקון ותווית; פריט פעיל ברקע `primary-lighter` וטקסט/אייקון סגול.
- **Tablet/Mobile (מתחת ל־`lg`):** Header עליון עם כפתור תפריט (☰, `aria-label="פתיחת תפריט"`) שפותח את אותו Sidebar כמגירה מימין (Radix Dialog — Focus Trap, Esc לסגירה).
- **Header:** שם המשתמש, תווית תפקיד בעברית („מנהל ראשי” / „מנהל” / „מורה”), כפתור „יציאה”.
- **פריטי ניווט ב־M1:** „בית” בלבד (מנהל → `/admin`, מורה → `/teacher`). המבנה ב־`lib/nav/items.ts` מוכן להוספת פריטים לפי תפקיד ב־Milestones הבאים.
- נקודות שבירה: אין מפרט מחייב ב־DESIGN, לכן Tailwind ברירת מחדל (`md`=768, `lg`=1024) — יתועד כ־ADR.

### 8.5 מסכי בית
- **מנהל (`/admin`):** כותרת „סקירה כללית”, ברכה „שלום, <שם>”, ותיבת מידע: „כאן יוצגו נתוני בית הספר — תלמידים, מורים, שיעורים ובקשות — כשיתווספו למערכת.” **בלי** כרטיסי מדדים עם מספרים מומצאים.
- **מורה (`/teacher`):** כותרת „הלוח שלי”, ברכה, ותיבת מידע מקבילה. במורה לא פעיל — Alert אזהרה כמתואר ב־7.2.
- **`/forbidden`** ו־**`/account-unavailable`:** כרטיס פשוט עם הסבר וכפתור „חזרה לדף הבית” / „יציאה”.

### 8.6 מניעת אינדוקס
- `app/robots.ts`: `Disallow: /` לכל הבוטים.
- `metadata.robots = { index: false, follow: false }` ב־Root Layout.
- `next.config.ts`: Header `X-Robots-Tag: noindex, nofollow` לכל הנתיבים.

---

## 9. סקריפטים

### `scripts/create-super-admin.ts`
- הרצה: `npm run create-super-admin -- --email <email> --name "<שם מלא>"`.
- משתמש ב־Secret Key (Development) → `auth.admin.inviteUserByEmail` (או יצירה + שליחת קישור איפוס) → יצירת `profiles` עם `role='super_admin'`.
- **הגנות:** נכשל אם כבר קיים Super Admin (אלא אם `--force-additional`, שלא נשתמש בו); נכשל אם המשתנים חסרים; מדפיס רק הצלחה/כישלון, לא מפתחות או Tokens.

### `scripts/seed-test-users.ts`
- יוצר ב־Development משתמשי בדיקה: `test-admin`, `test-teacher`, `test-teacher-inactive` עם כתובות בדומיין בדיקה (`@example.test`) וסיסמאות אקראיות.
- הפרטים נשמרים ב־`tests/.test-users.json` (**מתווסף ל־`.gitignore`**) לשימוש הבדיקות; לא מוצגים בצ'אט.
- Idempotent: הרצה חוזרת לא יוצרת כפילויות.

---

## 10. GitHub ו־Vercel (בשלב „דחוף שינויים לגיטהאב”, אחרי אישורך)

לפי `CLAUDE.md` אין commit/push לפני שתבקש. לכן החלק הזה של ה־Milestone יתבצע בשלב הדחיפה:
1. `git init` (אם עדיין אין), commit ראשון — ווידוא ש־`.env` ו־`tests/.test-users.json` לא נכללים.
2. אתה יוצר repo **פרטי** ב־GitHub ונותן לי את הכתובת; אני מחבר ודוחף.
3. הדרכה: חיבור Vercel ל־repo (Import Project), הגדרת Environment Variables:
   - **Preview:** URL + Publishable Key של Development, `NEXT_PUBLIC_SITE_URL` של Preview.
   - **Production:** URL + Publishable Key של Production בלבד. בלי Secret Key ל־Production בשלב זה (לא נדרש — אין עדיין פעילות שרת עם הרשאות מורחבות).
   - הסבר על תוכנית Hobby (לא מסחרית) מול Pro.
4. הוספת כתובת ה־Preview ל־Redirect URLs בפרויקט Supabase Development.
5. Production ב־Supabase: רק הפרויקט עצמו ושמירת הפרטים ב־Vercel; **לא מריצים עליו Migrations** ב־M1 (זה ייעשה ב־M11 דרך GitHub Actions מוגן).

---

## 11. בדיקות

| סוג | מה נבדק | איך |
|---|---|---|
| Lint / Typecheck / Build | ללא שגיאות | `npm run lint`, `npm run typecheck`, `npm run build` |
| Unit (Vitest) | `homePathForRole`, `canAccessPath`, סכמות Zod (אימייל לא תקין, סיסמה קצרה, אי־התאמת סיסמאות), בדיקת `next` פנימי בלבד, שאין ייבוא של Secret Key בקוד לקוח | `npm test` |
| RLS (Vitest מול Development) | `anon` לא קורא `profiles`; מורה רואה רק את עצמו; מנהל רואה הכל; אף משתמש מחובר לא יכול לעדכן `role`/`status` או להכניס פרופיל; מנהל לא פעיל לא מקבל `is_admin()`; Trigger מונע הסרת Super Admin אחרון | `npm run test:rls` (מדלג עם הודעה אם `.env` חסר) |
| E2E (Playwright, מול שרת מקומי + Development) | התחברות כמנהל → `/admin`; כמורה → `/teacher`; מורה שמנסה `/admin` → `/forbidden`; לא מחובר שמנסה `/admin` → `/login`; סיסמה שגויה → הודעת שגיאה; יציאה → `/login` וחסימת חזרה; „שכחת סיסמה” מציג הודעה אחידה; מורה לא פעיל רואה אזהרה; `robots.txt` ו־`X-Robots-Tag` | `npm run test:e2e` |
| Responsive | אותם תרחישי ליבה ב־375px (Mobile), 768px (Tablet), 1280px (Desktop); תפריט מגירה עובד במובייל; אין גלילה אופקית | Playwright projects לכל גודל + צילומי מסך לבדיקה ידנית שלי |
| נגישות בסיסית | ניווט מקלדת בטופס ההתחברות ובתפריט, Focus גלוי, תוויות | Playwright + בדיקה ידנית |
| איפוס סיסמה מקצה לקצה | שליחת מייל אמיתי ← לחיצה על הקישור ← סיסמה חדשה ← התחברות | ידני (מייל ל־Super Admin שלך, כי המייל המובנה של Supabase שולח רק לחברי צוות) |

**Scripts ב־`package.json`:** `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:rls`, `test:e2e`, `db:push`, `db:types`, `create-super-admin`, `seed-test-users`.

---

## 12. עדכוני מסמכים בסיום הבנייה

- `CLAUDE.md` → „פקודות הרצה”: `npm run dev`; בדיקות: `npm run lint && npm run typecheck && npm test && npm run test:rls && npm run test:e2e`.
- `MILESTONES.md` → 🟡 ליד כותרת Milestone 1.
- `ARCHITECTURE.md` → סעיף `## החלטות מרכזיות (ADRs)`:
  - **ADR-1:** קובץ סביבה מקומי `.env` (לפי כללי העבודה ב־`CLAUDE.md`) במקום `.env.local` שמופיע ב־ARCHITECTURE; Next.js טוען את שניהם, והעיקרון זהה — Development בלבד, לא ב־Git.
  - **ADR-2:** `profiles.id` = `auth.users.id` (במקום עמודת `auth_user_id` נפרדת), לפשטות ה־RLS.
  - **ADR-3:** נקודות שבירה רספונסיביות — Tailwind ברירת מחדל; Sidebar קבוע מ־1024px, מגירה מתחת לכך.
  - **ADR-4:** ניווט מציג רק מסכים שכבר נבנו; כל Milestone מוסיף את פריטיו.
- `.gitignore` → הוספת `tests/.test-users.json` ו־`next-env.d.ts` לפי הצורך (בלי להסיר דבר).

---

## 13. סדר העבודה בבנייה

1. Scaffold Next.js + TypeScript + Tailwind + ESLint בתיקייה הקיימת (בלי לדרוס `CLAUDE.md`, `.gitignore`, `spec/`, `assets/`).
2. Design Tokens, גופן, RTL, רכיבי UI בסיסיים, מניעת אינדוקס.
3. `.env.example` → `.env`; **עצירה להדרכה** (סעיף 2, שלבים 1–5).
4. `supabase init`, כתיבת ה־Migration, `db push` ל־Development, יצירת Types.
5. Supabase clients, Middleware, `session.ts`/`roles.ts`.
6. מסכי Auth וזרימות (התחברות, שכחת סיסמה, confirm, סיסמה חדשה, יציאה).
7. Layout מוגן, Sidebar/מגירה/Header, מסכי בית, forbidden, account-unavailable.
8. סקריפטים; **עצירה לקבלת האימייל שלך** ליצירת Super Admin; Seed משתמשי בדיקה.
9. בדיקות Unit, RLS, E2E ב־3 גדלים; תיקון כשלים.
10. בדיקת DoD, עדכון מסמכים (סעיף 12), סגירת השרת.

---

## 14. Definition of Done — איך כל סעיף ייבדק

| תנאי (MILESTONES.md) | אימות |
|---|---|
| שני פרויקטי Supabase נוצרו בהדרכה; רק Development מחובר; אין סודות Production מקומיים | אישור שלך ששני הפרויקטים קיימים; `.env.example` מכיל רק משתני Development; הבדיקות רצות מול כתובת ה־Development |
| כל ה־Migrations שמורים ב־Git, הורצו ונבדקו על Development בלבד | קובץ ב־`supabase/migrations`; `supabase migration list --linked` מראה אותו כמוחל; בדיקות RLS עוברות |
| התחברות, יציאה, איפוס סיסמה, ניווט לפי תפקיד, חסימת גישה ו־RLS נבדקו בפועל | Playwright + בדיקות RLS עוברות; איפוס סיסמה נבדק ידנית מקצה לקצה |
| נבנה ללא שגיאות, עברית RTL, Mobile/Tablet/Desktop; נכסי `assets/` נטענים | `build`/`lint`/`typecheck` נקיים; E2E ב־3 גדלים; בדיקה שהלוגו (ותמונת הצד אם נשארה) נטענים ב־HTTP 200 |

**הערה:** חיבור GitHub + Vercel (מופיע ב„מה יש לממש”, לא ב־DoD) יושלם בשלב הדחיפה, לפי `CLAUDE.md`.
