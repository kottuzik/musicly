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
  title: string;
  description: ReactNode;
  confirmLabel: string;
  confirmVariant?: ButtonVariant;
};

// A button that asks for explicit confirmation before running a server action.
export function ConfirmAction({
  action,
  fields,
  trigger,
  triggerVariant = "outline",
  title,
  description,
  confirmLabel,
  confirmVariant = "primary",
}: ConfirmActionProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result.ok) setOpen(false);
    return result;
  }, {});

  return (
    <>
      <Button variant={triggerVariant} size="small" onClick={() => setOpen(true)}>
        {trigger}
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title={title} description={description}>
        <form action={formAction}>
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
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
