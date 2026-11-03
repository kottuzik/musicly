import type { Metadata } from "next";
import Link from "next/link";
import { ExportLink } from "@/components/export/ExportLink";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { SelectField } from "@/components/ui/SelectField";
import stack from "@/components/ui/Stack.module.css";
import table from "@/components/ui/Table.module.css";
import toolbar from "@/components/ui/Toolbar.module.css";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { dbErrorMessage } from "@/lib/errors";
import { formatDay } from "@/lib/students/age";
import { loadReport, readReportRange, reportShortcuts, type ReportLine } from "@/lib/reports/queries";
import { createClient } from "@/lib/supabase/server";
import styles from "./Reports.module.css";

export const metadata: Metadata = { title: "דוחות" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUMNS = [
  { key: "scheduled", label: "מתוכננים" },
  { key: "held", label: "התקיימו" },
  { key: "studentAbsent", label: "התלמיד לא הגיע" },
  { key: "teacherAbsent", label: "המורה לא הגיע" },
  { key: "unreported", label: "ממתינים לדיווח" },
  { key: "upcoming", label: "עתידיים" },
  { key: "cancelled", label: "בוטלו" },
  { key: "closedDay", label: "יום סגירה" },
] as const;

function LinesTable({ title, firstHeader, lines, total, exportKind, exportParams }: {
  title: string;
  firstHeader: string;
  lines: ReportLine[];
  total: ReportLine | undefined;
  exportKind: "report-teachers" | "report-subjects";
  exportParams: Record<string, string | undefined>;
}) {
  return (
    <section className={stack.page} aria-label={title}>
      <div className={styles.sectionHeader}>
        <PageHeader level={2} title={title} />
        <ExportLink kind={exportKind} params={exportParams} />
      </div>
      <div className={table.wrapper}>
        {lines.length ? (
          <table className={table.table}>
            <thead>
              <tr>
                <th scope="col">{firstHeader}</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} scope="col">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id ?? l.name}>
                  <td data-label={firstHeader}><strong>{l.name}</strong></td>
                  {COLUMNS.map((c) => (
                    <td key={c.key} data-label={c.label} className={styles.num}>{l[c.key]}</td>
                  ))}
                </tr>
              ))}
              {total && lines.length > 1 && (
                <tr className={styles.totalRow}>
                  <td data-label={firstHeader}><strong>סה״כ</strong></td>
                  {COLUMNS.map((c) => (
                    <td key={c.key} data-label={c.label} className={styles.num}>{total[c.key]}</td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <p className={table.empty}>אין שיעורים בתקופה שנבחרה.</p>
        )}
      </div>
    </section>
  );
}

export default async function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  await requireRole(ADMIN_ROLES);
  const params = await searchParams;
  const { from, to } = readReportRange(params);
  const teacher = typeof params.teacher === "string" && UUID.test(params.teacher) ? params.teacher : "";

  const supabase = await createClient();
  const [totalRes, byTeacher, bySubject, { data: teachers }] = await Promise.all([
    loadReport(supabase, { from, to }, teacher, "total"),
    loadReport(supabase, { from, to }, teacher, "teacher"),
    loadReport(supabase, { from, to }, teacher, "lesson_type"),
    supabase.from("teachers").select("id, full_name").is("deleted_at", null).order("full_name"),
  ]);
  const error = totalRes.error ?? byTeacher.error ?? bySubject.error;
  const total = totalRes.lines[0];
  const exportParams = { from, to, teacher };

  const cards = total
    ? [
        { label: "התקיימו", value: total.held },
        { label: "התלמיד לא הגיע", value: total.studentAbsent },
        { label: "המורה לא הגיע", value: total.teacherAbsent },
        { label: "ממתינים לדיווח", value: total.unreported },
        { label: "בוטלו", value: total.cancelled },
      ]
    : [];

  return (
    <div className={stack.page}>
      <LiveRefresh tables={["lessons", "attendance"]} />
      <PageHeader title="דוחות" subtitle="סיכום שיעורים ונוכחות לפי תקופה, מורה ותחום." />

      <form className={toolbar.toolbar} role="search" aria-label="סינון הדוח">
        <Field label="מתאריך" name="from" type="date" defaultValue={from} />
        <Field label="עד תאריך" name="to" type="date" defaultValue={to} />
        <SelectField
          label="מורה"
          name="teacher"
          defaultValue={teacher}
          options={[{ value: "", label: "כל המורים" }, ...(teachers ?? []).map((t) => ({ value: t.id, label: t.full_name }))]}
        />
        <Button type="submit">הצגה</Button>
      </form>
      <ul className={styles.shortcuts} aria-label="תקופות מהירות">
        {reportShortcuts().map((s) => (
          <li key={s.label}>
            <Link href={`/admin/reports?from=${s.from}&to=${s.to}${teacher ? `&teacher=${teacher}` : ""}`}>{s.label}</Link>
          </li>
        ))}
      </ul>

      {error ? (
        <Alert tone="error">{dbErrorMessage(error)}</Alert>
      ) : (
        <>
          <p className={toolbar.count} role="status">
            {formatDay(from)} – {formatDay(to)}. שיעורים מבוטלים וימי סגירה אינם נספרים כשיעורים שהתקיימו.
          </p>
          <ul className={styles.stats} aria-label="סיכום התקופה">
            {cards.map((c) => (
              <li key={c.label} className={styles.stat}>
                <span className={styles.statValue}>{c.value}</span>
                <span className={styles.statLabel}>{c.label}</span>
              </li>
            ))}
          </ul>
          <LinesTable title="לפי מורה" firstHeader="מורה" lines={byTeacher.lines} total={total}
            exportKind="report-teachers" exportParams={exportParams} />
          <LinesTable title="לפי תחום" firstHeader="תחום" lines={bySubject.lines} total={total}
            exportKind="report-subjects" exportParams={exportParams} />
        </>
      )}
    </div>
  );
}
