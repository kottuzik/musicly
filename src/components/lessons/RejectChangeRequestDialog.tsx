"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { SelectField } from "@/components/ui/SelectField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { TextareaField } from "@/components/ui/TextareaField";
import stack from "@/components/ui/Stack.module.css";
import { submitWithoutReset } from "@/components/ui/submitWithoutReset";
import type { ActionState } from "@/lib/actions";
import { decideLessonChangeRequest } from "@/lib/lessons/actions";
import { schoolToday } from "@/lib/students/age";
import { TIME_OPTIONS } from "@/lib/time/weekdays";
import booking from "./BookLesson.module.css";
import styles from "./LessonChange.module.css";
import { useFocusFirstError } from "@/components/ui/useFocusFirstError";

type Props = {
  request: { id: string; version: number };
  summary: string;
};

const timeOptions = TIME_OPTIONS.map((t) => ({ value: t, label: t }));

// Turning down a teacher's request: just reject it, or reject it and suggest another time. A
// suggestion books nothing; the teacher sees it with the answer.
export function RejectChangeRequestDialog({ request, summary }: Props) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  return (
    <>
      <Button
        variant="danger"
        size="small"
        onClick={() => {
          setFormKey((k) => k + 1);
          setOpen(true);
        }}
      >
        דחייה
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="דחיית הבקשה" description={`${summary}. השיעור יישאר כפי שהוא.`}>
        <RejectForm key={formKey} request={request} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function RejectForm({ request, onDone }: { request: Props["request"]; onDone: () => void }) {
  const [choice, setChoice] = useState<"reject" | "suggest">("reject");
  const [start, setStart] = useState("");
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await decideLessonChangeRequest(prev, formData);
    if (result.ok) onDone();
    return result;
  }, {});
  const formRef = useFocusFirstError(state);
  const errors = state.fieldErrors ?? {};

  return (
    <form ref={formRef} onSubmit={submitWithoutReset(formAction)} className={stack.form} noValidate>
      <input type="hidden" name="id" value={request.id} />
      <input type="hidden" name="version" value={request.version} />
      <input type="hidden" name="decision" value="reject" />
      <input type="hidden" name="counterStart" value={choice === "suggest" ? start : ""} />

      <fieldset className={styles.scope}>
        <legend>מה לעשות?</legend>
        <label className={styles.option}>
          <input type="radio" name="choice" checked={choice === "reject"} onChange={() => setChoice("reject")} />
          <strong>לדחות את הבקשה</strong>
        </label>
        <label className={styles.option}>
          <input type="radio" name="choice" checked={choice === "suggest"} onChange={() => setChoice("suggest")} />
          <strong>להציע מועד אחר</strong>
        </label>
      </fieldset>

      {choice === "suggest" && (
        <div className={booking.row}>
          <Field label="תאריך מוצע" name="counterDate" type="date" min={schoolToday()} defaultValue="" error={errors.counterDate} />
          <SelectField
            label="שעה מוצעת"
            name="counterStartChoice"
            value={start}
            options={timeOptions}
            placeholder="בחירת שעה"
            onValueChange={setStart}
            error={errors.counterStart}
          />
        </div>
      )}

      <TextareaField label="הערה למורה (לא חובה)" name="note" maxLength={500} rows={2} error={errors.note} />
      {choice === "suggest" && (
        <p className="text-small text-secondary">ההצעה לא משבצת שום דבר. המורה תראה אותה יחד עם התשובה ותוכל לשלוח בקשה חדשה.</p>
      )}
      {state.error && <Alert tone="error">{state.error}</Alert>}

      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          ביטול
        </Button>
        <SubmitButton pending={pending} variant="danger" fullWidth={false}>
          {choice === "suggest" ? "דחה והצע מועד" : "דחה בקשה"}
        </SubmitButton>
      </DialogActions>
    </form>
  );
}
