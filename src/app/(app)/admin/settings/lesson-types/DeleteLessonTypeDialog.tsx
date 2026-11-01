"use client";

import { useActionState, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { SubmitButton } from "@/components/ui/SubmitButton";
import stack from "@/components/ui/Stack.module.css";
import type { ActionState } from "@/lib/actions";
import { deleteLessonType, getLessonTypeDeleteInfo, type LessonTypeDeleteInfo } from "./actions";
import styles from "./DeleteLessonType.module.css";

// Deleting a lesson type. With teachers assigned, it can be removed from all of them in the same
// action after explicit confirmation; enrolled students, lessons, or a teacher's only subject block it.
export function DeleteLessonTypeDialog({ lessonType }: { lessonType: { id: string; name: string } }) {
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
        מחיקה
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title={`מחיקת התחום „${lessonType.name}”`}>
        <DeleteForm key={formKey} id={lessonType.id} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function DeleteForm({ id, onDone }: { id: string; onDone: () => void }) {
  const [info, setInfo] = useState<LessonTypeDeleteInfo | null | "error">(null);
  const [confirmed, setConfirmed] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await deleteLessonType(prev, formData);
    if (result.ok) onDone();
    return result;
  }, {});

  useEffect(() => {
    void getLessonTypeDeleteInfo(id).then((data) => setInfo(data ?? "error"));
  }, [id]);

  if (info === null) return <p className="text-secondary">בודקים שיוכים...</p>;
  if (info === "error") return <Alert tone="error">לא ניתן לטעון את פרטי התחום. רעננו את הדף ונסו שוב.</Alert>;

  const onlySkill = info.teachers.filter((t) => t.only_skill);
  const blockers = [
    info.students > 0 && `רשומים לתחום ${info.students} תלמידים. הסירו קודם את התחום מהתלמידים (בדף כל תלמיד).`,
    info.lessons > 0 && "קיימים שיעורים, סדרות או בקשות שיבוץ בתחום הזה, ולכן לא ניתן למחוק אותו.",
    onlySkill.length > 0 &&
      `זה התחום היחיד של: ${onlySkill.map((t) => t.name).join(", ")}. הוסיפו להם תחום הוראה אחר קודם.`,
  ].filter((b): b is string => Boolean(b));
  const hasTeachers = info.teachers.length > 0;

  return (
    <form action={formAction} className={stack.form}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="removeFromTeachers" value={String(hasTeachers && confirmed)} />
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {blockers.length > 0 ? (
        <Alert tone="warning">
          <p>לא ניתן למחוק את התחום כרגע:</p>
          <ul className={styles.list}>
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </Alert>
      ) : hasTeachers ? (
        <>
          <p>התחום משויך למורים הבאים, ויוסר מכולם יחד עם המחיקה:</p>
          <ul className={styles.list}>
            {info.teachers.map((t) => (
              <li key={t.id}>{t.name}</li>
            ))}
          </ul>
          <label className={styles.confirm}>
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            הסרת התחום מכל המורים ומחיקתו
          </label>
          <p className="text-secondary">לא ניתן לבטל פעולה זו.</p>
        </>
      ) : (
        <p>התחום יימחק מהמערכת. לא ניתן לבטל פעולה זו.</p>
      )}
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          ביטול
        </Button>
        {blockers.length === 0 && (
          <SubmitButton pending={pending} fullWidth={false} variant="danger" disabled={hasTeachers && !confirmed}>
            מחיקה
          </SubmitButton>
        )}
      </DialogActions>
    </form>
  );
}
