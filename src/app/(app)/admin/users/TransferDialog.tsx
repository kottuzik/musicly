"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import type { ActionState } from "@/lib/actions";
import stack from "@/components/ui/Stack.module.css";
import { transferSuperAdmin } from "./actions";
import styles from "./Users.module.css";

export function TransferDialog({ admins }: { admins: { id: string; full_name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setFormKey((k) => k + 1);
          setOpen(true);
        }}
      >
        העברת תפקיד מנהל ראשי
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="העברת תפקיד מנהל ראשי"
        description="המנהל שתבחרו יהפוך למנהל הראשי, ואתם תהפכו למנהל רגיל. לאחר ההעברה לא תוכלו לנהל מנהלים והרשאות."
      >
        {admins.length === 0 ? (
          <Alert tone="info">אין מנהלים פעילים אחרים. הוסיפו מנהל לפני העברת התפקיד.</Alert>
        ) : (
          <TransferForm key={formKey} admins={admins} onCancel={() => setOpen(false)} />
        )}
      </Dialog>
    </>
  );
}

function TransferForm({ admins, onCancel }: { admins: { id: string; full_name: string }[]; onCancel: () => void }) {
  const [state, formAction] = useActionState<ActionState, FormData>(transferSuperAdmin, {});
  return (
    <form action={formAction} className={stack.form} noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <SelectField
        label="מנהל ראשי חדש"
        name="targetId"
        placeholder="בחרו מנהל"
        options={admins.map((a) => ({ value: a.id, label: a.full_name }))}
        error={state.fieldErrors?.targetId}
      />
      <label className={styles.toggle}>
        <input type="checkbox" name="confirm" aria-describedby={state.fieldErrors?.confirm ? "confirm-error" : undefined} />
        <span>אני מבין/ה שתפקיד המנהל הראשי יעבור למנהל שבחרתי.</span>
      </label>
      {state.fieldErrors?.confirm && (
        <p id="confirm-error" className={styles.error}>
          {state.fieldErrors.confirm}
        </p>
      )}
      <DialogActions>
        <Button variant="ghost" onClick={onCancel}>
          ביטול
        </Button>
        <SubmitButton variant="danger" fullWidth={false} pendingText="מעבירים...">
          העבר תפקיד
        </SubmitButton>
      </DialogActions>
    </form>
  );
}
