import { ConfirmAction } from "@/components/ui/ConfirmAction";
import table from "@/components/ui/Table.module.css";
import type { ActionState } from "@/lib/actions";
import { RestoreFields } from "./RestoreFields";

export type DeletedPerson = {
  id: string;
  full_name: string;
  deleted_at: string;
  days_left: number;
  purged: boolean;
  lessons: number;
};

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const dateFormat = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "medium" });

function daysLeftText(days: number) {
  if (days <= 0) return "המחיקה הסופית תתבצע בקרוב";
  return days === 1 ? "נותר יום אחד לשחזור" : `נותרו ${days} ימים לשחזור`;
}

// "Recently deleted" list: people still restorable, and people already purged whose lesson history
// remains and can be deleted for good.
export function DeletedPeopleTable({
  kind,
  rows,
  restore,
  deleteHistory,
  canDeleteHistory,
}: {
  kind: "student" | "teacher";
  rows: DeletedPerson[];
  restore: Action;
  deleteHistory: Action;
  canDeleteHistory: boolean;
}) {
  const noun = kind === "student" ? "התלמיד" : "המורה";
  if (!rows.length) {
    return (
      <div className={table.wrapper}>
        <p className={table.empty}>{kind === "student" ? "אין תלמידים שנמחקו לאחרונה." : "אין מורים שנמחקו לאחרונה."}</p>
      </div>
    );
  }

  return (
    <div className={table.wrapper}>
      <table className={table.table}>
        <thead>
          <tr>
            <th scope="col">שם</th>
            <th scope="col">נמחק ב־</th>
            <th scope="col">מצב</th>
            <th scope="col">פעולות</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>{p.full_name}</td>
              <td data-label="נמחק ב־">{dateFormat.format(new Date(p.deleted_at))}</td>
              <td data-label="מצב">
                {p.purged
                  ? `נמחק לצמיתות. נשארה היסטוריה של ${p.lessons} שיעורים.`
                  : daysLeftText(p.days_left)}
              </td>
              <td data-label="פעולות">
                {!p.purged ? (
                  <ConfirmAction
                    action={restore}
                    fields={{ id: p.id }}
                    trigger="שחזור"
                    triggerVariant="outline"
                    title={`שחזור ${p.full_name}`}
                    description={`${noun} יחזור לרשימה. שיעורים שבוטלו אינם חוזרים אוטומטית.`}
                    confirmLabel="שחזור"
                  >
                    <RestoreFields withAvailability={kind === "teacher"} />
                  </ConfirmAction>
                ) : kind === "teacher" || canDeleteHistory ? (
                  <ConfirmAction
                    action={deleteHistory}
                    fields={{ id: p.id }}
                    trigger="מחיקת היסטוריה לצמיתות"
                    triggerVariant="danger"
                    title="מחיקת היסטוריה לצמיתות"
                    description={
                      kind === "student"
                        ? `כל ${p.lessons} השיעורים של התלמיד, הנוכחות והרשומות שלהם יימחקו. אין אפשרות לשחזר לאחר האישור.`
                        : `שם המורה יוסר מ־${p.lessons} השיעורים שלו, ויוצג בהם ”מורה שנמחק”. ההיסטוריה של התלמידים נשמרת. אין אפשרות לשחזר לאחר האישור.`
                    }
                    confirmLabel="מחק לצמיתות"
                    confirmVariant="danger"
                  />
                ) : (
                  <span className="text-small text-secondary">אין לך הרשאה למחוק היסטוריית תלמידים</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
