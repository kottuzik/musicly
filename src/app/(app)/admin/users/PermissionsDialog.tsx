"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { SubmitButton } from "@/components/ui/SubmitButton";
import type { ActionState } from "@/lib/actions";
import stack from "@/components/ui/Stack.module.css";
import { setAdminPermissions } from "./actions";
import styles from "./Users.module.css";

export function PermissionsDialog({ profileId, name, deleteStudentHistory }: { profileId: string; name: string; deleteStudentHistory: boolean }) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  return (
    <>
      <Button
        variant="ghost"
        size="small"
        onClick={() => {
          setFormKey((k) => k + 1);
          setOpen(true);
        }}
      >
        הרשאות
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title={`הרשאות של ${name}`}>
        <PermissionsForm key={formKey} profileId={profileId} defaultChecked={deleteStudentHistory} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function PermissionsForm({ profileId, defaultChecked, onDone }: { profileId: string; defaultChecked: boolean; onDone: () => void }) {
  const [state, formAction] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await setAdminPermissions(prev, formData);
    if (result.ok) onDone();
    return result;
  }, {});


  return (
    <form action={formAction} className={stack.form}>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <input type="hidden" name="id" value={profileId} />
      <label className={styles.toggle}>
        <input type="checkbox" name="deleteStudentHistory" defaultChecked={defaultChecked} />
        <span>
          <strong>מחיקת היסטוריית תלמידים לצמיתות</strong>
          <span className="text-secondary">
            מאפשרת למנהל למחוק לצמיתות היסטוריית שיעורים של תלמיד שנמחק. ההרשאה תיכנס לשימוש כשיתווסף מנגנון
            המחיקה.
          </span>
        </span>
      </label>
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          ביטול
        </Button>
        <SubmitButton fullWidth={false} pendingText="שומרים...">
          שמירה
        </SubmitButton>
      </DialogActions>
    </form>
  );
}
