# תוכנית — Milestone 11: השלמת ממשק, בדיקות מערכת ופריסה ל־Production

> מקורות: `MILESTONES.md` (M11 + כללי ביצוע 4, 5, 6, 7), `PRD.md` §5.4 (דפדפנים, נגישות, RTL), `ARCHITECTURE.md` §8.1–8.4 (סביבות, GitHub, Migrations, הגדרות שאינן ב־Migrations), §9 (בדיקות, גיבוי), §10 (נקודות 5, 6), ADR-16 (Cron + Vault); `DESIGN.md` §1 (19 מסכים), §2.5–2.6.
> עד שלב ה־Production עובדים מול Supabase **Development** בלבד. אין commit/push עד בקשה מפורשת. **הפעולה על Production נעשית רק אחרי אישור מפורש שלך (שלב ג׳ למטה).**

## Context

M1–M10א בנו את כל היכולות. M11 אינו מוסיף פיצ׳רים: הוא סוגר פערים, בודק את המערכת כולה כמקשה אחת, ומעלה אותה לאוויר. שלושה דברים הופכים אותו לאבן שונה מהקודמות:

1. **Production עדיין ריק.** לפרויקט Supabase Production (`culqeemdrhuvzweessra`) לא הורצה אף Migration (34 קבצים ב־`supabase/migrations`). ה־Vercel Production (`musicly-flame.vercel.app`) כבר מפרסם את `main` ומצביע על אותו מסד ריק, ולכן האתר החי כרגע לא באמת עובד — זה צפוי ויתוקן בפריסה.
2. **אין CI בכלל.** אין `.github/`. נדרשים שני Workflows: בדיקות אוטומטיות, ו־Migrations מוגן ל־Production (ARCHITECTURE §8.3).
3. **אי אפשר לעשות הכול לבד.** חשבונות, מפתחות, Resend, דומיין ומסך ההגדרות של Supabase Production הם אצלך (CLAUDE.md). אני מכין, מדריך צעד־צעד, ובודק מה שאפשר לבדוק בלי סודות Production.

## 0. החלטות שהתקבלו בתכנון (ברירות מחדל שלי — אפשר לשנות)

1. **שלושה שלבים עם שתי עצירות:**
   - **א׳ — השלמה ובדיקות ב־Development** (הכול אצלי, בלי Production). עצירה: אני מציג דמו ותוצאות, ואת/ה מאשר/ת שאפשר להתקדם.
   - **ב׳ — הכנת התשתית ל־Production** (Workflows, תיעוד, רשימת הגדרות). אין שינוי ב־Production.
   - **ג׳ — פריסה** — רק אחרי **אישור מפורש שלך** לפרסם. עצירה אחרונה: תוצאות מול ה־Definition of Done, והפיתוח נעצר.
2. **עבודת M11 על ענף נפרד (`release/m11`), לא על `main`.** `main` מפרסם אוטומטית ל־Production; לפי ARCHITECTURE §8.2 מיזוג אליו מותר רק אחרי שה־Migrations הצליחו. אין `gh` במחשב, ולכן את/ה תלחצי „Merge” ב־GitHub בדפדפן, ואני אדריך.
3. **הוספת משתמש־על ראשון ב־Production דרך לוח הבקרה של Supabase, לא דרך סקריפט.** `create-super-admin` דורש מפתח Secret, ואסור שמפתח Production יגיע למחשב. בלוח הבקרה יוצרים משתמש (Authentication ← Add user) ומריצים שורת SQL אחת שאני אכתוב לך. כך אף סוד לא נוסף ל־GitHub.
4. **אין העברת נתונים מ־Development.** Production מתחיל נקי: שעות פעילות ברירת מחדל נקבעות ב־Migration (`default_operating_hours`); תחומי לימוד, ימי סגירה ויתר ההגדרות מוזנים דרך המסכים הרגילים אחרי הפריסה (אבדוק בבנייה מה בדיוק ה־Migrations מזריעים). חשבונות הבדיקה (`seed-test-users`) לעולם לא נוצרים ב־Production — אוסיף לסקריפטים בדיקה שמסרבת לרוץ מול `culqeemdrhuvzweessra`.
5. **בדיקות ב־Production בלי לפגוע באנשים אמיתיים:** יוצרים 2–3 חשבונות בדיקה שכתובות האימייל שלהם **שלך** (למשל `שם+teacher@gmail.com`), רצים את תהליכי הליבה, ובסוף מוחקים אותם דרך המערכת עצמה (מחיקה רכה ← מחיקה סופית) ומוודאים שלא נשארו נתונים. אימיילים נשלחים רק לכתובות אלה.
6. **נקודת תשומת לב מ־ARCHITECTURE §10.5:** Supabase Free ו־Vercel Hobby מתאימים לניסוי; שימוש עסקי אמיתי עם נתוני קטינים מחייב להחליט על תוכנית בתשלום וגיבוי (ראו סעיף 6). זו החלטה שלך, ואני אציג אותה בבירור לפני האישור הסופי.

