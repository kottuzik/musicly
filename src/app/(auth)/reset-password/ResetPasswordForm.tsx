"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Field } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation/auth";
import { updatePassword, type FormState } from "../actions";
import styles from "../AuthForm.module.css";

export function ResetPasswordForm() {
  const [state, formAction] = useActionState<FormState, FormData>(updatePassword, {});

  return (
    <form action={formAction} className={styles.form} noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <Field
        label="סיסמה חדשה"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN_LENGTH}
        hint={`לפחות ${PASSWORD_MIN_LENGTH} תווים`}
        error={state.fieldErrors?.password}
      />
      <Field
        label="אימות סיסמה"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirmPassword}
      />
      <SubmitButton pendingText="שומרים...">שמירת סיסמה</SubmitButton>
    </form>
  );
}
