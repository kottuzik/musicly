"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonVariant } from "./Button";

export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: ButtonVariant;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} fullWidth loading={pending}>
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}
