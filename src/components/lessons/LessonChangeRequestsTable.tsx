import { Badge, ColorChip } from "@/components/ui/Badge";
import { ConfirmAction } from "@/components/ui/ConfirmAction";
import table from "@/components/ui/Table.module.css";
import { cancelLessonChangeRequest } from "@/lib/lessons/actions";
import { LESSON_CHANGE_KIND_LABELS } from "@/lib/lessons/labels";
import type { BookingOptions, LessonChangeRequest } from "@/lib/lessons/queries";
import { formatLessonDate, lessonTimeRange } from "@/lib/lessons/time";
import { formatDay } from "@/lib/students/age";
import { REQUEST_STATUS_LABELS } from "@/lib/availability/labels";
import { ChangeRequestActions } from "./ChangeRequestActions";

const dateTime = new Intl.DateTimeFormat("he-IL", {
  timeZone: "Asia/Jerusalem",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

type Props = {
  rows: LessonChangeRequest[];
  empty: string;
} & ({ mode: "admin"; options: BookingOptions } | { mode: "teacher"; options?: undefined });

// Teachers' requests to change or cancel a lesson. An admin answers; a teacher may withdraw their own.
export function LessonChangeRequestsTable({ rows, mode, options, empty }: Props) {
  if (!rows.length) return <p className={table.empty}>{empty}</p>;

  return (
    <table className={table.table}>
      <thead>
        <tr>
          <th scope="col">נשלחה</th>
          {mode === "admin" && <th scope="col">מורה</th>}
          <th scope="col">שיעור</th>
          <th scope="col">בקשה</th>
          <th scope="col">סטטוס</th>
          <th scope="col">
            <span className="visually-hidden">פעולות</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const status = REQUEST_STATUS_LABELS[r.status];
          return (
            <tr key={r.id}>
              <td data-label="נשלחה">{dateTime.format(new Date(r.created_at))}</td>
              {mode === "admin" && <td data-label="מורה">{r.teacher_name}</td>}
              <td data-label="שיעור" className={table.primaryCell}>
                <div>
                  {r.student_name} <ColorChip color={r.color}>{r.lesson_type_name}</ColorChip>
                </div>
                <div className="text-small text-secondary">
                  {formatLessonDate(r.lesson_start_at)} <bdi dir="ltr">{lessonTimeRange(r.lesson_start_at, r.lesson_end_at)}</bdi>
                  {r.lesson_status === "cancelled" && " · בוטל"}
                </div>
              </td>
              <td data-label="בקשה">
                {LESSON_CHANGE_KIND_LABELS[r.kind]}
                {r.proposed_date && r.proposed_start_time && (
                  <div className="text-small text-secondary">
                    מועד מוצע: {formatDay(r.proposed_date)} <bdi dir="ltr">{r.proposed_start_time.slice(0, 5)}</bdi>
                  </div>
                )}
                {r.reason && <div className="text-small text-secondary">סיבה: {r.reason}</div>}
              </td>
              <td data-label="סטטוס">
                <Badge tone={status.tone}>{status.label}</Badge>
                {r.decision_note && <div className="text-small text-secondary">הערת המנהל: {r.decision_note}</div>}
              </td>
              <td>
                {r.status === "pending" && (
                  <div className={table.actions}>
                    {mode === "admin" ? (
                      <ChangeRequestActions request={r} options={options} />
                    ) : (
                      <ConfirmAction
                        action={cancelLessonChangeRequest}
                        fields={{ id: r.id, version: String(r.version) }}
                        trigger="ביטול הבקשה"
                        triggerVariant="ghost"
                        title="ביטול הבקשה"
                        description="הבקשה תבוטל והשיעור יישאר כפי שהוא."
                        confirmLabel="ביטול הבקשה"
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
