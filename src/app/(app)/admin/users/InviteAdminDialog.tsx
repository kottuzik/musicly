"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { InviteLinkDialog, type InviteLink } from "@/components/invitations/InviteLinkDialog";
import type { InviteState } from "@/components/invitations/CreateInviteButton";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import stack from "@/components/ui/Stack.module.css";
import { inviteAdmin } from "./actions";

export function InviteAdminDialog() {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [invite, setInvite] = useState<InviteLink | null>(null);

  return (
    <>
      <Button
        onClick={() => {
          setFormKey((k) => k + 1);
          setOpen(true);
        }}
      >
        <Plus size={18} aria-hidden="true" />
        מנהל חדש
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="הוספת מנהל"
        description="המנהל יקבל קישור הרשמה אישי ויוכל לבחור סיסמה. מורים מוסיפים במסך המורים."
      >
        <InviteAdminForm
          key={formKey}
          onCancel={() => setOpen(false)}
          onCreated={(created) => {
            setOpen(false);
            setInvite(created);
          }}
        />
      </Dialog>
      <InviteLinkDialog invite={invite} onClose={() => setInvite(null)} />
    </>
  );
}

function InviteAdminForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (invite: InviteLink) => void }) {
  const [state, formAction] = useActionState(async (prev: InviteState, formData: FormData) => {
    const result = await inviteAdmin(prev, formData);
    if (result.invite) onCreated(result.invite);
    return result;
  }, {});

  return (
    <form action={formAction} className={stack.form} noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <Field label="שם מלא" name="fullName" required autoComplete="off" error={state.fieldErrors?.fullName} />
      <Field
        label="אימייל"
        name="email"
        type="email"
        dir="ltr"
        inputMode="email"
        autoComplete="off"
        required
        error={state.fieldErrors?.email}
      />
      <DialogActions>
        <Button variant="ghost" onClick={onCancel}>
          ביטול
        </Button>
        <SubmitButton fullWidth={false} pendingText="יוצרים קישור...">
          צור קישור הרשמה
        </SubmitButton>
      </DialogActions>
    </form>
  );
}
