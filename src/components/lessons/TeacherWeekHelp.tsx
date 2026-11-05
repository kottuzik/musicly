"use client";

import { useEffect, useMemo, useState } from "react";
import { getTeacherLessons, type WeekLesson } from "@/lib/lessons/actions";
import type { BookingOptions } from "@/lib/lessons/queries";
import { weekStart } from "@/lib/lessons/time";
import { formatDay, schoolToday } from "@/lib/students/age";
import { WEEKDAY_LABELS, addDays, timeRange } from "@/lib/time/weekdays";
import styles from "./BookLesson.module.css";

type Props = {
  teacherId: string;
  teacherName: string;
  options: Pick<BookingOptions, "slots" | "hours" | "myTeacherId">;
  // A date: shows that week with dates and the availability valid then. No date: the coming week.
  date?: string;
  // Weekdays being chosen, highlighted in the table.
  chosenDays: number[];
};

// The teacher's week next to the school's hours: their availability and the lessons already
// booked, so a new time can be picked inside it (a time outside it needs the teacher's approval).
export function TeacherWeekHelp({ teacherId, teacherName, options, date, chosenDays }: Props) {
  const weekFrom = weekStart(date || schoolToday());
  const [weekLessons, setWeekLessons] = useState<WeekLesson[]>([]);

  useEffect(() => {
    let active = true;
    void getTeacherLessons({ teacherId, from: weekFrom, to: addDays(weekFrom, 6) }).then((list) => active && setWeekLessons(list));
    return () => {
      active = false;
    };
  }, [teacherId, weekFrom]);

  const view = useMemo(() => {
    const today = schoolToday();
    const chosen = new Set(chosenDays);
    const rows = [0, 1, 2, 3, 4, 5, 6].map((d) => {
      const day = addDays(weekFrom, d);
      const onDate = date ? day : today;
      const slots = options.slots
        .filter((s) => s.teacher_id === teacherId && s.day_of_week === d)
        .filter((s) => (date ? s.valid_from <= onDate : true) && (!s.valid_to || s.valid_to >= onDate))
        .map((s) => timeRange(s.start_time, s.end_time));
      const booked = weekLessons.filter((l) => l.date === day).map((l) => `${l.start}–${l.end}`);
      const hours = options.hours.find((h) => h.day_of_week === d);
      return {
        key: d,
        day: WEEKDAY_LABELS[d],
        date: date ? formatDay(day).slice(0, 5) : null,
        chosen: chosen.has(d),
        slots: slots.length ? slots.join(", ") : null,
        booked: booked.length ? booked.join(", ") : null,
        hours: hours ? timeRange(hours.open_time, hours.close_time) : "סגור",
      };
    });
    const anyAvailability = options.slots.some((s) => s.teacher_id === teacherId && (!s.valid_to || s.valid_to >= today));
    return { rows, anyAvailability };
  }, [teacherId, date, chosenDays, options.slots, options.hours, weekFrom, weekLessons]);

  return (
    <div className={styles.help} aria-live="polite">
      <p className={styles.helpTitle}>זמינות {teacherName} ושעות הפעילות</p>
      {!view.anyAvailability && (
        <p>
          {teacherId === options.myTeacherId ? (
            <strong>עדיין לא הגדרת זמינות שבועית. אפשר להגדיר אותה במסך „ההוראה שלי”.</strong>
          ) : (
            <>
              <strong>למורה לא הוגדרה זמינות שבועית.</strong> כל מועד שתבחרו יישלח למורה לאישור. אפשר להגדיר לו זמינות בדף המורה,
              בלשונית „זמינות”.
            </>
          )}
        </p>
      )}
      <table className={styles.weekTable}>
        <thead>
          <tr>
            <th scope="col">יום</th>
            <th scope="col">זמינות</th>
            <th scope="col">שיעורים קיימים</th>
            <th scope="col">בית הספר</th>
          </tr>
        </thead>
        <tbody>
          {view.rows.map((a) => (
            <tr key={a.key} className={a.chosen ? styles.chosenDay : undefined}>
              <th scope="row">
                {a.day}
                {a.date && <span className={styles.weekDate}> {a.date}</span>}
              </th>
              <td>{a.slots ? <bdi dir="ltr">{a.slots}</bdi> : <span className="text-secondary">אין</span>}</td>
              <td>{a.booked ? <bdi dir="ltr">{a.booked}</bdi> : <span className="text-secondary">—</span>}</td>
              <td>
                <bdi dir="ltr">{a.hours}</bdi>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-secondary">
        {teacherId === options.myTeacherId
          ? "זה שיבוץ שלך: מועד מחוץ לזמינות שלך ייקבע מיד."
          : "מועד מחוץ לזמינות יישלח למורה לאישור, והשעה לא תישמר עד שיאשר."}
      </p>
    </div>
  );
}
