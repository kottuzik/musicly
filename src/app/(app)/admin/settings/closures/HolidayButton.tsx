"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { addHolidayClosure } from "./actions";
import styles from "./Closures.module.css";

export function HolidayButton({ holidayKey, name }: { holidayKey: string; name: string }) {
  const [state, formAction] = useActionState(addHolidayClosure, {});
  return (
    <form action={formAction} className={styles.inlineForm} aria-label={`הגדרת ${name} כיום סגירה`}>
      <input type="hidden" name="key" value={holidayKey} />
      <SubmitButton variant="outline" fullWidth={false} pendingText="שומרים...">
        הגדרה כיום סגירה
      </SubmitButton>
      {state.error && (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
