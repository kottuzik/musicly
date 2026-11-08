"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Field } from "@/components/ui/Field";
import { PasswordField } from "@/components/ui/PasswordField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { submitWithoutReset } from "@/components/ui/submitWithoutReset";
import { login, type FormState } from "../actions";
import styles from "../AuthForm.module.css";
import { useFocusFirstError } from "@/components/ui/useFocusFirstError";

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(login, {});
  const formRef = useFocusFirstError(state);

  return (
    <form ref={formRef} onSubmit={submitWithoutReset(formAction)} className={styles.form} noValidate>
      {notice && !state.error && <Alert tone="info">{notice}</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <input type="hidden" name="next" value={next ?? ""} />
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
      <PasswordField
        label="סיסמה"
        name="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />
      <SubmitButton pending={pending} pendingText="מתחברים...">התחברות</SubmitButton>
      <p className={styles.footer}>
        <Link href="/forgot-password" className={styles.link}>
          שכחת סיסמה?
        </Link>
      </p>
    </form>
  );
}
