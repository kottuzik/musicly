"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Field } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { requestPasswordReset, type FormState } from "../actions";
import styles from "../AuthForm.module.css";

export function ForgotPasswordForm({ linkError }: { linkError: boolean }) {
  const [state, formAction] = useActionState<FormState, FormData>(requestPasswordReset, {});

  return (
    <form action={formAction} className={styles.form} noValidate>
      {linkError && !state.success && !state.error && (
        <Alert tone="warning">הקישור שנפתח פג או אינו תקין. הזינו את האימייל ונשלח קישור חדש.</Alert>
      )}
      {state.success && <Alert tone="success">{state.success}</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <Field
        label="אימייל"
        name="email"
        type="email"
        dir="ltr"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <SubmitButton pendingText="שולחים...">שליחת קישור לאיפוס</SubmitButton>
      <p className={styles.footer}>
        <Link href="/login" className={styles.link}>
          חזרה להתחברות
        </Link>
      </p>
    </form>
  );
}
