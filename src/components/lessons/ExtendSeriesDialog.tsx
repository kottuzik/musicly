"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import stack from "@/components/ui/Stack.module.css";
import { extendSeries, previewSeriesExtend } from "@/lib/lessons/actions";
import { SKIP_REASON_LABELS } from "@/lib/lessons/labels";
import type { LessonDetails } from "@/lib/lessons/queries";
import { formatDay, schoolToday } from "@/lib/students/age";
import { addDays } from "@/lib/time/weekdays";
import booking from "./BookLesson.module.css";
import styles from "./LessonChange.module.css";

type Preview = { create: number; restore: number; problems: { date: string; reason: string }[] };

type Props = {
  lesson: LessonDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
};

// An active series with an end date: move or remove the end. A stopped series: resume it from a later date.
export function ExtendSeriesDialog(props: Props) {
  const resuming = props.lesson.series_status !== "active";
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={resuming ? "חידוש הסדרה" : "הארכת הסדרה"}
      description={
        resuming
          ? "המפגשים שבוטלו בהפסקה יחזרו כשהמועד פנוי. השבועות שבין ההפסקה לחידוש לא ייווצרו."
          : "אפשר לדחות את תאריך הסיום או להסיר אותו."
      }
    >
      {props.open && <ExtendForm {...props} resuming={resuming} />}
    </Dialog>
  );
}

function ExtendForm({ lesson, onOpenChange, onDone, resuming }: Props & { resuming: boolean }) {
  const [resumeFrom, setResumeFrom] = useState(addDays(schoolToday(), 7));
  const [noEnd, setNoEnd] = useState(false);
  const [endDate, setEndDate] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string>();
  const [pending, startTransition] = useTransition();

  const input = () => ({
    seriesId: lesson.series_id,
    endDate: noEnd ? "" : endDate,
    resumeFrom: resuming ? resumeFrom : "",
  });

  function reset() {
    setPreview(null);
    setError(undefined);
    setFieldErrors({});
  }

  function submit() {
    startTransition(async () => {
      if (!preview) {
        const result = await previewSeriesExtend(input());
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        setPreview(result.preview ?? null);
      } else {
        const result = await extendSeries(input());
        setError(result.error);
        if (result.ok) {
          setDone(result.success);
          onDone();
        }
      }
    });
  }

  if (done) {
    return (
      <div className={stack.form}>
        <Alert tone="success">{done}</Alert>
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
      {resuming && (
        <Field
          label="חידוש מתאריך"
          name="resumeFrom"
          type="date"
          min={addDays(schoolToday(), 1)}
          value={resumeFrom}
          onChange={(e) => {
            setResumeFrom(e.target.value);
            reset();
          }}
          error={fieldErrors.resumeFrom}
        />
      )}
      {!noEnd && (
        <Field
          label={resuming ? "תאריך סיום חדש (לא חובה)" : "תאריך סיום חדש"}
          name="endDate"
          type="date"
          min={resuming ? resumeFrom : lesson.series_end_date ? addDays(lesson.series_end_date, 1) : undefined}
          value={endDate}
          onChange={(e) => {
            setEndDate(e.target.value);
            reset();
          }}
          error={fieldErrors.endDate}
        />
      )}
      <label className={styles.option}>
        <input
          type="checkbox"
          checked={noEnd}
          onChange={(e) => {
            setNoEnd(e.target.checked);
            reset();
          }}
        />
        <span>ללא תאריך סיום</span>
      </label>

      {preview && (
        <div className={booking.preview} aria-live="polite">
          <p className={booking.helpTitle}>לפני השמירה</p>
          <p>
            ייווצרו {preview.create} מפגשים חדשים
            {resuming && `, ויחזרו ${preview.restore} מפגשים שבוטלו בהפסקה`}.
          </p>
          {preview.problems.length > 0 && (
            <>
              <p>תאריכים בעייתיים שלא ייווצרו:</p>
              <ul className={booking.skipped}>
                {preview.problems.map((p) => (
                  <li key={p.date}>
                    {formatDay(p.date)} — {SKIP_REASON_LABELS[p.reason] ?? p.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {error && <Alert tone="error">{error}</Alert>}
      <DialogActions>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          ביטול
        </Button>
        <Button type="submit" loading={pending}>
          {preview ? "אישור" : "בדיקת הסדרה"}
        </Button>
      </DialogActions>
    </form>
  );
}
