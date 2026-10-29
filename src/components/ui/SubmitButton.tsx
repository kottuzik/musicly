"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonVariant } from "./Button";

export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  fullWidth = true,
  disabled,
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: ButtonVariant;
  fullWidth?: boolean;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} fullWidth={fullWidth} loading={pending} disabled={disabled}>
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}
