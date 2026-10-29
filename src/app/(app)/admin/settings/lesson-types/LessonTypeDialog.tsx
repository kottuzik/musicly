"use client";

import { Pencil, Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ChoiceGroup } from "@/components/ui/ChoiceGroup";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import type { ActionState } from "@/lib/actions";
import { LESSON_TYPE_COLORS } from "@/lib/lesson-types/colors";
import stack from "@/components/ui/Stack.module.css";
import { createLessonType, updateLessonType } from "./actions";

type LessonType = { id: string; name: string; default_duration_minutes: number; color: string };

export function LessonTypeDialog({ lessonType }: { lessonType?: LessonType }) {
  const editing = Boolean(lessonType);
  const [open, setOpen] = useState(false);
  // Remount the form on every open so old errors and values are cleared.
  const [formKey, setFormKey] = useState(0);

  function openDialog() {
    setFormKey((k) => k + 1);
    setOpen(true);
  }

  return (
    <>
      {editing ? (
        <Button variant="ghost" size="small" onClick={openDialog} aria-label={`עריכת ${lessonType!.name}`}>
          <Pencil size={16} aria-hidden="true" />
          עריכה
        </Button>
      ) : (
        <Button onClick={openDialog}>
          <Plus size={18} aria-hidden="true" />
          תחום חדש
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen} title={editing ? "עריכת תחום לימוד" : "תחום לימוד חדש"}>
        <LessonTypeForm key={formKey} lessonType={lessonType} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function LessonTypeForm({ lessonType, onDone }: { lessonType?: LessonType; onDone: () => void }) {
  const [state, formAction] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await (lessonType ? updateLessonType : createLessonType)(prev, formData);
    if (result.ok) onDone();
    return result;
  }, {});


  return (
    <form action={formAction} className={stack.form} noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {lessonType && <input type="hidden" name="id" value={lessonType.id} />}
      <Field label="שם התחום" name="name" required maxLength={60} defaultValue={lessonType?.name} error={state.fieldErrors?.name} />
      <Field
        label="משך שיעור ברירת מחדל (דקות)"
        name="defaultDurationMinutes"
        type="number"
        inputMode="numeric"
        min={5}
        max={240}
        step={5}
        required
        defaultValue={lessonType?.default_duration_minutes ?? 45}
        error={state.fieldErrors?.defaultDurationMinutes}
        hint={lessonType ? "השינוי יחול על שיעורים חדשים. טיפול בשיעורים קיימים יתווסף בהמשך." : undefined}
      />
      {lessonType ? (
        <ChoiceGroup
          legend="צבע בלוח השנה"
          name="color"
          type="radio"
          variant="swatches"
          options={LESSON_TYPE_COLORS.map((c) => ({ value: c.value, label: c.label, color: c.value }))}
          defaultValue={[LESSON_TYPE_COLORS.find((c) => c.value.toLowerCase() === lessonType.color.toLowerCase())?.value ?? lessonType.color]}
          error={state.fieldErrors?.color}
        />
      ) : (
        <p className="text-secondary">צבע לתצוגה בלוח השנה יוקצה אוטומטית, ואפשר לשנות אותו בעריכה.</p>
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
