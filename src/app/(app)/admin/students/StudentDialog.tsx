"use client";

import { Pencil, Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import stack from "@/components/ui/Stack.module.css";
import type { ActionState } from "@/lib/actions";
import { ageOn, isMinor, schoolToday } from "@/lib/students/age";
import { saveStudent } from "./actions";
import styles from "./Students.module.css";

export type StudentFormValues = {
  id: string;
  full_name: string;
  birth_date: string;
  phone: string | null;
  email: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  parent_email: string | null;
};

export function StudentDialog({ student }: { student?: StudentFormValues }) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  function openDialog() {
    setFormKey((k) => k + 1);
    setOpen(true);
  }

  return (
    <>
      {student ? (
        <Button variant="primary" onClick={openDialog}>
          <Pencil size={18} aria-hidden="true" />
          עריכה
        </Button>
      ) : (
        <Button onClick={openDialog}>
          <Plus size={18} aria-hidden="true" />
          תלמיד חדש
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen} title={student ? "עריכת פרטי תלמיד" : "תלמיד חדש"}>
        <StudentForm key={formKey} student={student} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function StudentForm({ student, onDone }: { student?: StudentFormValues; onDone: () => void }) {
  const [birthDate, setBirthDate] = useState(student?.birth_date ?? "");
  const [state, formAction] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await saveStudent(prev, formData);
    if (result.ok) onDone();
    return result;
  }, {});

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(birthDate) && birthDate <= schoolToday();
  const hasParentData = Boolean(student?.parent_name || student?.parent_phone || student?.parent_email);
  const showParent = (validDate && isMinor(birthDate)) || hasParentData;

  return (
    <form action={formAction} className={stack.form} noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {student && <input type="hidden" name="id" value={student.id} />}
      <Field label="שם מלא" name="fullName" required autoComplete="off" defaultValue={student?.full_name} error={state.fieldErrors?.fullName} />
      <Field
        label="תאריך לידה"
        name="birthDate"
        type="date"
        required
        max={schoolToday()}
        value={birthDate}
        onChange={(e) => setBirthDate(e.target.value)}
        hint={validDate ? `גיל: ${ageOn(birthDate)}` : "הגיל יחושב אוטומטית מתאריך הלידה."}
        error={state.fieldErrors?.birthDate}
      />
      <Field
        label="טלפון (לא חובה)"
        name="phone"
        type="tel"
        dir="ltr"
        inputMode="tel"
        autoComplete="off"
        defaultValue={student?.phone ?? ""}
        error={state.fieldErrors?.phone}
      />
      <Field
        label="אימייל (לא חובה)"
        name="email"
        type="email"
        dir="ltr"
        inputMode="email"
        autoComplete="off"
        defaultValue={student?.email ?? ""}
        error={state.fieldErrors?.email}
      />

      {showParent ? (
        <fieldset className={styles.parent}>
          <legend className="text-body-lg">פרטי הורה (לא חובה)</legend>
          {validDate && isMinor(birthDate) && <p className="text-small text-secondary">התלמיד קטין — אפשר לשמור פרטי קשר של הורה.</p>}
          <Field label="שם ההורה" name="parentName" autoComplete="off" defaultValue={student?.parent_name ?? ""} error={state.fieldErrors?.parentName} />
          <Field
            label="טלפון ההורה"
            name="parentPhone"
            type="tel"
            dir="ltr"
            inputMode="tel"
            autoComplete="off"
            defaultValue={student?.parent_phone ?? ""}
            error={state.fieldErrors?.parentPhone}
          />
          <Field
            label="אימייל ההורה"
            name="parentEmail"
            type="email"
            dir="ltr"
            inputMode="email"
            autoComplete="off"
            defaultValue={student?.parent_email ?? ""}
            error={state.fieldErrors?.parentEmail}
          />
        </fieldset>
      ) : (
        <>
          <input type="hidden" name="parentName" value="" />
          <input type="hidden" name="parentPhone" value="" />
          <input type="hidden" name="parentEmail" value="" />
        </>
      )}

      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          ביטול
        </Button>
        <SubmitButton fullWidth={false} pendingText="שומרים...">
          שמירה
        </SubmitButton>
      </DialogActions>
    </form>
  );
}
