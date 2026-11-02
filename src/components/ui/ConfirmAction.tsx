"use client";

import { useActionState, useState, type ReactNode } from "react";
import type { ActionState } from "@/lib/actions";
import { Alert } from "./Alert";
import { Button, type ButtonVariant } from "./Button";
import { Dialog, DialogActions } from "./Dialog";
import { SubmitButton } from "./SubmitButton";

type ConfirmActionProps = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  trigger: ReactNode;
  triggerVariant?: ButtonVariant;
  triggerClassName?: string;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  confirmVariant?: ButtonVariant;
  // Extra form fields (e.g. a reason) shown inside the confirmation, submitted with the action.
  children?: ReactNode;
  // Called after the action succeeded.
  onDone?: () => void;
};

// A button that asks for explicit confirmation before running a server action.
export function ConfirmAction({
  action,
  fields,
  trigger,
  triggerVariant = "outline",
  triggerClassName,
  title,
  description,
  confirmLabel,
  confirmVariant = "primary",
  children,
  onDone,
}: ConfirmActionProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result.ok) {
      setOpen(false);
      onDone?.();
    }
    return result;
  }, {});

  return (
    <>
      <Button variant={triggerVariant} size="small" className={triggerClassName} onClick={() => setOpen(true)}>
        {trigger}
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title={title} description={description}>
        <form action={formAction}>
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          {children}
          {state.error && <Alert tone="error">{state.error}</Alert>}
          <DialogActions>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              ביטול
            </Button>
            <SubmitButton variant={confirmVariant} fullWidth={false}>
              {confirmLabel}
            </SubmitButton>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
