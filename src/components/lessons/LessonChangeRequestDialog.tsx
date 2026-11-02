"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { SelectField } from "@/components/ui/SelectField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import stack from "@/components/ui/Stack.module.css";
import { TextareaField } from "@/components/ui/TextareaField";
import type { ActionState } from "@/lib/actions";
import { requestLessonChange } from "@/lib/lessons/actions";
import type { LessonDetails } from "@/lib/lessons/queries";
import { schoolToday } from "@/lib/students/age";
import { addDays, TIME_OPTIONS } from "@/lib/time/weekdays";
import booking from "./BookLesson.module.css";
import styles from "./LessonChange.module.css";

const timeOptions = [{ value: "", label: "ללא הצעה" }, ...TIME_OPTIONS.map((t) => ({ value: t, label: t }))];

type Props = {
  lesson: LessonDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
};

// A teacher asks an admin to change or cancel one of their lessons (until the day before).
export function LessonChangeRequestDialog(props: Props) {
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title="בקשת שינוי או ביטול"
      description="הבקשה נשלחת למנהל. השיעור נשאר כפי שהוא עד שהמנהל יענה."
    >
      {props.open && <RequestForm {...props} />}
    </Dialog>
  );
}

function RequestForm({ lesson, onOpenChange, onDone }: Props) {
  const [kind, setKind] = useState<"cancel" | "change">("cancel");
  const [start, setStart] = useState("");
  const [state, formAction] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await requestLessonChange(prev, formData);
    if (result.ok) onDone();
    return result;
  }, {});

  if (state.ok) {
    return (
      <div className={stack.form}>
        <Alert tone="success">{state.success}</Alert>
        <DialogActions>
          <Button onClick={() => onOpenChange(false)}>סיום</Button>
        </DialogActions>
      </div>
    );
  }

  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} className={stack.form} noValidate>
      <input type="hidden" name="lessonId" value={lesson.id} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="start" value={start} />

      <fieldset className={styles.scope}>
        <legend>מה לבקש?</legend>
        {(["cancel", "change"] as const).map((k) => (
          <label key={k} className={styles.option}>
            <input type="radio" name="kindChoice" checked={kind === k} onChange={() => setKind(k)} />
            <strong>{k === "cancel" ? "ביטול השיעור" : "שינוי מועד"}</strong>
          </label>
        ))}
      </fieldset>

      {kind === "change" && (
        <div className={booking.row}>
          <Field
            label="תאריך מוצע (לא חובה)"
            name="date"
            type="date"
            min={addDays(schoolToday(), 1)}
            defaultValue=""
            error={errors.date}
          />
          <SelectField
            label="שעה מוצעת"
            name="startChoice"
            value={start}
            options={timeOptions}
            onValueChange={setStart}
            error={errors.start}
          />
        </div>
      )}

      <TextareaField label="סיבה (לא חובה)" name="reason" maxLength={500} error={errors.reason} />
      {state.error && <Alert tone="error">{state.error}</Alert>}

      <DialogActions>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          ביטול
        </Button>
        <SubmitButton fullWidth={false}>שליחת הבקשה</SubmitButton>
      </DialogActions>
    </form>
  );
}
