"use client";

import { Link2 } from "lucide-react";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import type { ActionState } from "@/lib/actions";
import { InviteLinkDialog, type InviteLink } from "./InviteLinkDialog";

export type InviteState = ActionState & { invite?: InviteLink };

// One-click link creation (the person's details are already known), then the link dialog.
export function CreateInviteButton({
  action,
  fields,
  label,
}: {
  action: (prev: InviteState, formData: FormData) => Promise<InviteState>;
  fields: Record<string, string>;
  label: string;
}) {
  const [invite, setInvite] = useState<InviteLink | null>(null);
  const [state, formAction, pending] = useActionState(async (prev: InviteState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result.invite) setInvite(result.invite);
    return result;
  }, {});

  return (
    <>
      <form action={formAction}>
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <Button type="submit" variant="secondary" size="small" loading={pending}>
          <Link2 size={16} aria-hidden="true" />
          {label}
        </Button>
      </form>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <InviteLinkDialog invite={invite} onClose={() => setInvite(null)} />
    </>
  );
}