## 1. שלב א׳ — השלמת ממשק ובדיקות ב־Development

### 1.1 סקירת מסכים מול DESIGN
עוברים על 19 המסכים ב־DESIGN §1 (בלי §1.18 ניהול חדרים — מחוץ ל־MVP, ולא יופיע בניווט) מול `wireframes.png`/`mockups.png`/`style-guide.png`, בכל שלושת הגדלים ולשני התפקידים. הכלי: דפדפן בפועל (screenshots) + רשימת בדיקה למסך: כותרת, ניווט פעיל, מצב ריק, מצב טעינה, מצב שגיאה, RTL. כל פער ייתוקן **אם הוא סטייה מה־spec**; רעיון חדש לא ייכנס (נרשם כ„הצעה להמשך”).
- אימות ניווט לפי תפקיד: מנהל / Super Admin / מורה — כל קישור בתפריט מוביל למסך קיים; אין קישורים שבורים; מורה לא רואה פריטי מנהל ולהפך (`src/components/nav/NavLinks.tsx`, `src/lib/nav`).
- דפים שחסרים בהתאם ל־DESIGN: בודקים במיוחד פרופיל (§1.19: פרטים / העדפות / סיסמה), נוכחות תלמיד (§1.12), הגדרות בית ספר (§1.17). מה שחסר ביחס ל־PRD ייבנה; מה שלא ב־PRD לא.
- דפי שגיאה: 404 כללי ו־`error.tsx` בעברית (אם חסרים — מוסיפים; ללא פרטים טכניים למשתמש).

### 1.2 נכסי `assets/` (כלל ביצוע 7)
- מיפוי: אילו קבצים בשימוש בפועל (כרגע רק `PageBackground`, `Brand`, `AuthHeader`, `(auth)/layout`) ואילו לא (`guitar-*`, `piano-*`, `vocal-*`, `both-*`, `hero-image.png`, `mazlul-bg-*`). **לא מוסיפים תמונות רק כדי להשתמש בהן**, ולא משייכים תמונת אדם לתלמיד/מורה אמיתי.
- בדיקת משקל וטעינה: קבצי רקע/הירו כבדים עוברים דרך `next/image` או גרסה מותאמת; כל תמונה יש לה `alt` מתאים או `alt=""` אם דקורטיבית.
- **שאלה אליך:** האם יש לך רישיון שימוש לכל הקבצים בתיקייה (בעיקר `mazlul-bg-*` ו־`hero-image.png`)? אני לא יכול לאמת רישיון — אציג רשימה ואת/ה מאשרת שאפשר לפרסם אותם.

### 1.3 נגישות (PRD §5.4, ARCHITECTURE §9)
- מעבר מקלדת מלא בכל זרימה מרכזית (כניסה, יצירת שיעור, חלונות אישור, לוח שנה, בקשות). Focus נראה; Focus נלכד בתוך Dialog וחוזר לכפתור שפתח אותו (Radix בדרך כלל מטפל; מאמתים).
- שגיאות טפסים: מקושרות לשדה (`aria-describedby`), מוכרזות (`role="alert"` / `aria-live`), לא רק בצבע.
- קונטרסט לפי DESIGN §2.1 (כולל תגי סטטוס וחלונות התראה); `prefers-reduced-motion` מכובד.
- כלי: `a11y-enforcer` + בדיקת axe אוטומטית בתוך Playwright על המסכים המרכזיים (ללא תלות חדשה כבדה — `@axe-core/playwright` כ־devDependency).

