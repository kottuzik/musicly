"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import choice from "@/components/ui/ChoiceGroup.module.css";
import stack from "@/components/ui/Stack.module.css";
import type { ActionState } from "@/lib/actions";
import { schoolToday } from "@/lib/students/age";
import { RETURN_MODE_LABELS, type ReturnMode } from "@/lib/students/labels";
import { setStudentStatus } from "./actions";
import styles from "./Students.module.css";

type Props = {
  studentId: string;
  // Present when editing the return date of a student who is already inactive.
  current?: { returnDate: string | null; returnMode: ReturnMode | null };
};

// Makes a student inactive, optionally with an expected return date. A return date requires
// choosing notify/auto: neither option is preselected (PRD §4.3).
export function StudentStatusDialog({ studentId, current }: Props) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  return (
    <>
      <Button
        variant="outline"
        size="small"
        onClick={() => {
          setFormKey((k) => k + 1);
          setOpen(true);
        }}
      >
        {current ? "עדכון תאריך חזרה" : "הפוך ללא פעיל"}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={current ? "עדכון תאריך חזרה משוער" : "הפיכת התלמיד ללא פעיל"}
        description={
          current
            ? undefined
            : "תלמיד לא פעיל נשאר במערכת עם כל הפרטים שלו. בחזרה לפעילות יידרש שיבוץ חדש."
        }
      >
        <StatusForm key={formKey} studentId={studentId} current={current} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function StatusForm({ studentId, current, onDone }: Props & { onDone: () => void }) {
  const [returnDate, setReturnDate] = useState(current?.returnDate ?? "");
  const [state, formAction] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await setStudentStatus(prev, formData);
    if (result.ok) onDone();
    return result;
  }, {});
  const modeError = state.fieldErrors?.returnMode;

  return (
    <form action={formAction} className={stack.form} noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <input type="hidden" name="id" value={studentId} />
      <input type="hidden" name="status" value="inactive" />
      <Field
        label="תאריך חזרה משוער (לא חובה)"
        name="returnDate"
        type="date"
        min={schoolToday()}
        value={returnDate}
        onChange={(e) => setReturnDate(e.target.value)}
        hint="אפשר להשאיר ריק אם לא ידוע מתי התלמיד יחזור."
        error={state.fieldErrors?.returnDate}
      />
      {returnDate && (
        <fieldset
          className={choice.fieldset}
          aria-invalid={modeError ? true : undefined}
          aria-describedby={modeError ? "returnMode-error" : undefined}
        >
          <legend className={choice.legend}>מה יקרה בתאריך החזרה? (חובה לבחור)</legend>
          <div className={choice.options}>
            {(Object.keys(RETURN_MODE_LABELS) as ReturnMode[]).map((mode) => (
              <label key={mode} className={`${choice.option} ${styles.longOption}`}>
                <input type="radio" name="returnMode" value={mode} defaultChecked={current?.returnMode === mode} />
                <span>
                  <strong>{RETURN_MODE_LABELS[mode].label}</strong>
                  <br />
                  <span className="text-small text-secondary">{RETURN_MODE_LABELS[mode].description}</span>
                </span>
              </label>
            ))}
          </div>
          {modeError && (
            <p id="returnMode-error" className={choice.error}>
              {modeError}
            </p>
          )}
        </fieldset>
      )}
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          ביטול
        </Button>
        <SubmitButton fullWidth={false} pendingText="שומרים...">
          {current ? "שמירה" : "הפוך ללא פעיל"}
        </SubmitButton>
      </DialogActions>
    </form>
  );
}
