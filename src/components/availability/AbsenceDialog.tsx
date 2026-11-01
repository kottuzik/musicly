"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { SelectField } from "@/components/ui/SelectField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { TextareaField } from "@/components/ui/TextareaField";
import { useFieldErrors } from "@/components/ui/useFieldErrors";
import choice from "@/components/ui/ChoiceGroup.module.css";
import stack from "@/components/ui/Stack.module.css";
import { submitWithoutReset } from "@/components/ui/submitWithoutReset";
import type { ActionState } from "@/lib/actions";
import { reportAbsence } from "@/lib/availability/actions";
import { timesWithin, type Hours } from "@/lib/availability/slots";
import { WEEKDAY_LABELS, dayOfWeek } from "@/lib/time/weekdays";
import type { Mode } from "./WeeklyAvailability";
import styles from "./Availability.module.css";

type Props = { mode: Mode; teacherId: string; today: string; hours: Hours[] };

// A one-time absence: whole days (from–to) or hours on a single day.
export function AbsenceDialog(props: Props) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const teacher = props.mode === "teacher";
  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setFormKey((k) => k + 1);
          setOpen(true);
        }}
      >
        <Plus size={18} aria-hidden="true" />
        {teacher ? "דיווח היעדרות" : "הוספת היעדרות"}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={teacher ? "דיווח על היעדרות" : "הוספת היעדרות"}
        description={
          teacher
            ? "הבקשה תישלח למנהלים, וההיעדרות תיכנס לתוקף רק אחרי אישור."
            : "ההיעדרות תיכנס לתוקף מיד ותתועד בשמך."
        }
      >
        <AbsenceForm key={formKey} {...props} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

// Fields are controlled so their values survive a failed submit (React resets uncontrolled form fields).
function AbsenceForm({ mode, teacherId, today, hours, onDone }: Props & { onDone: () => void }) {
  const [kind, setKind] = useState<"" | "days" | "hours">("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reason, setReason] = useState("");
  const { errors, setErrors, clear } = useFieldErrors();
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await reportAbsence(prev, formData);
    setErrors(result.fieldErrors ?? {});
    if (result.ok) onDone();
    return result;
  }, {});

  // Hours are offered only within the school's operating hours on the chosen date.
  const day = startDate ? dayOfWeek(startDate) : null;
  const open = day === null ? undefined : hours.find((h) => h.day_of_week === day);
  const times = open ? timesWithin(open) : [];
  const startOptions = times.slice(0, -1).map((t) => ({ value: t, label: t }));
  const endOptions = times.filter((t) => t > (startTime || times[0])).map((t) => ({ value: t, label: t }));

  return (
    <form onSubmit={submitWithoutReset(formAction)} className={stack.form} noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <input type="hidden" name="teacherId" value={teacherId} />
      <fieldset
        className={choice.fieldset}
        aria-invalid={errors.mode ? true : undefined}
        aria-describedby={errors.mode ? "mode-error" : undefined}
      >
        <legend className={choice.legend}>משך ההיעדרות</legend>
        <div className={choice.options}>
          {(
            [
              ["days", "ימים שלמים"],
              ["hours", "שעות ביום אחד"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className={choice.option}>
              <input
                type="radio"
                name="mode"
                value={value}
                checked={kind === value}
                onChange={() => {
                  setKind(value);
                  // The other mode's fields (and their errors) no longer apply.
                  setErrors({});
                }}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        {errors.mode && (
          <p id="mode-error" className={choice.error}>
            {errors.mode}
          </p>
        )}
      </fieldset>
      {kind === "days" && (
        <div className={styles.row}>
          <Field
            label="מתאריך"
            name="startDate"
            type="date"
            min={today}
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              clear("startDate", "endDate");
            }}
            error={errors.startDate}
          />
          <Field
            label="עד תאריך"
            name="endDate"
            type="date"
            min={startDate || today}
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              clear("endDate");
            }}
            error={errors.endDate}
          />
        </div>
      )}
      {kind === "hours" && (
        <>
          <Field
            label="תאריך"
            name="startDate"
            type="date"
            min={today}
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setStartTime("");
              setEndTime("");
              clear("startDate", "startTime", "endTime");
            }}
            error={errors.startDate}
          />
          {startDate && !open ? (
            <Alert tone="info">בית הספר סגור ביום {WEEKDAY_LABELS[day!]}, ולכן אין שעות לבחירה. בחרו תאריך אחר או ימים שלמים.</Alert>
          ) : (
            <div className={styles.row}>
              <SelectField
                key={`start-${startDate}`}
                label="משעה"
                name="startTime"
                placeholder="התחלה"
                options={startOptions}
                defaultValue={startTime}
                onValueChange={(v) => {
                  setStartTime(v);
                  if (endTime && endTime <= v) setEndTime("");
                  clear("startTime", "endTime");
                }}
                error={errors.startTime}
              />
              <SelectField
                key={`end-${startDate}-${startTime}`}
                label="עד שעה"
                name="endTime"
                placeholder="סיום"
                options={endOptions}
                defaultValue={endTime}
                onValueChange={(v) => {
                  setEndTime(v);
                  clear("endTime");
                }}
                error={errors.endTime}
              />
            </div>
          )}
        </>
      )}
      <TextareaField
        label="סיבה (לא חובה)"
        name="reason"
        maxLength={500}
        rows={2}
        value={reason}
        onChange={(e) => {
          setReason(e.target.value);
          clear("reason");
        }}
        error={errors.reason}
      />
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          ביטול
        </Button>
        <SubmitButton pending={pending} fullWidth={false} pendingText="שולחים...">
          {mode === "teacher" ? "שליחת בקשה" : "שמירה"}
        </SubmitButton>
      </DialogActions>
    </form>
  );
}
