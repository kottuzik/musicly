"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { useFieldErrors } from "@/components/ui/useFieldErrors";
import stack from "@/components/ui/Stack.module.css";
import { submitWithoutReset } from "@/components/ui/submitWithoutReset";
import type { ActionState } from "@/lib/actions";
import { addCustomClosure } from "./actions";
import { useFocusFirstError } from "@/components/ui/useFocusFirstError";

export function CustomClosureDialog({ today }: { today: string }) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  return (
    <>
      <Button
        onClick={() => {
          setFormKey((k) => k + 1);
          setOpen(true);
        }}
      >
        <Plus size={18} aria-hidden="true" />
        יום סגירה מיוחד
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="יום סגירה מיוחד" description="יום אחד או כמה ימים ברצף שבהם בית הספר סגור.">
        <ClosureForm key={formKey} today={today} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

// Fields are controlled so their values survive a failed submit (React resets uncontrolled form fields).
function ClosureForm({ today, onDone }: { today: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const { errors, setErrors, clear } = useFieldErrors();
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await addCustomClosure(prev, formData);
    setErrors(result.fieldErrors ?? {});
    if (result.ok) onDone();
    return result;
  }, {});
  const formRef = useFocusFirstError(state);

  return (
    <form ref={formRef} onSubmit={submitWithoutReset(formAction)} className={stack.form} noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <Field
        label="שם"
        name="name"
        required
        maxLength={100}
        placeholder="למשל: חופשת קיץ"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          clear("name");
        }}
        error={errors.name}
      />
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
      <p className="text-small text-secondary">שיעורים שכבר נקבעו בימים האלה יסומנו ”לא מתקיים – יום סגירה”.</p>
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          ביטול
        </Button>
        <SubmitButton pending={pending} fullWidth={false} pendingText="שומרים...">
          שמירה
        </SubmitButton>
      </DialogActions>
    </form>
  );
}