### 1.4 ביצועים
- `npm run build` נקי; בדיקת גודל Bundle של כל מסך (בעיקר לוח השנה — FullCalendar).
- מדידת זמן טעינה של לוח שנה / רשימות / דוחות מול נתוני דמה מורחבים (למשל 4 מורים, 150 תלמידים, שנה של שיעורים חוזרים). אם איטי: בדיקת `EXPLAIN` על פונקציות הרשימה (`list_calendar_lessons`, `attendance_summary`, דוחות) והוספת אינדקס חסר ב־Migration חדש (Development בלבד בשלב זה). אינדקס כזה הוא Migration נוסף — עדיין לא רץ ב־Production.
- Lighthouse על login, בית, לוח שנה (Mobile); יעד: אין בעיית נגישות ברמת „קריטי”, וטעינה סבירה בנייד.

### 1.5 סקירת אבטחה ופרטיות
- הרצת `/security-review` על כל הענף ו־`npm audit` (תלויות עם חולשות גבוהות — מתקנים או מציגים לך).
- `npx supabase db lint --linked` מול Development: אזהרות RLS / `security definer` ללא `search_path`.
- אימות שה־CSP ב־`next.config.ts` עובד עם כתובת Supabase Production (נבנה מ־`NEXT_PUBLIC_SUPABASE_URL` בזמן build — ב־Vercel Production יצביע על Production, וצריך להיבדק בפריסה).
- אין סודות בקוד/ב־Git: חיפוש `sk-`, מפתחות Supabase/Resend, ו־`.env*`; `tests/` ו־`scripts/` לא מכילים כתובות או מפתחות Production.
- אימות מדיניות „לא נשלח מידע אישי ללוגים”: חיפוש `console.log/error` שמדפיסים שמות, אימיילים או גוף בקשות.

### 1.6 בדיקות מערכת (E2E, RLS, מקביליות, Realtime)
קיימים 13 קובצי RLS ו־12 קובצי E2E. M11 לא כותב אותם מחדש, אלא:
- **מפת כיסוי מול ARCHITECTURE §9** (E2E: כניסה, הזמנה, איפוס, שיעור, התנגשויות מקבילות, בקשות, שינוי סדרה חלקי, ביטול/שחזור, מחיקה רכה, תזכורות, הרשאות; Realtime; Concurrency). פערים ממולאים בבדיקות חדשות: ידוע לי שיש לבדוק במיוחד **שני מנהלים מטפלים באותה בקשה**, **שתי יצירות מקבילות לאותו מורה בו־זמנית**, ו**Realtime בין שני משתמשים** — אם אינם מכוסים, מוסיפים.
- **תרחיש מקצה לקצה אחד ארוך** (קובץ `tests/e2e/full-journey.spec.ts`): Super Admin מזמין מנהל ומורה ← הגדרת שעות/זמינות ← תלמיד ושיוך ← סדרת שיעורים ← מורה מבקש שינוי ← מנהל מאשר ← נוכחות ← ביטול ושחזור ← התראה ואימייל ב־outbox ← דוח וייצוא ← AI (עם ה־fake הקיים) ← מחיקה רכה ושחזור. זו הבדיקה שמעידה „המערכת עובדת כשלם”.
- **דפדפנים (PRD §5.4: Chrome, Safari, Edge — מחשב וטלפון):** הפרויקטים הקיימים ב־`playwright.config.ts` מכסים Chrome (דסקטופ, טאבלט, Pixel 7) ו־Safari (iPhone 15 / WebKit). מוסיפים פרויקט Edge (`channel: "msedge"`) להרצת בדיקות עשן בלבד (כניסה, לוח שנה, יצירת שיעור). אם Edge לא מותקן — מדווח, לא ממציא.
- **בדיקות שנכשלו בעבר (זיכרון):** `tests/rls/notifications.test.ts` נכשל בגלל שורות שנשארו ב־Development, ובדיקות E2E לפעמים נתקעות ברשת. תכנון: להפוך את בדיקות ההתראות לעצמאיות (יוצרות ומנקות רק את הנתונים של עצמן), **ולא למחוק את נתוני Development הישנים בלי לשאול אותך** (שאלה בסוף). נתקעות רשת: מגדילים timeout ב־`login()` ומוסיפים retry יחיד רק לפעולות רשת, לא לאימותים.
- **הרצה מלאה אחת נקייה** של `npm run lint && npm run typecheck && npm test && npm run test:rls && npm run test:e2e` בסוף שלב א׳, והתוצאות מוצגות.

### 1.7 עצירת שלב א׳
סיכום קצר: מה תוקן, מה נבדק, מה נשאר כהצעה להמשך. מאשרים מעבר לשלב ב׳.

## 2. שלב ב׳ — הכנת התשתית ל־Production (בלי לשנות את Production)

