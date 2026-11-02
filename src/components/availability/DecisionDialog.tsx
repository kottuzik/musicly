"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { TextareaField } from "@/components/ui/TextareaField";
import stack from "@/components/ui/Stack.module.css";
import { submitWithoutReset } from "@/components/ui/submitWithoutReset";
import type { ActionState } from "@/lib/actions";
import { decideRequest } from "@/lib/availability/actions";
import { ImpactDecisions } from "./ImpactDecisions";

type Props = {
  request: { id: string; version: number };
  decision: "approve" | "reject";
  summary: string; // "<teacher> — <kind>: <details>"
};

// Approve or reject a pending request. The version the admin saw is sent along, so a request
// another admin already handled is not overwritten (PRD §3.4).
export function DecisionDialog({ request, decision, summary }: Props) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const approve = decision === "approve";
  return (
    <>
      <Button
        variant={approve ? "primary" : "outline"}
        size="small"
        onClick={() => {
          setFormKey((k) => k + 1);
          setOpen(true);
        }}
      >
        {approve ? "אישור" : "דחייה"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title={approve ? "אישור הבקשה" : "דחיית הבקשה"} description={summary}>
        <DecisionForm key={formKey} request={request} decision={decision} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function DecisionForm({ request, decision, onDone }: Omit<Props, "summary"> & { onDone: () => void }) {
  const approve = decision === "approve";
  // Controlled so the note survives a failed submit (React resets uncontrolled form fields).
  const [note, setNote] = useState("");
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await decideRequest(prev, formData);
    if (result.ok && !result.success) onDone();
    return result;
  }, {});

  if (state.ok && state.success) {
    return (
      <div className={stack.form}>
        <Alert tone="success">{state.success}</Alert>
        <DialogActions>
          <Button onClick={onDone}>סגירה</Button>
        </DialogActions>
      </div>
    );
  }

  return (
    <form onSubmit={submitWithoutReset(formAction)} className={stack.form} noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <input type="hidden" name="id" value={request.id} />
      <input type="hidden" name="version" value={request.version} />
      <input type="hidden" name="decision" value={decision} />
      {approve && <p className="text-secondary">השינוי ייכנס לתוקף מיד עם האישור.</p>}
      {approve && <ImpactDecisions requestId={request.id} failedId={state.failedId} />}
      <TextareaField
        label="הערה למורה (לא חובה)"
        name="note"
        maxLength={500}
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        error={state.fieldErrors?.note}
      />
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          ביטול
        </Button>
        <SubmitButton pending={pending} fullWidth={false} variant={approve ? "primary" : "danger"} pendingText="שומרים...">
          {approve ? "אישור" : "דחייה"}
        </SubmitButton>
      </DialogActions>
    </form>
  );
}
