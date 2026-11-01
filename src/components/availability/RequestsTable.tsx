import { Badge } from "@/components/ui/Badge";
import { ConfirmAction } from "@/components/ui/ConfirmAction";
import table from "@/components/ui/Table.module.css";
import { cancelRequest } from "@/lib/availability/actions";
import { REQUEST_KIND_LABELS, REQUEST_STATUS_LABELS } from "@/lib/availability/labels";
import { describeRequest } from "@/lib/availability/slots";
import type { AvailabilityRequest } from "@/lib/availability/queries";
import { DecisionDialog } from "./DecisionDialog";

type Row = AvailabilityRequest & { teacherName?: string };

const dateTime = new Intl.DateTimeFormat("he-IL", {
  timeZone: "Asia/Jerusalem",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

// Requests list. Teachers can withdraw their pending requests; admins approve or reject them.
export function RequestsTable({ rows, mode, empty }: { rows: Row[]; mode: "teacher" | "admin"; empty: string }) {
  const showTeacher = rows.some((r) => r.teacherName);
  if (!rows.length) return <p className={table.empty}>{empty}</p>;

  return (
    <table className={table.table}>
      <thead>
        <tr>
          <th scope="col">נשלחה</th>
          {showTeacher && <th scope="col">מורה</th>}
          <th scope="col">סוג</th>
          <th scope="col">פרטים</th>
          <th scope="col">סטטוס</th>
          <th scope="col">
            <span className="visually-hidden">פעולות</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const status = REQUEST_STATUS_LABELS[r.status];
          const details = describeRequest(r);
          const summary = `${r.teacherName ? `${r.teacherName} — ` : ""}${REQUEST_KIND_LABELS[r.kind]}: ${details}`;
          return (
            <tr key={r.id}>
              <td data-label="נשלחה">{dateTime.format(new Date(r.created_at))}</td>
              {showTeacher && (
                <td data-label="מורה" className={table.primaryCell}>
                  {r.teacherName}
                </td>
              )}
              <td data-label="סוג">{REQUEST_KIND_LABELS[r.kind]}</td>
              <td data-label="פרטים">
                {details}
                {r.reason && <div className="text-small text-secondary">סיבה: {r.reason}</div>}
              </td>
              <td data-label="סטטוס">
                <Badge tone={status.tone}>{status.label}</Badge>
                {r.decision_note && <div className="text-small text-secondary">הערת מנהל: {r.decision_note}</div>}
              </td>
              <td>
                {r.status === "pending" && (
                  <div className={table.actions}>
                    {mode === "admin" ? (
                      <>
                        <DecisionDialog request={r} decision="approve" summary={summary} />
                        <DecisionDialog request={r} decision="reject" summary={summary} />
                      </>
                    ) : (
                      <ConfirmAction
                        action={cancelRequest}
                        fields={{ id: r.id, version: String(r.version) }}
                        trigger="ביטול בקשה"
                        triggerVariant="ghost"
                        title="ביטול הבקשה"
                        description={`${summary}. הבקשה תבוטל ולא תגיע לטיפול המנהלים.`}
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
