"use client";

import { Pencil, Plus } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ChoiceGroup } from "@/components/ui/ChoiceGroup";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { submitWithoutReset } from "@/components/ui/submitWithoutReset";
import type { ActionState } from "@/lib/actions";
import stack from "@/components/ui/Stack.module.css";
import { createLessonTypeInline } from "../settings/lesson-types/actions";
import { saveTeacher } from "./actions";
import styles from "./TeacherDialog.module.css";

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
        <TeacherForm key={formKey} teacher={teacher} lessonTypes={lessonTypes} onDone={() => setOpen(false)} />
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
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await saveTeacher(prev, formData);
    if (result.ok) onDone();
    return result;
  }, {});
  // Lesson types added from this dialog join the list and are selected at once.
  const [types, setTypes] = useState(lessonTypes);
  const [selected, setSelected] = useState<string[]>(teacher?.lessonTypeIds ?? []);

  return (
    <form onSubmit={submitWithoutReset(formAction)} className={stack.form} noValidate>
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
      {types.length > 0 ? (
        <ChoiceGroup
          legend="תחומי הוראה (אפשר לבחור כמה)"
          name="lessonTypeIds"
          type="checkbox"
          options={types.map((lt) => ({ value: lt.id, label: lt.name }))}
          value={selected}
          onChange={setSelected}
          error={state.fieldErrors?.lessonTypeIds}
        />
      ) : (
        <Alert tone="info">עדיין לא הוגדרו תחומי לימוד. הוסיפו תחום חדש כאן.</Alert>
      )}
      <NewLessonType
        onCreated={(lt) => {
          setTypes((list) => [...list, lt].sort((a, b) => a.name.localeCompare(b.name, "he")));
          setSelected((list) => [...list, lt.id]);
        }}
      />
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

// Short form for a new lesson type (name and default duration; the color is assigned automatically).
// Not a nested <form>: it submits through a server action called directly.
function NewLessonType({ onCreated }: { onCreated: (lt: LessonTypeOption) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [duration, setDuration] = useState("45");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    const formData = new FormData();
    formData.set("name", name);
    formData.set("defaultDurationMinutes", duration);
    startTransition(async () => {
      const result = await createLessonTypeInline(formData);
      setErrors(result.fieldErrors ?? (result.error ? { name: result.error } : {}));
      if (result.lessonType) {
        onCreated(result.lessonType);
        setMessage(`התחום „${result.lessonType.name}” נוסף ונבחר למורה.`);
        setName("");
        setOpen(false);
      }
    });
  }

  if (!open) {
    return (
      <div className={styles.newType}>
        {message && <p className={styles.added} role="status">{message}</p>}
        <Button variant="outline" size="small" onClick={() => { setOpen(true); setMessage(null); }}>
          <Plus size={16} aria-hidden="true" />
          הוספת תחום חדש
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.newTypeForm} role="group" aria-label="תחום לימוד חדש">
      <div className={styles.newTypeFields}>
        <Field
          label="שם התחום"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          autoComplete="off"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Field
          label="משך שיעור (דקות)"
          type="number"
          inputMode="numeric"
          min={5}
          max={240}
          step={5}
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          error={errors.defaultDurationMinutes}
        />
      </div>
      <p className="text-small text-secondary">הצבע בלוח השנה ייקבע אוטומטית.</p>
      <div className={styles.newTypeActions}>
        <Button variant="ghost" size="small" onClick={() => setOpen(false)}>
          ביטול
        </Button>
        <Button variant="secondary" size="small" loading={pending} onClick={add}>
          הוספת התחום
        </Button>
      </div>
    </div>
  );
}
