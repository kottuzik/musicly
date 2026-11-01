import { Video } from "lucide-react";
import { ColorChip } from "@/components/ui/Badge";
import { LOCATION_LABELS } from "@/lib/lessons/labels";
import type { CalendarLesson } from "@/lib/lessons/queries";
import { formatLessonDate, schoolDate, schoolTime } from "@/lib/lessons/time";
import styles from "./UpcomingLessons.module.css";

// Compact list for the home pages. With `showDate`, lessons on later days show their date.
export function UpcomingLessons({
  lessons,
  showTeacher,
  showDate = false,
  empty,
}: {
  lessons: CalendarLesson[];
  showTeacher: boolean;
  showDate?: boolean;
  empty: string;
}) {
  if (!lessons.length) return <p className="text-secondary">{empty}</p>;
  return (
    <ul className={styles.list}>
      {lessons.map((l, i) => {
        const newDay = i === 0 || schoolDate(l.start_at) !== schoolDate(lessons[i - 1].start_at);
        const heading = showDate && newDay ? formatLessonDate(l.start_at) : null;
        return (
          <li key={l.id} className={styles.itemWrap}>
            {heading && <p className={styles.date}>{heading}</p>}
            <div className={styles.item}>
              <span className={styles.time} dir="ltr">
                {schoolTime(l.start_at)}
              </span>
              <div className={styles.body}>
                <span className={styles.title}>
                  <ColorChip color={l.color}>{l.lesson_type_name}</ColorChip> {l.student_name}
                </span>
                <span className="text-small text-secondary">
                  {showTeacher && <>{l.teacher_name} · </>}
                  עד <span dir="ltr">{schoolTime(l.end_at)}</span> ·{" "}
                  {l.location === "zoom" ? (
                    <span className={styles.zoom}>
                      <Video size={12} aria-hidden="true" /> {LOCATION_LABELS.zoom}
                    </span>
                  ) : (
                    LOCATION_LABELS.school
                  )}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