### 2.1 קבצים חדשים
- `.github/workflows/ci.yml` — רץ על כל PR ועל כל push לענף: `npm ci`, `lint`, `typecheck`, `test` (unit), `build`. **בלי** בדיקות RLS/E2E — הן דורשות סודות Development; הן ממשיכות לרוץ אצלי מקומית. (אפשר להוסיף אותן ל־CI בהמשך עם GitHub Environment `development`; לא נכלל כדי לא להרחיב סודות.) משתני build ציבוריים בלבד (כתובת/מפתח Publishable של Development — לא סודיים).
- `.github/workflows/migrate-production.yml` — **מופעל ידנית בלבד** (`workflow_dispatch`), `environment: production` (עם Required reviewers = את/ה), `concurrency: migrate-production` (ללא ביטול), הרצה בשני שלבים:
  1. `supabase link` + **`supabase db push --dry-run`** — מציג אילו Migrations יורצו.
  2. אחרי אישור ידני ב־Environment: `supabase db push`. כשל = Workflow אדום, ואין Merge.
  - סודות ב־GitHub Environment `production` בלבד: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` (= `culqeemdrhuvzweessra`). ערכים אלה **את** מזינה ב־GitHub; אני לא רואה אותם.
  - הגנה: ה־Workflow בודק שה־ref תואם לרשימה מותרת, ושאינו מריץ `db reset`.
- `scripts/env.ts` — הגנה: סירוב להריץ `seed-test-users`, `create-super-admin`, `dispatch-emails` ובדיקות מול `culqeemdrhuvzweessra`.
- רשימת בדיקה של Production (סעיף 4) — כחלק מ־ADR-20 ב־`ARCHITECTURE.md`, לא כקובץ נפרד.

### 2.2 Migrations — בדיקת התאמה לפריסה נקייה
צריך לוודא ש־34 הקבצים עולים בסדר על מסד ריק, בלי תלות בנתונים שנוצרו ידנית ב־Development (למשל Vault, משתמשים). האפשרויות בלי Docker: (א) ענף Supabase זמני (בתשלום — לא אעשה בלי לשאול), או (ב) קריאת הקבצים לאי־תלויות ידניות + dry-run מול Production אחרי הקמת ה־Workflow. **המלצה: (ב)** — ה־dry-run ב־Workflow מציג מה ירוץ, וההרצה האמיתית על פרויקט Production הריק היא למעשה הבדיקה; כל כשל נעצר לפני Merge, ו־Production ריק אז אין מה לשבור. מוסיפים תיאור של נוהל ההתאוששות (למחוק ולהריץ מחדש על פרויקט ריק — אפשרי רק כל עוד אין נתונים אמיתיים, ואומר לך מתי החלון נסגר).

### 2.3 הגדרות Production שאינן ב־Migrations (ARCHITECTURE §8.4) — את/ה מבצעת, אני מדריך
**Supabase Production** (`culqeemdrhuvzweessra`):
1. Authentication ← URL Configuration: `Site URL` = כתובת האתר הסופית; `Redirect URLs` = `<כתובת>/auth/confirm` ו־`<כתובת>/**` לפי ADR-5.
2. Authentication ← SMTP: Resend SMTP עם דומיין מאומת (SPF/DKIM). בלי SMTP מותאם, Supabase שולח רק לכתובות צוות ולא מתאים ל־Production.
3. Authentication ← Providers/הגדרות הרשמה: הרשמה עצמית כבויה (הכניסה רק בהזמנה); אורך סיסמה ו־Rate Limits לפי הערכים ב־Development.
4. Database ← Extensions: לוודא `pg_cron` ו־`pg_net` (ה־Migration של M8 יוצר אותם בעצמו, ובכל זאת מאמתים שהם פעילים); Realtime מופעל על הטבלאות (ה־publication נקבע ב־Migrations — מאמתים).
5. **Vault:** שני סודות — `app_base_url` (כתובת האתר) ו־`cron_secret` (מחרוזת אקראית חדשה, **לא** זהה ל־Development). מוסיפים דרך SQL Editor (לא ב־Migration, ADR-16). אני אכתוב את ה־SQL, ואת הערך תיצרי ותדביקי בעצמך.
6. גיבויים: ראו סעיף 6.

**Vercel Production** (Environment Variables, סוג Sensitive לסודות):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (כבר מוגדרים), `NEXT_PUBLIC_SITE_URL`, `SUPABASE_SECRET_KEY` (Production), `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_MODE=live`, `CRON_SECRET` (זהה ל־`cron_secret` ב־Vault), `OPENAI_API_KEY`, `OPENAI_MODEL`, `AI_HOURLY_LIMIT`, `AI_DAILY_LIMIT`. ל־Preview נשארים ערכי Development בלבד; מוודאים ש־`EMAIL_MODE=live` אינו מוגדר ב־Preview.
**GitHub:** Environment `production` עם Required reviewers + שלושת סודות ה־Migration; Branch protection על `main` (נדרש Pull Request + בדיקת CI עוברת).
**דומיין:** אם תרצי דומיין משלך — מוסיפים ב־Vercel ומעדכנים `Site URL`, Redirects ו־`app_base_url`. אם לא, נשארים עם `musicly-flame.vercel.app`. (שאלה בסוף.)

### 2.4 עדכוני תיעוד
- `ARCHITECTURE.md`: ADR-20 „תהליך שחרור ל־Production” (ענף release, dry-run, אישור, Migration ← Merge ← Deploy, אין Rollback ל־DB, נוהל התאוששות); `CLAUDE.md` — עדכון פקודות/הערה על Workflows אם משתנה משהו.
- `MILESTONES.md`: סימון 🟡 בסוף הבנייה (שלב א׳+ב׳), ו־✅ רק אחרי שאישרת את הפריסה בפועל.

## 3. שלב ג׳ — פריסה (רק אחרי אישורך המפורש)

לפני שאני נוגע בכל דבר: **אני מציג לך** את תוצאות שלב א׳, רשימת ה־Migrations שיורצו, ומשפט אחד על מה שהולך לקרות. מחכה ל„כן” מפורש.

1. את/ה מבצעת את הגדרות 2.3 (אני מלווה ומאמת מה שאפשר לאמת בלי סודות — למשל שה־Redirect URLs נכונים, מה שה־Workflow רואה).
2. הפעלת `migrate-production` ← קריאת dry-run ← אישור שלך ב־Environment ← `db push`. אם נכשל: נעצרים, אני קורא את הלוג, מתקן ב־Development ומריצים שוב; אין Merge.
3. הצלחה ← הוספת Super Admin ראשון (לוח הבקרה + SQL, החלטה 0.3) ← התחברות בפועל.
4. פתיחת Pull Request מ־`release/m11` ל־`main`; CI ירוק; את/ה לוחצת Merge ← Vercel Production Deployment אוטומטי; מוודאים בדף ה־Deployment שהבנייה הצליחה ושה־CSP מתאים לכתובת Production.
5. ריצת בדיקות Production לפי סעיף 4.

## 4. בדיקות בקרה ב־Production (תחת החלטה 0.5)

רשימה שאעבור עליה מולך, בדפדפן, עם חשבונות הבדיקה שלך:
- **כניסה והזמנה:** Super Admin נכנס; מזמין מנהל ומורה (אימייל מגיע לכתובת שלך עם קישור לדומיין הנכון); הרשמה מההזמנה; איפוס סיסמה.
- **ליבה:** שעות פעילות, תחום לימוד, תלמיד, שיוך, זמינות, שיעור בודד וסדרה, התנגשות (נדחית), בקשת מורה ואישור, נוכחות, ביטול ושחזור.
- **התראות ואימייל:** התראה בתוך המערכת + אימייל אחד שמגיע (Resend ← Logs); ב־Supabase ← Cron: ההיסטוריה מראה ריצות מוצלחות של `ping-email-dispatcher` ושאר המשימות; התזכורת נשלחת ל־Outbox ולא נשלחת פעמיים.
- **Realtime:** שני דפדפנים — שיעור שנוצר אצל אחד מופיע אצל השני בלי רענון.
- **דוחות וייצוא:** מספרים תואמים, קובץ CSV נפתח עם עברית תקינה.
- **AI:** שאלה אחת עם תקרת הוצאה פעילה; אישור שהמפתח מוגדר רק בשרת.
- **הרשאות:** מורה לא רואה שיעור של מורה אחר (גם בכתובת ישירה); מנהל ללא הרשאה למחיקת היסטוריה לא יכול.
- **RTL / Responsive / נגישות / נכסים:** מעבר על כניסה, בית, לוח שנה בנייד, ובדיקת טעינת הלוגו והרקעים.
- **ניקוי:** מחיקת חשבונות הבדיקה (רכה ← סופית), אימות שלא נשארו נתוני בדיקה, והחזרת `EMAIL_MODE`/תקרות לערכי פעילות.

אם משהו נכשל ב־Production: **לא מתקנים ישירות בלוח הבקרה.** מתקנים בקוד/Migration חדש (Backward Compatible, §8.2), בודקים ב־Development, ופורסים שוב דרך אותו תהליך.

## 5. סדר בנייה
1. סקירת מסכים + נגישות + נכסים (1.1–1.3) ותיקונים.
2. ביצועים ובדיקת אבטחה (1.4–1.5), כולל Migration אינדקס אם נדרש (Development בלבד).
3. בדיקות מערכת: מפת כיסוי, `full-journey`, בדיקות פערים, Edge, תיקון יציבות הבדיקות (1.6); הרצה מלאה נקייה.
4. **עצירה א׳** — דמו ותוצאות.
5. Workflows, הגנות בסקריפטים, ADR-20, מדריך הגדרות Production (שלב ב׳); פתיחת `release/m11` (בלי push עד בקשה).
6. **עצירה ב׳** — המתנה לאישור פרסום.
7. שלב ג׳ + בדיקות Production + דיווח מול ה־Definition of Done; סימון ✅ רק לפי אישורך.

## 6. גיבויים ופרטיות (ARCHITECTURE §9, §10.5, §5.3)
לפני שימוש אמיתי בנתוני תלמידים (קטינים) יש להחליט:
- **גיבוי:** יש לבדוק מול דף התמחור של Supabase מה כולל גיבוי בתוכנית הנוכחית ומה בתוכנית בתשלום (אני לא מניח מהזיכרון). **המלצה:** לעבור ל־Pro לפני הכנסת נתונים אמיתיים, ולבדוק פעם אחת שחזור לפרויקט זמני. הגיבוי אינו חלק מ־Migrations.
- **Vercel Hobby** מיועד לשימוש לא מסחרי; פעילות בית ספר מסחרית עשויה לדרוש Pro (התנאים אצל Vercel — אין לי דרך לפסוק אם זה חל עליך).
- **פרטיות:** ARCHITECTURE מזכיר בדיקה משפטית/פרטיות נפרדת לנתוני קטינים. M11 לא מספק אותה; אני אציין זאת בסיכום כגבול ידוע.
- **ניטור:** Vercel Logs + Supabase Logs + Cron History מספיקים להתחלה; אין שירות ניטור נוסף (לא הוסף בלי בקשה).

## 7. Definition of Done — מיפוי
| תנאי | איך מוכח |
|---|---|
| אישור מפורש לפרסום | עצירה ב׳ + „כן” שלך בצ׳אט |
| Workflow מוגן הריץ את כל ה־Migrations לפני Merge | לוג GitHub Actions ירוק, ו־`supabase migration list` תואם |
| Merge ← Vercel Production, רק פרויקט Supabase Production, אין סודות מקומיים | Deployment בלוח Vercel; `.env` מקומי נשאר Development; חיפוש סודות |
| Auth, Email, Cron, Realtime, Domains, Secrets נבדקו; אין הודעות למשתמשים אמיתיים | סעיף 4 + תיעוד מה נבדק |
| תהליכי ליבה, RTL, Responsive, הרשאות, נגישות ונכסים ב־Production | סעיף 4 |
| תוצאות מוצגות והפיתוח נעצר | סיכום סופי; אין התחלת אבן חדשה |

## 8. שאלות אליך לפני הבנייה
1. **דומיין:** נשארים עם `musicly-flame.vercel.app`, או יש דומיין לבית הספר? (משפיע על Resend והאימיילים.)
2. **Resend:** יש חשבון ו־Domain מאומת, או שנגדיר יחד? בלי דומיין מאומת האימיילים לא יגיעו לאנשים אחרים.
3. **תוכנית וגיבוי:** האם בכוונתך לעבור ל־Supabase Pro ולבדוק שחזור לפני נתונים אמיתיים? ומה לגבי Vercel Hobby מול Pro?
4. **OpenAI:** אותו מפתח או מפתח נפרד ל־Production, ומה תקרת ההוצאה החודשית?
5. **רישיון נכסים:** האם מותר לפרסם את כל הקבצים ב־`assets/`?
6. **נתוני Development ישנים:** מותר לי למחוק התראות/שורות Outbox ישנות ב־Development כדי שהבדיקות יהיו יציבות?
7. **מי יהיה ה־Super Admin הראשון ב־Production** (שם ואימייל)?
