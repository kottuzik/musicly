"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { SelectField } from "@/components/ui/SelectField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { submitWithoutReset } from "@/components/ui/submitWithoutReset";
import stack from "@/components/ui/Stack.module.css";
import type { Hours } from "@/lib/availability/slots";
import { TIME_OPTIONS, WEEKDAYS, WEEKDAY_LABELS, shortTime } from "@/lib/time/weekdays";
import { saveOperatingHours } from "./actions";
import styles from "./Hours.module.css";
import { useFocusFirstError } from "@/components/ui/useFocusFirstError";

const OPTIONS = TIME_OPTIONS.map((t) => ({ value: t, label: t }));
// A day opened in the form starts with the school's default hours.
const DEFAULT_OPEN = "10:00";
const DEFAULT_CLOSE = "22:00";

export function OperatingHoursForm({ hours }: { hours: Hours[] }) {
  const [open, setOpen] = useState(() => new Set(hours.map((h) => h.day_of_week)));
  const [state, formAction, pending] = useActionState(saveOperatingHours, {});
  const formRef = useFocusFirstError(state);

  return (
    <form ref={formRef} onSubmit={submitWithoutReset(formAction)} className={stack.form} noValidate>
      {state.success && <Alert tone="success">{state.success}</Alert>}
      {state.error && <Alert tone={state.ok ? "warning" : "error"}>{state.error}</Alert>}
      <ul className={styles.days}>
        {WEEKDAYS.map((day) => {
          const current = hours.find((h) => h.day_of_week === day);
          const isOpen = open.has(day);
          return (
            <li key={day} className={styles.day}>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  name={`open${day}`}
                  checked={isOpen}
                  onChange={(e) => {
                    const next = new Set(open);
                    if (e.target.checked) next.add(day);
                    else next.delete(day);
                    setOpen(next);
                  }}
                />
                <span>{WEEKDAY_LABELS[day]}</span>
              </label>
              {isOpen ? (
                <div className={styles.times}>
                  <SelectField
                    label={`שעת פתיחה ביום ${WEEKDAY_LABELS[day]}`}
                    hideLabel
                    name={`start${day}`}
                    placeholder="פתיחה"
                    defaultValue={current ? shortTime(current.open_time) : DEFAULT_OPEN}
                    options={OPTIONS}
                  />
                  <span aria-hidden="true">–</span>
                  <SelectField
                    label={`שעת סגירה ביום ${WEEKDAY_LABELS[day]}`}
                    hideLabel
                    name={`end${day}`}
                    placeholder="סגירה"
                    defaultValue={current ? shortTime(current.close_time) : DEFAULT_CLOSE}
                    options={OPTIONS}
                  />
                </div>
              ) : (
                <span className="text-secondary">סגור</span>
              )}
              {state.fieldErrors?.[`day${day}`] && (
                <p className={styles.error} role="alert">
                  {state.fieldErrors[`day${day}`]}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <div>
        <SubmitButton pending={pending} fullWidth={false} pendingText="שומרים...">
          שמירה
        </SubmitButton>
      </div>
    </form>
  );
}
