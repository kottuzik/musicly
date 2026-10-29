"use client";

import { Mail } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button, buttonClassName } from "@/components/ui/Button";
import { CopyField } from "@/components/ui/CopyField";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { invitationMailto } from "@/lib/invitations/mailto";
import { formatDate } from "@/lib/teachers/account";
import stack from "@/components/ui/Stack.module.css";

export type InviteLink = { link: string; email: string; fullName: string; expiresAt: string };

// Shows a freshly created registration link once, for the admin to send themselves.
export function InviteLinkDialog({ invite, onClose }: { invite: InviteLink | null; onClose: () => void }) {
  return (
    <Dialog
      open={Boolean(invite)}
      onOpenChange={(open) => !open && onClose()}
      title="קישור הרשמה נוצר"
      description={invite ? `שלחו את הקישור אל ${invite.fullName} (${invite.email}).` : undefined}
    >
      {invite && (
        <div className={stack.form}>
          <CopyField label="קישור הרשמה אישי" value={invite.link} />
          <Alert tone="info">
            הקישור תקף עד {formatDate(invite.expiresAt)} ואפשר להשתמש בו פעם אחת בלבד. מטעמי אבטחה הוא מוצג
            עכשיו בלבד — אם יאבד, צרו קישור חדש.
          </Alert>
          <DialogActions>
            <Button variant="ghost" onClick={onClose}>
              סגירה
            </Button>
            <a
              href={invitationMailto({ email: invite.email, fullName: invite.fullName, link: invite.link, expiresAt: invite.expiresAt })}
              className={buttonClassName({ variant: "primary" })}
            >
              <Mail size={18} aria-hidden="true" />
              פתח במייל
            </a>
          </DialogActions>
        </div>
      )}
    </Dialog>
  );
}
