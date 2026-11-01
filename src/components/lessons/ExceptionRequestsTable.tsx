import { Badge, ColorChip } from "@/components/ui/Badge";
import { ConfirmAction } from "@/components/ui/ConfirmAction";
import table from "@/components/ui/Table.module.css";
import { cancelExceptionRequest } from "@/lib/lessons/actions";
import { EXCEPTION_STATUS_LABELS, LOCATION_LABELS } from "@/lib/lessons/labels";
import type { ExceptionRequest } from "@/lib/lessons/queries";
import { addMinutes } from "@/lib/lessons/time";
import { formatDay } from "@/lib/students/age";
import { WEEKDAY_LABELS, dayOfWeek, shortTime } from "@/lib/time/weekdays";
import { ExceptionDecisionDialog } from "./ExceptionDecisionDialog";

// "יום ג׳ 14/05/2026, 16:00–16:45" or "סדרה: כל יום שלישי 16:00–16:45, מ־14/05/2026 עד ..."
export function describeBooking(r: ExceptionRequest): string {
  // Isolated left-to-right so the range is not reversed inside Hebrew text.
  const time = `\u2066${shortTime(r.start_time)}–${addMinutes(shortTime(r.start_time), r.duration_minutes)}\u2069`;
  if (r.kind === "single") return `${formatDay(r.start_date)}, ${time}`;
  const until = r.end_date ? ` עד ${formatDay(r.end_date)}` : " ללא תאריך סיום";
  return `סדרה: כל יום ${WEEKDAY_LABELS[dayOfWeek(r.start_date)]} ${time}, מ־${formatDay(r.start_date)}${until}`;
}

const dateTime = new Intl.DateTimeFormat("he-IL", {
  timeZone: "Asia/Jerusalem",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

// Bookings outside a teacher's availability. The teacher approves or rejects; an admin may withdraw.
export function ExceptionRequestsTable({ rows, mode, empty }: { rows: ExceptionRequest[]; mode: "teacher" | "admin"; empty: string }) {
  if (!rows.length) return <p className={table.empty}>{empty}</p>;

  return (
    <table className={table.table}>
      <thead>
        <tr>
          <th scope="col">נשלחה</th>
          <th scope="col">תלמיד</th>
          {mode === "admin" && <th scope="col">מורה</th>}
          <th scope="col">תחום</th>
          <th scope="col">מועד</th>
          <th scope="col">סטטוס</th>
          <th scope="col">
            <span className="visually-hidden">פעולות</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const status = EXCEPTION_STATUS_LABELS[r.status];
          const when = describeBooking(r);
          const summary = `${r.student_name} — ${r.lesson_type_name}, ${when}, ${LOCATION_LABELS[r.location]}`;
          return (
            <tr key={r.id}>
              <td data-label="נשלחה">{dateTime.format(new Date(r.created_at))}</td>
              <td data-label="תלמיד" className={table.primaryCell}>
                {r.student_name}
              </td>
              {mode === "admin" && <td data-label="מורה">{r.teacher_name}</td>}
              <td data-label="תחום">
                <ColorChip color={r.color}>{r.lesson_type_name}</ColorChip>
              </td>
              <td data-label="מועד">
                {when}
                <div className="text-small text-secondary">
                  {LOCATION_LABELS[r.location]}
                  {r.outside_hours && " · מחוץ לשעות הפעילות"}
                </div>
              </td>
              <td data-label="סטטוס">
                <Badge tone={status.tone}>{status.label}</Badge>
                {r.result_note && <div className="text-small text-secondary">{r.result_note}</div>}
                {r.decision_note && <div className="text-small text-secondary">הערת המורה: {r.decision_note}</div>}
              </td>
              <td>
                {r.status === "pending" && (
                  <div className={table.actions}>
                    {mode === "teacher" ? (
                      <>
                        <ExceptionDecisionDialog request={r} decision="approve" summary={summary} />
                        <ExceptionDecisionDialog request={r} decision="reject" summary={summary} />
                      </>
                    ) : (
                      <ConfirmAction
                        action={cancelExceptionRequest}
                        fields={{ id: r.id, version: String(r.version) }}
                        trigger="ביטול בקשה"
                        triggerVariant="ghost"
                        title="ביטול בקשת השיבוץ"
                        description={`${r.teacher_name}: ${summary}. הבקשה תבוטל, והמורה לא יוכל לאשר אותה.`}
                        confirmLabel="ביטול בקשה"
                        confirmVariant="danger"
                      />
                    )}
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
