import type { Metadata } from "next";
import Link from "next/link";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { SelectField } from "@/components/ui/SelectField";
import stack from "@/components/ui/Stack.module.css";
import table from "@/components/ui/Table.module.css";
import toolbar from "@/components/ui/Toolbar.module.css";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { AUDIT_ACTION_LABELS, auditDetail } from "@/lib/lessons/labels";
import { loadAuditEvents } from "@/lib/lessons/queries";
import { formatLessonDate, schoolTime } from "@/lib/lessons/time";
import { schoolToday } from "@/lib/students/age";
import { createClient } from "@/lib/supabase/server";
import { addDays } from "@/lib/time/weekdays";

export const metadata: Metadata = { title: "היסטוריית פעילות" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = [
  { value: "all", label: "הכול" },
  { value: "attendance", label: "נוכחות" },
  { value: "changes", label: "שינויים וביטולים" },
];

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

// Admins' view of the audit log: who did what and when. The log holds statuses and ids only (no
// notes or contact details); names are looked up when the page loads.
export default async function ActivityPage({ searchParams }: PageProps<"/admin/activity">) {
  await requireRole(ADMIN_ROLES);
  const params = await searchParams;
  const today = schoolToday();
  const from = DATE.test(one(params.from)) ? one(params.from) : addDays(today, -30);
  const to = DATE.test(one(params.to)) ? one(params.to) : today;
  const kind = KINDS.some((k) => k.value === one(params.kind)) ? one(params.kind) : "all";
  const page = Math.max(1, Number.parseInt(one(params.page), 10) || 1);

  const supabase = await createClient();
  const { events, total } = await loadAuditEvents(supabase, { from, to, kind, page });
  const pages = Math.max(1, Math.ceil(total / 50));
  const link = (p: number) => `/admin/activity?from=${from}&to=${to}&kind=${kind}&page=${p}`;

  return (
    <div className={stack.page}>
      <LiveRefresh tables={["audit_events"]} />
      <PageHeader title="היסטוריית פעילות" subtitle="מי עשה מה ומתי: דיווחי נוכחות, תיקונים, שינויים וביטולים." />

      <form className={toolbar.toolbar} role="search" aria-label="סינון היסטוריית הפעילות">
        <Field label="מתאריך" name="from" type="date" defaultValue={from} />
        <Field label="עד תאריך" name="to" type="date" defaultValue={to} />
        <SelectField label="סוג" name="kind" defaultValue={kind} options={KINDS} />
        <Button type="submit">סינון</Button>
      </form>

      <p className={toolbar.count} aria-live="polite">
        {total === 0 ? "לא נמצאו פעולות בתקופה שנבחרה." : `${total.toLocaleString("he-IL")} פעולות`}
      </p>

      {events.length > 0 && (
        <div className={table.wrapper} tabIndex={0}>
          <table className={table.table}>
            <thead>
              <tr>
                <th scope="col">מתי</th>
                <th scope="col">מי</th>
                <th scope="col">פעולה</th>
                <th scope="col">שיעור</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const detail = auditDetail(e.action, e.old_values, e.new_values);
                return (
                  <tr key={e.id}>
                    <td data-label="מתי">
                      {formatLessonDate(e.created_at)} <bdi dir="ltr">{schoolTime(e.created_at)}</bdi>
                    </td>
                    <td data-label="מי">{e.actor_name ?? "המערכת"}</td>
                    <td data-label="פעולה">
                      {AUDIT_ACTION_LABELS[e.action] ?? e.action}
                      {detail && <div className="text-small text-secondary">{detail}</div>}
                    </td>
                    <td data-label="שיעור">
                      {e.student_name ? (
                        <>
                          {e.student_name}
                          <div className="text-small text-secondary">
                            {e.teacher_name}
                            {e.lesson_start_at && (
                              <>
                                {" · "}
                                {formatLessonDate(e.lesson_start_at)} <bdi dir="ltr">{schoolTime(e.lesson_start_at)}</bdi>
                              </>
                            )}
                          </div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="עמודים" className={toolbar.pager}>
          {page > 1 && <Link href={link(page - 1)}>העמוד הקודם</Link>}
          <span aria-current="page">
            עמוד {page} מתוך {pages}
          </span>
          {page < pages && <Link href={link(page + 1)}>העמוד הבא</Link>}
        </nav>
      )}
    </div>
  );
}
