"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Field } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation/auth";
import { register, type RegisterState } from "./actions";
import styles from "../AuthForm.module.css";

export function RegisterForm({ token, email, fullName }: { token: string; email: string; fullName: string }) {
  const [state, formAction] = useActionState<RegisterState, FormData>(register, {});

  return (
    <form action={formAction} className={styles.form} noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <input type="hidden" name="token" value={token} />
      <Field label="שם" value={fullName} readOnly />
      <Field label="אימייל" value={email} dir="ltr" readOnly autoComplete="username" />
      <Field
        label="סיסמה"
        name="password"
        type="password"
        autoComplete="new-password"
        required
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
      <SubmitButton pendingText="יוצרים חשבון...">יצירת חשבון</SubmitButton>
    </form>
  );
}
