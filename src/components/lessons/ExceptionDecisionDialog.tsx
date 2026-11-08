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
import { respondExceptionRequest } from "@/lib/lessons/actions";
import { useFocusFirstError } from "@/components/ui/useFocusFirstError";

type Props = {
  request: { id: string; version: number };
  decision: "approve" | "reject";
  summary: string;
};

// The teacher's answer to a booking outside their availability. Approval re-checks the time on the
// server; if it was taken meanwhile the request closes as "cannot schedule" and the dialog says so.
export function ExceptionDecisionDialog({ request, decision, summary }: Props) {
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
      <Dialog open={open} onOpenChange={setOpen} title={approve ? "אישור השיבוץ" : "דחיית השיבוץ"} description={summary}>
        <DecisionForm key={formKey} request={request} decision={decision} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function DecisionForm({ request, decision, onDone }: Omit<Props, "summary"> & { onDone: () => void }) {
  const approve = decision === "approve";
  const [note, setNote] = useState("");
  const [state, formAction, pending] = useActionState(
    (prev: ActionState, formData: FormData) => respondExceptionRequest(prev, formData),
    {},
  );
  const formRef = useFocusFirstError(state);

  if (state.ok || (state.error && !state.fieldErrors)) {
    return (
      <div className={stack.form}>
        <Alert tone={state.ok ? "success" : "error"}>{state.ok ? state.success : state.error}</Alert>
        <DialogActions>
          <Button onClick={onDone}>סגירה</Button>
        </DialogActions>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={submitWithoutReset(formAction)} className={stack.form} noValidate>
      <input type="hidden" name="id" value={request.id} />
      <input type="hidden" name="version" value={request.version} />
      <input type="hidden" name="decision" value={decision} />
      {approve && <p className="text-secondary">המועד מחוץ לזמינות שלך. באישור, השיעור ייקבע אם המועד עדיין פנוי.</p>}
      <TextareaField
        label="הערה למנהל (לא חובה)"
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
