"use client";

import { useActionState } from "react";
import { ReminderOffsetsFields } from "@/components/notifications/ReminderOffsetsFields";
import { Alert } from "@/components/ui/Alert";
import { ChoiceGroup } from "@/components/ui/ChoiceGroup";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { submitWithoutReset } from "@/components/ui/submitWithoutReset";
import type { ActionState } from "@/lib/actions";
import { saveNotificationChannel, saveReminderPreferences } from "@/lib/notifications/actions";
import notifications from "@/components/notifications/Notifications.module.css";
import stack from "@/components/ui/Stack.module.css";
import { useFocusFirstError } from "@/components/ui/useFocusFirstError";

export function ChannelForm({ channel, email, readOnly }: { channel: "in_app" | "in_app_email"; email: string; readOnly: boolean }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveNotificationChannel, {});
  const formRef = useFocusFirstError(state);
  return (
    <form ref={formRef} onSubmit={submitWithoutReset(formAction)} className={stack.formNarrow} noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}
      <ChoiceGroup
        legend="איך לקבל התראות?"
        name="channel"
        type="radio"
        defaultValue={[channel]}
        options={[
          { value: "in_app", label: "בתוך המערכת בלבד" },
          { value: "in_app_email", label: "בתוך המערכת וגם באימייל" },
        ]}
        error={state.fieldErrors?.channel}
      />
      <p className="text-secondary">
        אימיילים יישלחו לכתובת <bdi dir="ltr">{email}</bdi>. ההתראה תמיד נשמרת גם בתוך המערכת.
      </p>
      {!readOnly && (
        <div>
          <SubmitButton pending={pending} fullWidth={false} pendingText="שומרים...">
            שמירה
          </SubmitButton>
        </div>
      )}
    </form>
  );
}

export function ReminderForm({ enabled, offsets }: { enabled: boolean; offsets: number[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveReminderPreferences, {});
  const formRef = useFocusFirstError(state);
  return (
    <form ref={formRef} onSubmit={submitWithoutReset(formAction)} className={stack.formNarrow} noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}
      <label className={notifications.checkboxLine}>
        <input type="checkbox" name="enabled" defaultChecked={enabled} />
        <span>לשלוח לי תזכורות לפני שיעורים</span>
      </label>
      <p className="text-secondary">
        התזכורות כבויות כברירת מחדל. אפשר לבחור כמה מועדים, ולשנות אותם לשיעור מסוים מתוך פרטי השיעור בלוח השנה.
      </p>
      <ReminderOffsetsFields offsets={offsets} errors={state.fieldErrors} />
      <div>
        <SubmitButton pending={pending} fullWidth={false} pendingText="שומרים...">
          שמירה
        </SubmitButton>
      </div>
    </form>
  );
}
