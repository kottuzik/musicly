"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { SelectField } from "@/components/ui/SelectField";
import stack from "@/components/ui/Stack.module.css";
import { restoreLesson, type ChangeState } from "@/lib/lessons/actions";
import type { LessonDetails } from "@/lib/lessons/queries";
import { formatLessonDate, schoolTime } from "@/lib/lessons/time";
import { schoolToday } from "@/lib/students/age";
import { TIME_OPTIONS } from "@/lib/time/weekdays";
import booking from "./BookLesson.module.css";
import styles from "./LessonChange.module.css";
import { useTimeOptions } from "./useBusyTimes";


type Props = {
  lesson: LessonDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
};

export function RestoreLessonDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange} title={`שחזור שיעור — ${props.lesson.student_name}`}>
      {props.open && <RestoreForm {...props} />}
    </Dialog>
  );
}

function RestoreForm({ lesson, onOpenChange, onDone }: Props) {
  const [other, setOther] = useState(false);
  const [date, setDate] = useState(lesson.occurrence_date);
  const [start, setStart] = useState(schoolTime(lesson.start_at));
  const [confirmHours, setConfirmHours] = useState(false);
  const [state, setState] = useState<ChangeState>({});
  const [pending, startTransition] = useTransition();
  const otherTimeOptions = useTimeOptions(TIME_OPTIONS, lesson.duration_minutes, {
    date: other ? date : "",
    teacherId: lesson.teacher_id,
    studentId: lesson.student_id,
    excludeLessonId: lesson.id,
  });

  function submit(override?: { date: string; start: string }) {
    startTransition(async () => {
      const chosen = override ?? (other ? { date, start } : { date: "", start: "" });
      const result = await restoreLesson({
        id: lesson.id,
        version: lesson.version,
        date: chosen.date,
        start: chosen.start,
        confirmOutsideHours: confirmHours,
      });
      setState(result);
      if (result.ok) onDone();
    });
  }

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

  const errors = state.fieldErrors ?? {};
  return (
    <form
      className={stack.form}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <fieldset className={styles.scope}>
        <legend>באיזה מועד לשחזר?</legend>
        <label className={styles.option}>
          <input type="radio" name="when" checked={!other} onChange={() => setOther(false)} />
          <span>
            <strong>במועד המקורי</strong>
            <br />
            <span className="text-secondary">
              {formatLessonDate(lesson.start_at)} <bdi dir="ltr">{schoolTime(lesson.start_at)}</bdi>
            </span>
          </span>
        </label>
        <label className={styles.option}>
          <input type="radio" name="when" checked={other} onChange={() => setOther(true)} />
          <strong>במועד אחר</strong>
        </label>
      </fieldset>

      {other && (
        <div className={booking.row}>
          <Field
            label="תאריך"
            name="date"
            type="date"
            min={schoolToday()}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setState({});
            }}
            error={errors.date}
          />
          <SelectField
            label="שעת התחלה"
            name="start"
            value={start}
            options={otherTimeOptions}
            disabled={!date}
            onValueChange={(v) => {
              setStart(v);
              setState({});
            }}
            error={errors.start}
          />
        </div>
      )}

      {state.suggestions && state.suggestions.length > 0 && (
        <div>
          <p className={booking.helpTitle}>שעות פנויות באותו יום:</p>
          <div className={styles.suggestions}>
            {state.suggestions.map((time) => (
              <Button
                key={time}
                variant="outline"
                size="small"
                onClick={() => {
                  const day = other ? date : lesson.occurrence_date;
                  setOther(true);
                  setDate(day);
                  setStart(time);
                  submit({ date: day, start: time });
                }}
              >
                <bdi dir="ltr">{time}</bdi>
              </Button>
            ))}
          </div>
        </div>
      )}

      {state.needsConfirm && (
        <Alert tone="warning">
          <p>המועד מחוץ לשעות הפעילות של בית הספר.</p>
          <label className={booking.confirm}>
            <input type="checkbox" checked={confirmHours} onChange={(e) => setConfirmHours(e.target.checked)} />
            אני מאשר/ת שחזור חריג מחוץ לשעות הפעילות
          </label>
        </Alert>
      )}
      {state.error && <Alert tone="error">{state.error}</Alert>}

      <DialogActions>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          ביטול
        </Button>
        <Button type="submit" loading={pending} disabled={state.needsConfirm && !confirmHours}>
          שחזור השיעור
        </Button>
      </DialogActions>
    </form>
  );
}
