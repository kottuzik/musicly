"use client";

import { Pencil } from "lucide-react";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ChoiceGroup } from "@/components/ui/ChoiceGroup";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { TextareaField } from "@/components/ui/TextareaField";
import stack from "@/components/ui/Stack.module.css";
import type { ActionState } from "@/lib/actions";
import { updateProfessionalInfo } from "@/lib/students/actions";
import { LEVELS, LEVEL_LABELS, type StudentLevel } from "@/lib/students/labels";

type Props = { studentId: string; subjectId: string; subjectName: string; level: StudentLevel; background: string | null };

// Level and professional background of one enrollment — the only student data a teacher may edit.
export function ProfessionalInfoDialog(props: Props) {
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
        <Pencil size={16} aria-hidden="true" />
        עריכת מידע מקצועי
        <span className="visually-hidden"> — {props.subjectName}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title={`מידע מקצועי: ${props.subjectName}`}>
        <ProfessionalInfoForm key={formKey} {...props} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function ProfessionalInfoForm({ studentId, subjectId, level, background, onDone }: Props & { onDone: () => void }) {
  const [state, formAction] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await updateProfessionalInfo(prev, formData);
    if (result.ok) onDone();
    return result;
  }, {});

  return (
    <form action={formAction} className={stack.form} noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <input type="hidden" name="id" value={subjectId} />
      <input type="hidden" name="studentId" value={studentId} />
      <ChoiceGroup
        legend="רמה"
        name="level"
        type="radio"
        options={LEVELS.map((l) => ({ value: l, label: LEVEL_LABELS[l] }))}
        defaultValue={[level]}
        error={state.fieldErrors?.level}
      />
      <TextareaField
        label="רקע מקצועי (לא חובה)"
        name="background"
        maxLength={2000}
        defaultValue={background ?? ""}
        error={state.fieldErrors?.background}
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
