import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Badge, ColorChip } from "@/components/ui/Badge";
import stack from "@/components/ui/Stack.module.css";
import table from "@/components/ui/Table.module.css";
import { ATTENDANCE_LABELS, LESSON_STATUS_LABELS, LOCATION_LABELS } from "@/lib/lessons/labels";
import type { HistoryLesson } from "@/lib/lessons/queries";
import { formatLessonDate, lessonTimeRange, monthTitle, shiftMonth } from "@/lib/lessons/time";
import { AttendanceDialog } from "./AttendanceDialog";
import styles from "./Attendance.module.css";

type Props = {
  lessons: HistoryLesson[];
  month: string;
  // Link to the same screen on another month.
  hrefForMonth: (month: string) => string;
  showStudent: boolean;
  showTeacher: boolean;
  // The viewer may report or correct attendance (an admin, or an active teacher on their own lessons).
  canReport: boolean;
  // Text when the month has no lessons.
  empty: string;
  // The moment the page was loaded: decides whether a lesson without a report is over or still ahead.
  asOf: string;
};

// A person's lessons in one month with their attendance, for the "lesson history" tabs.
export function HistoryLessons({ lessons, month, hrefForMonth, showStudent, showTeacher, canReport, empty, asOf }: Props) {
  const held = lessons.filter((l) => l.status === "scheduled" && l.attendance_status === "held").length;
  const studentAbsent = lessons.filter((l) => l.status === "scheduled" && l.attendance_status === "student_absent").length;
  const teacherAbsent = lessons.filter((l) => l.status === "scheduled" && l.attendance_status === "teacher_absent").length;
  const cancelled = lessons.filter((l) => l.status === "cancelled").length;
  const now = new Date(asOf).getTime();

  return (
    <div className={stack.page}>
      <nav className={styles.monthNav} aria-label="בחירת חודש">
        <div className={styles.monthLinks}>
          <Link href={hrefForMonth(shiftMonth(month, -1))} aria-label="החודש הקודם">
            <ChevronRight size={20} aria-hidden="true" />
          </Link>
          <h2 className={`text-h3 ${styles.monthTitle}`} aria-live="polite">
            {monthTitle(month)}
          </h2>
          <Link href={hrefForMonth(shiftMonth(month, 1))} aria-label="החודש הבא">
            <ChevronLeft size={20} aria-hidden="true" />
          </Link>
        </div>
        <p className={styles.summary}>
          <span>התקיימו: {held}</span>
          <span>התלמיד לא הגיע: {studentAbsent}</span>
          <span>המורה לא הגיע: {teacherAbsent}</span>
          <span>בוטלו: {cancelled}</span>
        </p>
      </nav>

      {lessons.length === 0 ? (
        <p className={table.empty}>{empty}</p>
      ) : (
        <div className={table.wrapper} tabIndex={0}>
          <table className={table.table}>
            <thead>
              <tr>
                <th scope="col">מועד</th>
                {showStudent && <th scope="col">תלמיד</th>}
                <th scope="col">תחום</th>
                {showTeacher && <th scope="col">מורה</th>}
                <th scope="col">נוכחות</th>
                <th scope="col">
                  <span className="visually-hidden">פעולות</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lessons.map((l) => {
                const isScheduled = l.status === "scheduled";
                const attendance = l.attendance_status ? ATTENDANCE_LABELS[l.attendance_status] : null;
                const status = LESSON_STATUS_LABELS[l.status];
                return (
                  <tr key={l.id} className={isScheduled ? undefined : styles.cancelled}>
                    <td data-label="מועד" className={table.primaryCell}>
                      <div>
                        {formatLessonDate(l.start_at)}
                        <div className="text-small text-secondary">
                          <bdi dir="ltr">{lessonTimeRange(l.start_at, l.end_at)}</bdi> · {LOCATION_LABELS[l.location]}
                        </div>
                      </div>
                    </td>
                    {showStudent && <td data-label="תלמיד">{l.student_name}</td>}
                    <td data-label="תחום">
                      <ColorChip color={l.color}>{l.lesson_type_name}</ColorChip>
                    </td>
                    {showTeacher && <td data-label="מורה">{l.teacher_name}</td>}
                    <td data-label="נוכחות">
                      {!isScheduled ? (
                        <Badge tone={status.tone}>{status.label}</Badge>
                      ) : attendance ? (
                        <>
                          <Badge tone={attendance.tone}>{attendance.label}</Badge>
                          {l.attendance_note && <span className={styles.note}>{l.attendance_note}</span>}
                        </>
                      ) : new Date(l.end_at).getTime() <= now ? (
                        <Badge tone="neutral">לא דווח</Badge>
                      ) : (
                        <span className="text-secondary">טרם התקיים</span>
                      )}
                    </td>
                    <td>
                      {canReport && isScheduled && (
                        <div className={table.actions}>
                          <AttendanceDialog
                            lessonId={l.id}
                            context={`${l.student_name} — ${formatLessonDate(l.start_at)}`}
                            current={
                              l.attendance_status && l.attendance_version !== null
                                ? { status: l.attendance_status, note: l.attendance_note, version: l.attendance_version }
                                : null
                            }
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
