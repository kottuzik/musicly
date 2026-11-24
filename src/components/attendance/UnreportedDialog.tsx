"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ColorChip } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import type { UnreportedLesson } from "@/lib/lessons/queries";
import { formatLessonDate, lessonTimeRange } from "@/lib/lessons/time";
import { AttendanceDialog } from "./AttendanceDialog";
import styles from "./Attendance.module.css";

// A notification title that opens a floating window with the lessons still waiting for an attendance
// report (oldest first), each with a button to report it.
export function UnreportedDialog({ title, lessons, onOpen }: { title: string; lessons: UnreportedLesson[]; onOpen?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const oldestFirst = [...lessons].reverse();

  return (
    <>
      <button
        type="button"
        className={`${styles.linkButton} text-body`}
        onClick={() => {
          setOpen(true);
          onOpen?.();
        }}
      >
        {title}
      </button>
      <Dialog open={open} onOpenChange={setOpen} title="שיעורים שממתינים לדיווח נוכחות">
        {oldestFirst.length === 0 ? (
          <p className="text-secondary" role="status">
            כל השיעורים שהסתיימו דווחו.
          </p>
        ) : (
          <ul className={styles.feed}>
            {oldestFirst.map((l) => (
              <li key={l.id}>
                <span className={styles.feedText}>
                  <span>
                    <ColorChip color={l.color}>{l.lesson_type_name}</ColorChip> {l.student_name}
                  </span>
                  <span className="text-small text-secondary">
                    {formatLessonDate(l.start_at)} <bdi dir="ltr">{lessonTimeRange(l.start_at, l.end_at)}</bdi>
                  </span>
                </span>
                <AttendanceDialog
                  lessonId={l.id}
                  context={`${l.student_name} — ${formatLessonDate(l.start_at)}`}
                  triggerLabel="דיווח נוכחות"
                  onDone={() => router.refresh()}
                />
              </li>
            ))}
          </ul>
        )}
      </Dialog>
    </>
  );
}
