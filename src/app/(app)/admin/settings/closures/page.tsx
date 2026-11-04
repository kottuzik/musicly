import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import stack from "@/components/ui/Stack.module.css";
import table from "@/components/ui/Table.module.css";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { CLOSURE_SOURCE_LABELS } from "@/lib/availability/labels";
import { formatHebrewDate, israeliHolidays } from "@/lib/holidays/israeli";
import { formatDay, schoolToday } from "@/lib/students/age";
import { createClient } from "@/lib/supabase/server";
import { addDays } from "@/lib/time/weekdays";
import { SettingsTabs } from "../SettingsTabs";
import { CancelClosureDialog } from "./CancelClosureDialog";
import { CustomClosureDialog } from "./CustomClosureDialog";
import { HolidayButton } from "./HolidayButton";
import styles from "./Closures.module.css";

export const metadata: Metadata = { title: "ימי סגירה" };

function dateRange(start: string, end: string) {
  return start === end ? formatDay(start) : `${formatDay(start)} – ${formatDay(end)}`;
}

export default async function ClosuresPage({ searchParams }: PageProps<"/admin/settings/closures">) {
  await requireRole(ADMIN_ROLES);
  const showCancelled = (await searchParams).show === "cancelled";
  const today = schoolToday();

  const supabase = await createClient();
  let query = supabase
    .from("school_closures")
    .select("id, name, start_date, end_date, source, holiday_key, status")
    .gte("end_date", today)
    .order("start_date");
  if (!showCancelled) query = query.eq("status", "active");
  const { data: closures } = await query;

  // Suggestions for the coming year; nothing is a closure until an admin picks it (PRD §4.6).
  const activeKeys = new Set((closures ?? []).filter((c) => c.status === "active").map((c) => c.holiday_key));
  const holidays = israeliHolidays(today, addDays(today, 365)).filter((h) => h.endDate >= today);

  return (
    <div className={stack.page}>
      <PageHeader title="הגדרות" />
      <SettingsTabs current="closures" />

      <section className={styles.section} aria-labelledby="closures-title">
        <PageHeader
          level={2}
          title={<span id="closures-title">ימי סגירה</span>}
          subtitle="ימים שבהם בית הספר סגור. שיעורים בימים אלה יסומנו „לא מתקיים – יום סגירה” כשיתווסף שיבוץ השיעורים."
          actions={<CustomClosureDialog today={today} />}
        />
        <Link href={showCancelled ? "/admin/settings/closures" : "/admin/settings/closures?show=cancelled"}>
          {showCancelled ? "הסתרת ימי סגירה שבוטלו" : "הצגת ימי סגירה שבוטלו"}
        </Link>
        <div className={table.wrapper} tabIndex={0}>
          {closures?.length ? (
            <table className={table.table}>
              <thead>
                <tr>
                  <th scope="col">שם</th>
                  <th scope="col">תאריכים</th>
                  <th scope="col">מקור</th>
                  <th scope="col">סטטוס</th>
                  <th scope="col">
                    <span className="visually-hidden">פעולות</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {closures.map((c) => (
                  <tr key={c.id}>
                    <td className={table.primaryCell}>{c.name}</td>
                    <td data-label="תאריכים">{dateRange(c.start_date, c.end_date)}</td>
                    <td data-label="מקור">{CLOSURE_SOURCE_LABELS[c.source]}</td>
                    <td data-label="סטטוס">
                      <Badge tone={c.status === "active" ? "primary" : "neutral"}>{c.status === "active" ? "פעיל" : "בוטל"}</Badge>
                    </td>
                    <td>
                      {c.status === "active" && (
                        <div className={table.actions}>
                          <CancelClosureDialog id={c.id} name={c.name} />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={table.empty}>לא הוגדרו ימי סגירה קרובים. בחרו חגים מהרשימה או הוסיפו יום סגירה מיוחד.</p>
          )}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="holidays-title">
        <PageHeader
          level={2}
          title={<span id="holidays-title">חגים בשנה הקרובה</span>}
          subtitle="הצעות בלבד: אף יום אינו נסגר אוטומטית. בחרו אילו מהם יהיו ימי סגירה."
        />
        <div className={table.wrapper} tabIndex={0}>
          <table className={table.table}>
            <thead>
              <tr>
                <th scope="col">חג</th>
                <th scope="col">תאריך</th>
                <th scope="col">סוג</th>
                <th scope="col">
                  <span className="visually-hidden">פעולות</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {holidays.map((h) => (
                <tr key={h.key}>
                  <td className={table.primaryCell}>{h.name}</td>
                  <td data-label="תאריך">
                    {dateRange(h.startDate, h.endDate)}
                    <span className={styles.hebrewDate}>{formatHebrewDate(h.startDate)}</span>
                  </td>
                  <td data-label="סוג">{h.isRestDay ? <Badge tone="info">יום שבתון</Badge> : "—"}</td>
                  <td>
                    <div className={table.actions}>
                      {activeKeys.has(h.key) ? (
                        <Badge tone="primary">יום סגירה ✓</Badge>
                      ) : (
                        <HolidayButton holidayKey={h.key} name={h.name} />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
