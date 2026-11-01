"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonVariant } from "./Button";

export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  fullWidth = true,
  disabled,
  pending: pendingProp,
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: ButtonVariant;
  fullWidth?: boolean;
  disabled?: boolean;
  // For forms submitted with onSubmit (useFormStatus only sees `action` submissions).
  pending?: boolean;
}) {
  const { pending: formPending } = useFormStatus();
  const pending = pendingProp ?? formPending;
  return (
    <Button type="submit" variant={variant} fullWidth={fullWidth} loading={pending} disabled={disabled}>
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}
