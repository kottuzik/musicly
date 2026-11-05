"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { ChoiceGroup } from "@/components/ui/ChoiceGroup";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { submitWithoutReset } from "@/components/ui/submitWithoutReset";
import type { ActionState } from "@/lib/actions";
import { enableTeaching } from "@/lib/teaching/actions";
import stack from "@/components/ui/Stack.module.css";

export type TeachingLessonType = { id: string; name: string; color: string };

// Chooses the subjects an admin teaches. Saving also turns teaching on.
export function TeachingForm({
  profileId,
  lessonTypes,
  selected,
  submitLabel,
  onDone,
}: {
  profileId: string;
  lessonTypes: TeachingLessonType[];
  selected: string[];
  submitLabel: string;
  onDone?: () => void;
}) {
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await enableTeaching(prev, formData);
    if (result.ok) onDone?.();
    return result;
  }, {});

  if (!lessonTypes.length) return <p className="text-secondary">עדיין לא הוגדרו תחומי לימוד. אפשר להוסיף אותם בהגדרות.</p>;

  return (
    <form onSubmit={submitWithoutReset(formAction)} className={stack.formNarrow} noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.success && !onDone && <Alert tone="success">{state.success}</Alert>}
      <input type="hidden" name="id" value={profileId} />
      <ChoiceGroup
        legend="תחומי הוראה (אפשר לבחור כמה)"
        name="lessonTypeIds"
        type="checkbox"
        options={lessonTypes.map((lt) => ({ value: lt.id, label: lt.name }))}
        defaultValue={selected}
        error={state.fieldErrors?.lessonTypeIds}
      />
      <div>
        <SubmitButton pending={pending} fullWidth={false} pendingText="שומרים...">
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}
