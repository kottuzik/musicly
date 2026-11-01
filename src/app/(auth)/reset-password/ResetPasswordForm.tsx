"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { PasswordField } from "@/components/ui/PasswordField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { submitWithoutReset } from "@/components/ui/submitWithoutReset";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation/auth";
import { updatePassword, type FormState } from "../actions";
import styles from "../AuthForm.module.css";

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(updatePassword, {});

  return (
    <form onSubmit={submitWithoutReset(formAction)} className={styles.form} noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <PasswordField
        label="סיסמה חדשה"
        name="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN_LENGTH}
        hint={`לפחות ${PASSWORD_MIN_LENGTH} תווים`}
        error={state.fieldErrors?.password}
      />
      <PasswordField
        label="אימות סיסמה"
        name="confirmPassword"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirmPassword}
      />
      <SubmitButton pending={pending} pendingText="שומרים...">שמירת סיסמה</SubmitButton>
    </form>
  );
}
