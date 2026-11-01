"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Badge, ColorChip } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import stack from "@/components/ui/Stack.module.css";
import { getLessonDetails } from "@/lib/lessons/actions";
import { LESSON_STATUS_LABELS, LOCATION_LABELS } from "@/lib/lessons/labels";
import type { LessonDetails } from "@/lib/lessons/queries";
import { formatLessonDate, lessonTimeRange } from "@/lib/lessons/time";
import { formatDay } from "@/lib/students/age";
import { WEEKDAY_LABELS, shortTime } from "@/lib/time/weekdays";

// Read-only lesson panel. Editing, cancelling and restoring come with Milestone 6.
export function LessonDetailsDialog({ lessonId, onClose }: { lessonId: string | null; onClose: () => void }) {
  const [lesson, setLesson] = useState<LessonDetails | null | "missing">(null);

  useEffect(() => {
    if (!lessonId) return;
    let active = true;
    void getLessonDetails(lessonId).then((data) => {
      if (active) setLesson(data ?? "missing");
    });
    return () => {
      active = false;
      setLesson(null);
    };
  }, [lessonId]);

  const minutes = lesson && lesson !== "missing"
    ? Math.round((new Date(lesson.end_at).getTime() - new Date(lesson.start_at).getTime()) / 60000)
    : 0;

  return (
    <Dialog
      open={lessonId !== null}
      onOpenChange={(open) => !open && onClose()}
      title={lesson && lesson !== "missing" ? `שיעור ${lesson.lesson_type_name}` : "פרטי שיעור"}
    >
      {lesson === null && <p className="text-secondary">טוענים...</p>}
      {lesson === "missing" && <Alert tone="error">השיעור לא נמצא. ייתכן שהוא שונה בינתיים.</Alert>}
      {lesson && lesson !== "missing" && (
        <dl className={stack.details}>
          <dt>תלמיד</dt>
          <dd>{lesson.student_name}</dd>
          <dt>מורה</dt>
          <dd>
            {lesson.teacher_name}
            {lesson.is_substitute && <> (מורה מחליף)</>}
          </dd>
          <dt>תחום</dt>
          <dd>
            <ColorChip color={lesson.color}>{lesson.lesson_type_name}</ColorChip>
          </dd>
          <dt>תאריך</dt>
          <dd>{formatLessonDate(lesson.start_at)}</dd>
          <dt>שעה</dt>
          <dd>
            <bdi dir="ltr">{lessonTimeRange(lesson.start_at, lesson.end_at)}</bdi>
          </dd>
          <dt>משך</dt>
          <dd>{minutes} דקות</dd>
          <dt>מיקום</dt>
          <dd>{LOCATION_LABELS[lesson.location]}</dd>
          <dt>סטטוס</dt>
          <dd>
            <Badge tone={LESSON_STATUS_LABELS[lesson.status].tone}>{LESSON_STATUS_LABELS[lesson.status].label}</Badge>
            {lesson.outside_hours && <> · שובץ מחוץ לשעות הפעילות</>}
          </dd>
          <dt>סוג</dt>
          <dd>
            {lesson.series_id && lesson.series_day !== null
              ? `סדרה שבועית — יום ${WEEKDAY_LABELS[lesson.series_day]} בשעה ${shortTime(lesson.series_start_time ?? "")}, ${
                  lesson.series_end_date ? `עד ${formatDay(lesson.series_end_date)}` : "ללא תאריך סיום"
                }`
              : "שיעור בודד"}
          </dd>
        </dl>
      )}
    </Dialog>
  );
}
