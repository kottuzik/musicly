import { Card } from "@/components/ui/Card";
import { ColorChip } from "@/components/ui/Badge";
import type { UnreportedLesson } from "@/lib/lessons/queries";
import { formatLessonDate, lessonTimeRange } from "@/lib/lessons/time";
import { AttendanceDialog } from "./AttendanceDialog";
import styles from "./Attendance.module.css";

// Lessons that ended in the last 30 days with no attendance report, each with a quick report button.
export function UnreportedCard({ lessons, total, showTeacher }: { lessons: UnreportedLesson[]; total: number; showTeacher: boolean }) {
  return (
    <Card>
      <div className={styles.cardHeader}>
        <h2 className="text-h3">ממתינים לדיווח נוכחות ({total})</h2>
      </div>
      {lessons.length === 0 ? (
        <p className="text-secondary">כל השיעורים שהסתיימו דווחו.</p>
      ) : (
        <ul className={styles.feed}>
          {lessons.map((l) => (
            <li key={l.id}>
              <span className={styles.feedText}>
                <span>
                  <ColorChip color={l.color}>{l.lesson_type_name}</ColorChip> {l.student_name}
                </span>
                <span className="text-small text-secondary">
                  {formatLessonDate(l.start_at)} <bdi dir="ltr">{lessonTimeRange(l.start_at, l.end_at)}</bdi>
                  {showTeacher && ` · ${l.teacher_name}`}
                </span>
              </span>
              <AttendanceDialog
                lessonId={l.id}
                context={`${l.student_name} — ${formatLessonDate(l.start_at)}`}
                triggerLabel="דיווח נוכחות"
              />
            </li>
          ))}
        </ul>
      )}
      {total > lessons.length && <p className="text-small text-secondary">מוצגים {lessons.length} מתוך {total}. אחרי דיווח, הרשימה תתעדכן.</p>}
    </Card>
  );
}
