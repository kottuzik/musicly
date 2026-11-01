"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Field } from "@/components/ui/Field";
import { PasswordField } from "@/components/ui/PasswordField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { submitWithoutReset } from "@/components/ui/submitWithoutReset";
import type { ActionState } from "@/lib/actions";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation/auth";
import stack from "@/components/ui/Stack.module.css";
import { changePassword, updateOwnProfile } from "./actions";

type Details = { fullName: string; email: string; phone: string; roleLabel: string; readOnly: boolean };

export function DetailsForm({ details }: { details: Details }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateOwnProfile, {});
  return (
    <form onSubmit={submitWithoutReset(formAction)} className={stack.formNarrow} noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}
      {details.readOnly && <Alert tone="info">החשבון אינו פעיל, ולכן לא ניתן לעדכן פרטים.</Alert>}
      <Field
        label="שם מלא"
        name="fullName"
        required
        autoComplete="name"
        defaultValue={details.fullName}
        readOnly={details.readOnly}
        error={state.fieldErrors?.fullName}
      />
      <Field label="אימייל" value={details.email} dir="ltr" readOnly hint="לשינוי כתובת האימייל פנו למנהל." />
      <Field
        label="טלפון"
        name="phone"
        type="tel"
        dir="ltr"
        autoComplete="tel"
        defaultValue={details.phone}
        readOnly={details.readOnly}
        error={state.fieldErrors?.phone}
      />
      <Field label="תפקיד" value={details.roleLabel} readOnly />
      {!details.readOnly && (
        <div>
          <SubmitButton pending={pending} fullWidth={false} pendingText="שומרים...">
            שמירה
          </SubmitButton>
        </div>
      )}
    </form>
  );
}

export function PasswordForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(changePassword, {});
  return (
    // key resets the fields after a successful change
    <form key={state.success} onSubmit={submitWithoutReset(formAction)} className={stack.formNarrow} noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}
      <input type="hidden" name="username" value={email} autoComplete="username" />
      <PasswordField
        label="סיסמה נוכחית"
        name="currentPassword"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.currentPassword}
      />
      <PasswordField
        label="סיסמה חדשה"
        name="password"
        autoComplete="new-password"
        required
        hint={`לפחות ${PASSWORD_MIN_LENGTH} תווים`}
        error={state.fieldErrors?.password}
      />
      <PasswordField
        label="אימות סיסמה חדשה"
        name="confirmPassword"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirmPassword}
      />
      <div>
        <SubmitButton pending={pending} fullWidth={false} pendingText="מעדכנים...">
          עדכון סיסמה
        </SubmitButton>
      </div>
    </form>
  );
}
