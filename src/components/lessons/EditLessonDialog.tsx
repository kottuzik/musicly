"use client";

import { useEffect, useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { SelectField } from "@/components/ui/SelectField";
import stack from "@/components/ui/Stack.module.css";
import {
  changeSeries,
  listSubstitutes,
  previewSeriesChange,
  updateLesson,
  type ChangeState,
  type SeriesChangePreview,
  type SubstituteOption,
} from "@/lib/lessons/actions";
import { LOCATION_LABELS, type LessonLocation } from "@/lib/lessons/labels";
import type { BookingOptions, LessonDetails } from "@/lib/lessons/queries";
import { addMinutes, formatLessonDate, schoolTime } from "@/lib/lessons/time";
import { schoolToday } from "@/lib/students/age";
import { TIME_OPTIONS, WEEKDAY_LABELS, dayOfWeek } from "@/lib/time/weekdays";
import booking from "./BookLesson.module.css";
import styles from "./LessonChange.module.css";
import { TeacherWeekHelp } from "./TeacherWeekHelp";
import { useTimeOptions } from "./useBusyTimes";

type Scope = "one" | "from" | "all";

const SCOPE_LABELS: Record<Scope, { title: string; hint: string }> = {
  one: { title: "רק המפגש הזה", hint: "שאר מפגשי הסדרה לא משתנים." },
  from: { title: "המפגש הזה וכל הבאים", hint: "הסדרה הנוכחית מסתיימת לפני המפגש הזה, ונפתחת סדרה חדשה." },
  all: { title: "כל המפגשים העתידיים בסדרה", hint: "שיעורים שכבר התקיימו לא משתנים." },
};

const OUTCOME_LABELS: Record<string, string> = {
  move: "יעבור",
  closed_day: "יעבור ליום סגירה (לא יתקיים)",
  past: "התאריך החדש כבר עבר — יישאר ויסומן",
  teacher_busy: "המורה תפוס — יישאר במועד הקודם ויסומן",
  student_busy: "התלמיד תפוס — יישאר במועד הקודם ויסומן",
  teacher_unavailable: "מחוץ לזמינות המורה — דרוש אישור",
};

const timeOptions = TIME_OPTIONS.map((t) => ({ value: t, label: t }));
const dayOptions = WEEKDAY_LABELS.map((label, i) => ({ value: String(i), label }));

type Props = {
  lesson: LessonDetails;
  options: BookingOptions;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Called after the change was saved (or requested), so the lesson panel can reload.
  onDone: () => void;
  // Approving a teacher's change request: the request this save answers, and the time they proposed.
  changeRequestId?: string;
  proposed?: { date: string; start: string };
};

export function EditLessonDialog(props: Props) {
  const { lesson, open, onOpenChange } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`שינוי שיעור — ${lesson.student_name}`}>
      {/* Mounted on every opening, so the form starts from the lesson's current values. */}
      {open && <EditForm {...props} />}
    </Dialog>
  );
}

