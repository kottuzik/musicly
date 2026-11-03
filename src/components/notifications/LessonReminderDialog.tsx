"use client";

import { useActionState, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ChoiceGroup } from "@/components/ui/ChoiceGroup";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { submitWithoutReset } from "@/components/ui/submitWithoutReset";
import type { ActionState } from "@/lib/actions";
import { getLessonReminder, saveLessonReminder } from "@/lib/notifications/actions";
import { describeOffset } from "@/lib/notifications/reminders";
import { ReminderOffsetsFields } from "./ReminderOffsetsFields";
import styles from "./Notifications.module.css";

type Mode = "default" | "off" | "custom";
type Info = Awaited<ReturnType<typeof getLessonReminder>>;

// A teacher's reminder setting for one upcoming lesson: follow the general preference, no reminder
// for this lesson, or times just for it (which also work while the general reminders are off).
export function LessonReminderDialog({ lessonId }: { lessonId: string }) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<Info | null>(null);
  const [mode, setMode] = useState<Mode>("default");
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveLessonReminder, {});

  useEffect(() => {
    if (!open) return;
    let active = true;
    void getLessonReminder(lessonId).then((data) => {
      if (!active) return;
      setInfo(data);
      setMode(data.override?.mode ?? "default");
    });
    return () => {
      active = false;
    };
  }, [open, lessonId]);

  const general = info?.general;
  const generalText = !general?.enabled
    ? "התזכורות הכלליות כבויות, ולכן לא תישלח תזכורת לשיעור הזה."
    : `לפי ההעדפה הכללית: ${general.offsets.map(describeOffset).join(", ")} לפני השיעור.`;

  return (
    <>
      <Button variant="ghost" size="small" onClick={() => setOpen(true)}>
        תזכורת לשיעור
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="תזכורת לשיעור הזה">
        {!info ? (
          <p className="text-secondary">טוענים...</p>
        ) : (
          <form onSubmit={submitWithoutReset(formAction)} className={styles.reminderBox} noValidate>
            {state.error && <Alert tone="error">{state.error}</Alert>}
            {state.success && <Alert tone="success">{state.success}</Alert>}
            <input type="hidden" name="lessonId" value={lessonId} />
            <ChoiceGroup
              legend="תזכורת לשיעור הזה"
              name="mode"
              type="radio"
              value={[mode]}
              onChange={(v) => setMode((v[0] as Mode) ?? "default")}
              options={[
                { value: "default", label: "לפי ההעדפה הכללית" },
                { value: "off", label: "בלי תזכורת לשיעור הזה" },
                { value: "custom", label: "מועדים מיוחדים לשיעור הזה" },
              ]}
              error={state.fieldErrors?.mode}
            />
            {mode === "default" && <p className="text-secondary">{generalText}</p>}
            {mode === "custom" && <ReminderOffsetsFields offsets={info.override?.offsets ?? []} errors={state.fieldErrors} />}
            <DialogActions>
              <Button variant="outline" onClick={() => setOpen(false)}>
                סגירה
              </Button>
              <SubmitButton pending={pending} fullWidth={false} pendingText="שומרים...">
                שמירה
              </SubmitButton>
            </DialogActions>
          </form>
        )}
      </Dialog>
    </>
  );
}
