"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Field } from "@/components/ui/Field";
import { PasswordField } from "@/components/ui/PasswordField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { submitWithoutReset } from "@/components/ui/submitWithoutReset";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation/auth";
import { register, type RegisterState } from "./actions";
import styles from "../AuthForm.module.css";
import { useFocusFirstError } from "@/components/ui/useFocusFirstError";

export function RegisterForm({ token, email, fullName }: { token: string; email: string; fullName: string }) {
  const [state, formAction, pending] = useActionState<RegisterState, FormData>(register, {});
  const formRef = useFocusFirstError(state);

  return (
    <form ref={formRef} onSubmit={submitWithoutReset(formAction)} className={styles.form} noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <input type="hidden" name="token" value={token} />
      <Field label="שם" value={fullName} readOnly />
      <Field label="אימייל" value={email} dir="ltr" readOnly autoComplete="username" />
      <PasswordField
        label="סיסמה"
        name="password"
        autoComplete="new-password"
        required
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
      <SubmitButton pending={pending} pendingText="יוצרים חשבון...">יצירת חשבון</SubmitButton>
    </form>
  );
}
