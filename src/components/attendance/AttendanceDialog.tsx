"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { ChoiceGroup } from "@/components/ui/ChoiceGroup";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { SubmitButton } from "@/components/ui/SubmitButton";
import stack from "@/components/ui/Stack.module.css";
import { TextareaField } from "@/components/ui/TextareaField";
import type { ActionState } from "@/lib/actions";
import { setAttendance } from "@/lib/lessons/actions";
import { ATTENDANCE_LABELS, ATTENDANCE_STATUSES, type AttendanceStatus } from "@/lib/lessons/labels";
import { useFocusFirstError } from "@/components/ui/useFocusFirstError";

type Props = {
  lessonId: string;
  // What the dialog is about, e.g. "נועה כהן — יום שלישי, 14/05/2026".
  context: string;
  // The current report, if any (version is the one the form was opened on).
  current?: { status: AttendanceStatus; note: string | null; version: number } | null;
  triggerLabel?: string;
  triggerVariant?: ButtonVariant;
  onDone?: () => void;
};

const options = ATTENDANCE_STATUSES.map((value) => ({ value, label: ATTENDANCE_LABELS[value].label }));

// Report or correct a lesson's attendance. Saves are checked against the version shown, so a
// correction made by someone else in the meantime is reported instead of silently overwritten.
export function AttendanceDialog({ lessonId, context, current, triggerLabel, triggerVariant = "outline", onDone }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={triggerVariant} size="small" onClick={() => setOpen(true)}>
        {triggerLabel ?? (current ? "תיקון נוכחות" : "דיווח נוכחות")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="נוכחות בשיעור" description={context}>
        {open && (
          <AttendanceForm
            lessonId={lessonId}
            current={current}
            onClose={() => setOpen(false)}
            onDone={() => {
              setOpen(false);
              onDone?.();
            }}
          />
        )}
      </Dialog>
    </>
  );
}

function AttendanceForm({
  lessonId,
  current,
  onClose,
  onDone,
}: Pick<Props, "lessonId" | "current"> & { onClose: () => void; onDone: () => void }) {
  const [state, formAction] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await setAttendance(prev, formData);
    if (result.ok) onDone();
    return result;
  }, {});
  const formRef = useFocusFirstError(state);
  const errors = state.fieldErrors ?? {};

  return (
    <form ref={formRef} action={formAction} className={stack.form} noValidate>
      <input type="hidden" name="lessonId" value={lessonId} />
      <input type="hidden" name="version" value={current ? String(current.version) : ""} />
      <ChoiceGroup
        legend="מה קרה בשיעור?"
        name="status"
        type="radio"
        options={options}
        defaultValue={current ? [current.status] : []}
        error={errors.status}
      />
      <TextareaField label="הערה (לא חובה)" name="note" maxLength={500} rows={3} defaultValue={current?.note ?? ""} error={errors.note} />
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <DialogActions>
        <Button variant="ghost" onClick={onClose}>
          ביטול
        </Button>
        <SubmitButton fullWidth={false}>שמירה</SubmitButton>
      </DialogActions>
    </form>
  );
}
