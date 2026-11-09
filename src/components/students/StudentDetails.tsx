import { ColorChip } from "@/components/ui/Badge";
import table from "@/components/ui/Table.module.css";
import { formatDay } from "@/lib/students/age";
import { LEVEL_LABELS, RETURN_MODE_LABELS } from "@/lib/students/labels";
import type { StudentAbsences, listStudents } from "@/lib/students/queries";
import styles from "./StudentRow.module.css";

type Student = Awaited<ReturnType<typeof listStudents>>["rows"][number];

// The opened part of a row in the admin students list.
export function StudentDetails({ student, absences }: { student: Student; absences?: StudentAbsences }) {
  return (
    <dl className={styles.details}>
      <div>
        <dt>תאריך לידה</dt>
        <dd>{formatDay(student.birthDate)}</dd>
      </div>
      <div>
        <dt>טלפון התלמיד</dt>
        <dd>{student.phone ? <span className={table.ltr}>{student.phone}</span> : "—"}</dd>
      </div>
      <div>
        <dt>טלפון הורה</dt>
        <dd>{student.parentPhone ? <span className={table.ltr}>{student.parentPhone}</span> : "—"}</dd>
      </div>
      <div>
        <dt>תאריך חזרה משוער</dt>
        <dd>
          {student.expectedReturnDate ? (
            <>
              {formatDay(student.expectedReturnDate)}
              {student.returnMode && (
                <div className="text-small text-secondary">{RETURN_MODE_LABELS[student.returnMode].label}</div>
              )}
            </>
          ) : (
            "—"
          )}
        </dd>
      </div>
      <div>
        <dt>תחומי לימוד, רמה ומורה קבוע</dt>
        <dd>
          {student.subjects.length ? (
            <ul className={`${table.chips} ${styles.list}`}>
              {student.subjects.map((sub) => (
                <li key={sub.id}>
                  <ColorChip color={sub.lessonType.color}>
                    {sub.lessonType.name} · {LEVEL_LABELS[sub.level]} · {sub.teacherName}
                  </ColorChip>
                </li>
              ))}
            </ul>
          ) : (
            "טרם נרשם לתחום"
          )}
        </dd>
      </div>
      <div>
        <dt>העדרויות</dt>
        <dd>
          {absences?.count ? (
            <>
              {absences.count === 1 ? "שיעור אחד שהתלמיד לא הגיע אליו" : `${absences.count} שיעורים שהתלמיד לא הגיע אליהם`}
              <div className={styles.dates}>
                {absences.recent.map((d, i) => (
                  <span key={`${d}-${i}`} className="text-small text-secondary">
                    {formatDay(d)}
                  </span>
                ))}
              </div>
            </>
          ) : (
            "אין העדרויות"
          )}
        </dd>
      </div>
    </dl>
  );
}