function EditForm({ lesson, options, onOpenChange, onDone, changeRequestId, proposed }: Props) {
  const inSeries = Boolean(lesson.series_id) && lesson.series_status === "active";
  const [scope, setScope] = useState<Scope>("one");
  const [date, setDate] = useState(proposed?.date || lesson.occurrence_date);
  const [day, setDay] = useState(String(dayOfWeek(lesson.occurrence_date)));
  const [start, setStart] = useState(proposed?.start || schoolTime(lesson.start_at));
  const [duration, setDuration] = useState(String(lesson.duration_minutes));
  const [teacherId, setTeacherId] = useState(lesson.teacher_id);
  const [location, setLocation] = useState<LessonLocation>(lesson.location);
  const [confirmHours, setConfirmHours] = useState(false);
  const [state, setState] = useState<ChangeState>({});
  const [preview, setPreview] = useState<SeriesChangePreview | null>(null);
  const [substitutes, setSubstitutes] = useState<SubstituteOption[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    void listSubstitutes(lesson.id).then((list) => active && setSubstitutes(list));
    return () => {
      active = false;
    };
  }, [lesson.id]);

  // Any edit invalidates an earlier preview or server answer.
  function reset() {
    setState({});
    setPreview(null);
    setConfirmHours(false);
  }

  const seriesScope = scope !== "one";
  const teacherOptions = seriesScope
    ? options.teachers
        .filter((t) => t.lessonTypeIds.includes(lesson.lesson_type_id))
        .map((t) => ({ value: t.id, label: t.id === lesson.teacher_id ? `${t.name} (נוכחי)` : t.name }))
    : [
        { value: lesson.teacher_id, label: `${lesson.teacher_name} (נוכחי)` },
        ...substitutes.map((t) => ({
          value: t.id,
          label: t.available ? `${t.name} (פנוי)` : `${t.name} (פנוי — מחוץ לזמינות, יישלח אישור)`,
        })),
      ];

  const seriesInput = () => ({
    seriesId: lesson.series_id,
    fromDate: scope === "from" ? lesson.occurrence_date : schoolToday(),
    day,
    start,
    duration,
    teacherId,
    location,
    confirmOutsideHours: confirmHours,
  });

  function submit() {
    startTransition(async () => {
      if (!seriesScope) {
        const result = await updateLesson({
          lessonId: lesson.id,
          version: lesson.version,
          date,
          start,
          duration,
          teacherId,
          location,
          confirmOutsideHours: confirmHours,
          changeRequestId: changeRequestId ?? "",
        });
        setState(result);
        if (result.ok) onDone();
      } else if (!preview) {
        const result = await previewSeriesChange(seriesInput());
        setState(result);
        setPreview(result.preview ?? null);
      } else {
        const result = await changeSeries(seriesInput());
        setState(result);
        if (result.ok) onDone();
      }
    });
  }

  const errors = state.fieldErrors ?? {};
  const durationNumber = Number(duration) || 0;
  // One lesson: times already taken by the teacher or the student that day are shown but disabled.
  const singleTimeOptions = useTimeOptions(TIME_OPTIONS, durationNumber, {
    date: scope === "one" ? date : "",
    teacherId,
    studentId: lesson.student_id,
    excludeLessonId: lesson.id,
  });
  const needsConfirm = state.needsConfirm || preview?.outside_hours;

  if (state.ok) {
    return (
      <div className={stack.form}>
        <Alert tone={state.requested ? "info" : "success"}>{state.success}</Alert>
        <DialogActions>
          <Button onClick={() => onOpenChange(false)}>סיום</Button>
        </DialogActions>
      </div>
    );
  }

  return (
    <form
      className={stack.form}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {changeRequestId && <Alert tone="info">שמירה תאשר את בקשת המורה ותעדכן את השיעור.</Alert>}

      {inSeries && (
        <fieldset className={styles.scope}>
          <legend>מה לשנות?</legend>
          {(["one", "from", "all"] as const).map((s) => (
            <label key={s} className={styles.option}>
              <input
                type="radio"
                name="scope"
                checked={scope === s}
                onChange={() => {
                  setScope(s);
                  if (s === "one") setTeacherId(lesson.teacher_id);
                  reset();
                }}
              />
              <span>
                <strong>{SCOPE_LABELS[s].title}</strong>
                <br />
                <span className="text-secondary">{SCOPE_LABELS[s].hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {seriesScope ? (
        <SelectField
          label="יום בשבוע"
          name="day"
          value={day}
          options={dayOptions}
          onValueChange={(v) => {
            setDay(v);
            reset();
          }}
          error={errors.day}
        />
      ) : (
        <Field
          label="תאריך"
          name="date"
          type="date"
          min={schoolToday()}
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            reset();
          }}
          error={errors.date}
        />
      )}
      <div className={booking.row}>
        <SelectField
          label="שעת התחלה"
          name="start"
          value={start}
          options={seriesScope ? timeOptions : singleTimeOptions}
          disabled={!seriesScope && !date}
          onValueChange={(v) => {
            setStart(v);
            reset();
          }}
          error={errors.start}
        />
        <Field
          label="משך (דקות)"
          name="duration"
          type="number"
          inputMode="numeric"
          min={5}
          max={240}
          step={5}
          value={duration}
          onChange={(e) => {
            setDuration(e.target.value);
            reset();
          }}
          error={errors.duration}
        />
      </div>
      {start && durationNumber > 0 && (
        <p className="text-secondary">
          השיעור יסתיים ב־<span dir="ltr">{addMinutes(start, durationNumber)}</span>
        </p>
      )}

      <SelectField
        label="מורה"
        name="teacherId"
        value={teacherId}
        options={teacherOptions}
        onValueChange={(v) => {
          setTeacherId(v);
          reset();
        }}
        error={errors.teacherId}
      />
      {seriesScope && teacherId !== lesson.teacher_id && (
        <Alert tone="info">
          המורה החדש יהפוך גם למורה הקבוע של התלמיד בתחום, וכל הסדרות של התלמיד בתחום הזה יעברו אליו (עם הימים והשעות שלהן).
        </Alert>
      )}

      <fieldset className={booking.locations}>
        <legend>מיקום</legend>
        {(["school", "zoom"] as const).map((loc) => (
          <label key={loc} className={booking.location}>
            <input
              type="radio"
              name="location"
              value={loc}
              checked={location === loc}
              onChange={() => {
                setLocation(loc);
                reset();
              }}
            />
            {LOCATION_LABELS[loc]}
          </label>
        ))}
      </fieldset>

      <TeacherWeekHelp
        teacherId={teacherId}
        teacherName={options.teachers.find((t) => t.id === teacherId)?.name ?? lesson.teacher_name}
        options={options}
        date={seriesScope ? undefined : date}
        chosenDays={seriesScope ? [Number(day)] : date ? [dayOfWeek(date)] : []}
      />

      {preview && <SeriesPreviewTable preview={preview} />}

      {needsConfirm && (
        <Alert tone="warning">
          <p>המועד מחוץ לשעות הפעילות של בית הספר.</p>
          <label className={booking.confirm}>
            <input type="checkbox" checked={confirmHours} onChange={(e) => setConfirmHours(e.target.checked)} />
            אני מאשר/ת שיבוץ חריג מחוץ לשעות הפעילות
          </label>
        </Alert>
      )}

      {state.error && <Alert tone="error">{state.error}</Alert>}
      {!state.error && Object.keys(errors).length > 0 && (
        <Alert tone="error">חלק מהפרטים חסרים או אינם תקינים — ההסבר מופיע ליד כל שדה.</Alert>
      )}

      <DialogActions>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          ביטול
        </Button>
        {preview && (
          <Button variant="outline" onClick={reset}>
            חזרה לעריכה
          </Button>
        )}
        <Button type="submit" loading={pending} disabled={Boolean(needsConfirm) && !confirmHours}>
          {seriesScope && !preview ? "בדיקת השינוי" : "שמירה"}
        </Button>
      </DialogActions>
    </form>
  );
}

function SeriesPreviewTable({ preview }: { preview: SeriesChangePreview }) {
  const problems = preview.meetings.filter((m) => !["move", "closed_day"].includes(m.outcome));
  return (
    <div className={booking.preview} aria-live="polite">
      <p className={booking.helpTitle}>לפני השמירה</p>
      {preview.needs_request ? (
        <p>חלק מהמפגשים מחוץ לזמינות המורה: תישלח למורה בקשת אישור לכל השינוי, ושום דבר לא ישתנה עד שיאשר.</p>
      ) : (
        <p>
          {preview.meetings.length - problems.length} מפגשים יועברו.
          {problems.length > 0 && ` ${problems.length} מפגשים יישארו במועד המקורי ויסומנו ”דורש טיפול”.`}
        </p>
      )}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">עכשיו</th>
              <th scope="col">יהיה</th>
              <th scope="col">מה יקרה</th>
            </tr>
          </thead>
          <tbody>
            {preview.meetings.map((m) => (
              <tr key={m.lesson_id}>
                <td>
                  {formatLessonDate(m.old_start)} <bdi dir="ltr">{schoolTime(m.old_start)}</bdi>
                </td>
                <td>
                  {formatLessonDate(m.new_start)} <bdi dir="ltr">{schoolTime(m.new_start)}</bdi>
                </td>
                <td className={["move", "closed_day"].includes(m.outcome) ? undefined : styles.problem}>
                  {OUTCOME_LABELS[m.outcome] ?? m.outcome}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
