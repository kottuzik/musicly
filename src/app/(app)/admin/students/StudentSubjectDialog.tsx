"use client";

import { Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ChoiceGroup } from "@/components/ui/ChoiceGroup";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { TextareaField } from "@/components/ui/TextareaField";
import stack from "@/components/ui/Stack.module.css";
import type { ActionState } from "@/lib/actions";
import { LEVELS, LEVEL_LABELS, type StudentLevel } from "@/lib/students/labels";
import { saveStudentSubject } from "./actions";

export type TeacherOption = { id: string; full_name: string; active: boolean; lessonTypeIds: string[] };
type LessonTypeOption = { id: string; name: string };

export type SubjectFormValues = {
  id: string;
  lessonTypeId: string;
  lessonTypeName: string;
  teacherId: string;
  level: StudentLevel;
  background: string | null;
};

type Props = {
  studentId: string;
  // Lesson types the student is not enrolled in yet (for a new enrollment).
  availableLessonTypes: LessonTypeOption[];
  teachers: TeacherOption[];
  subject?: SubjectFormValues;
};

export function StudentSubjectDialog(props: Props) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const { subject, availableLessonTypes } = props;

  return (
    <>
      {subject ? (
        <Button
          variant="ghost"
          size="small"
          aria-label={`עריכת תחום ${subject.lessonTypeName}`}
          onClick={() => {
            setFormKey((k) => k + 1);
            setOpen(true);
          }}
        >
          <Pencil size={16} aria-hidden="true" />
          עריכה
        </Button>
      ) : (
        <Button
          onClick={() => {
            setFormKey((k) => k + 1);
            setOpen(true);
          }}
        >
          <Plus size={18} aria-hidden="true" />
          הוספת תחום
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen} title={subject ? `עריכת תחום: ${subject.lessonTypeName}` : "הוספת תחום לימוד"}>
        {!subject && availableLessonTypes.length === 0 ? (
          <Alert tone="info">
            התלמיד כבר רשום לכל תחומי הלימוד. אפשר להוסיף תחומים חדשים ב<Link href="/admin/settings/lesson-types">הגדרות</Link>.
          </Alert>
        ) : (
          <SubjectForm key={formKey} {...props} onDone={() => setOpen(false)} />
        )}
      </Dialog>
    </>
  );
}

function SubjectForm({ studentId, availableLessonTypes, teachers, subject, onDone }: Props & { onDone: () => void }) {
  const [lessonTypeId, setLessonTypeId] = useState(subject?.lessonTypeId ?? "");
  const [state, formAction] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await saveStudentSubject(prev, formData);
    if (result.ok) onDone();
    return result;
  }, {});

  // Active teachers of the chosen subject; the current regular teacher stays selectable even if inactive.
  const teacherOptions = teachers
    .filter((t) => t.lessonTypeIds.includes(lessonTypeId) && (t.active || t.id === subject?.teacherId))
    .map((t) => ({ value: t.id, label: t.active ? t.full_name : `${t.full_name} (לא פעיל)` }));

  return (
    <form action={formAction} className={stack.form} noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <input type="hidden" name="studentId" value={studentId} />
      {subject ? (
        <>
          <input type="hidden" name="id" value={subject.id} />
          <input type="hidden" name="lessonTypeId" value={subject.lessonTypeId} />
        </>
      ) : (
        <SelectField
          label="תחום לימוד"
          name="lessonTypeId"
          placeholder="בחרו תחום"
          options={availableLessonTypes.map((lt) => ({ value: lt.id, label: lt.name }))}
          onValueChange={setLessonTypeId}
          error={state.fieldErrors?.lessonTypeId}
        />
      )}

      {lessonTypeId &&
        (teacherOptions.length ? (
          <SelectField
            key={lessonTypeId}
            label="מורה קבוע"
            name="teacherId"
            placeholder="בחרו מורה"
            defaultValue={subject?.teacherId ?? (teacherOptions.length === 1 ? teacherOptions[0].value : "")}
            options={teacherOptions}
            error={state.fieldErrors?.teacherId}
          />
        ) : (
          <Alert tone="warning">
            אין מורה פעיל שמלמד את התחום הזה. <Link href="/admin/teachers">מעבר למורים</Link>
          </Alert>
        ))}

      <ChoiceGroup
        legend="רמה"
        name="level"
        type="radio"
        options={LEVELS.map((l) => ({ value: l, label: LEVEL_LABELS[l] }))}
        defaultValue={subject ? [subject.level] : []}
        error={state.fieldErrors?.level}
      />
      <TextareaField
        label="רקע מקצועי (לא חובה)"
        name="background"
        maxLength={2000}
        defaultValue={subject?.background ?? ""}
        placeholder="למשל: ניסיון קודם, יצירות שלמד, מטרות"
        error={state.fieldErrors?.background}
      />
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          ביטול
        </Button>
        <SubmitButton fullWidth={false} pendingText="שומרים..." disabled={Boolean(lessonTypeId) && !teacherOptions.length}>
          שמירה
        </SubmitButton>
      </DialogActions>
    </form>
  );
}
