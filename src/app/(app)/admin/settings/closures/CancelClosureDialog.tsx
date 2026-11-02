"use client";

import { useActionState, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { SubmitButton } from "@/components/ui/SubmitButton";
import stack from "@/components/ui/Stack.module.css";
import type { ActionState } from "@/lib/actions";
import { formatLessonDate, lessonTimeRange } from "@/lib/lessons/time";
import { cancelClosure, getClosureImpact, type ClosureLesson } from "./actions";
import styles from "./Closures.module.css";

type Props = { id: string; name: string };

// Cancelling a closure day: the lessons that were marked "not held" can come back, one by one.
export function CancelClosureDialog({ id, name }: Props) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  return (
    <>
      <Button
        variant="ghost"
        size="small"
        onClick={() => {
          setFormKey((k) => k + 1);
          setOpen(true);
        }}
      >
        ביטול
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`ביטול יום הסגירה „${name}”`}
        description="בית הספר ייחשב פתוח בימים אלה."
      >
        {open && <CancelForm key={formKey} id={id} onDone={() => setOpen(false)} />}
      </Dialog>
    </>
  );
}

function CancelForm({ id, onDone }: { id: string; onDone: () => void }) {
  const [lessons, setLessons] = useState<ClosureLesson[] | null>(null);
  const [restore, setRestore] = useState<Set<string>>(new Set());
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await cancelClosure(prev, formData);
    if (result.ok && !result.success) onDone();
    return result;
  }, {});

  useEffect(() => {
    let active = true;
    void getClosureImpact(id).then((list) => {
      if (!active) return;
      setLessons(list);
      setRestore(new Set(list.filter((l) => l.free).map((l) => l.lessonId)));
    });
    return () => {
      active = false;
    };
  }, [id]);

  if (state.ok && state.success) {
    return (
      <div className={stack.form}>
        <Alert tone="success">{state.success}</Alert>
        <DialogActions>
          <Button onClick={onDone}>סגירה</Button>
        </DialogActions>
      </div>
    );
  }

  return (
    <form action={formAction} className={stack.form} noValidate>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="choose" value="true" />
      {lessons === null && <p className="text-secondary">בודקים אילו שיעורים מושפעים...</p>}
      {lessons && lessons.length === 0 && <p className="text-secondary">אין שיעורים עתידיים שסומנו „לא מתקיים” בגלל היום הזה.</p>}
      {lessons && lessons.length > 0 && (
        <fieldset className={styles.restoreList}>
          <legend>אילו שיעורים לשחזר? השאר יבוטלו.</legend>
          {lessons.map((l) => (
            <label key={l.lessonId} className={styles.restoreItem}>
              <input
                type="checkbox"
                name="restore"
                value={l.lessonId}
                disabled={!l.free}
                checked={restore.has(l.lessonId)}
                onChange={(e) =>
                  setRestore((set) => {
                    const next = new Set(set);
                    if (e.target.checked) next.add(l.lessonId);
                    else next.delete(l.lessonId);
                    return next;
                  })
                }
              />
              <span>
                {l.studentName} — {l.lessonTypeName} ({l.teacherName}), {formatLessonDate(l.startAt)}{" "}
                <bdi dir="ltr">{lessonTimeRange(l.startAt, l.endAt)}</bdi>
                {!l.free && <span className="text-secondary"> — המועד נתפס בינתיים, אי אפשר לשחזר</span>}
                {state.failedId === l.lessonId && <span className={styles.restoreError}> — לא ניתן היה לשחזר</span>}
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          לא לבטל
        </Button>
        <SubmitButton pending={pending} fullWidth={false} variant="danger" pendingText="מבטלים...">
          ביטול יום הסגירה
        </SubmitButton>
      </DialogActions>
    </form>
  );
}
