"use client";

import { Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ChoiceGroup } from "@/components/ui/ChoiceGroup";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import type { ActionState } from "@/lib/actions";
import stack from "@/components/ui/Stack.module.css";
import { saveTeacher } from "./actions";

export type TeacherFormValues = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  lessonTypeIds: string[];
  registered: boolean;
};

type LessonTypeOption = { id: string; name: string; color: string };

export function TeacherDialog({ teacher, lessonTypes }: { teacher?: TeacherFormValues; lessonTypes: LessonTypeOption[] }) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  function openDialog() {
    setFormKey((k) => k + 1);
    setOpen(true);
  }

  return (
    <>
      {teacher ? (
        <Button variant="primary" onClick={openDialog}>
          <Pencil size={18} aria-hidden="true" />
          עריכה
        </Button>
      ) : (
        <Button onClick={openDialog}>
          <Plus size={18} aria-hidden="true" />
          מורה חדש
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen} title={teacher ? "עריכת פרטי מורה" : "מורה חדש"}>
        {lessonTypes.length === 0 ? (
          <Alert tone="warning">
            כדי להוסיף מורה צריך קודם להגדיר תחומי לימוד.{" "}
            <Link href="/admin/settings/lesson-types">מעבר לתחומי לימוד</Link>
          </Alert>
        ) : (
          <TeacherForm key={formKey} teacher={teacher} lessonTypes={lessonTypes} onDone={() => setOpen(false)} />
        )}
      </Dialog>
    </>
  );
}

function TeacherForm({
  teacher,
  lessonTypes,
  onDone,
}: {
  teacher?: TeacherFormValues;
  lessonTypes: LessonTypeOption[];
  onDone: () => void;
}) {
  const [state, formAction] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await saveTeacher(prev, formData);
    if (result.ok) onDone();
    return result;
  }, {});


  return (
    <form action={formAction} className={stack.form} noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {teacher && <input type="hidden" name="id" value={teacher.id} />}
      <Field label="שם מלא" name="fullName" required autoComplete="off" defaultValue={teacher?.full_name} error={state.fieldErrors?.fullName} />
      <Field
        label="אימייל"
        name="email"
        type="email"
        dir="ltr"
        inputMode="email"
        autoComplete="off"
        required
        defaultValue={teacher?.email}
        readOnly={teacher?.registered}
        hint={teacher?.registered ? "המורה כבר נרשם, ולכן לא ניתן לשנות את האימייל." : "לכתובת זו יישלח קישור ההרשמה."}
        error={state.fieldErrors?.email}
      />
      <Field
        label="טלפון (לא חובה)"
        name="phone"
        type="tel"
        dir="ltr"
        inputMode="tel"
        autoComplete="off"
        defaultValue={teacher?.phone ?? ""}
        error={state.fieldErrors?.phone}
      />
      <ChoiceGroup
        legend="תחומי הוראה (אפשר לבחור כמה)"
        name="lessonTypeIds"
        type="checkbox"
        options={lessonTypes.map((lt) => ({ value: lt.id, label: lt.name }))}
        defaultValue={teacher?.lessonTypeIds}
        error={state.fieldErrors?.lessonTypeIds}
      />
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
