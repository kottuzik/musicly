"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { SelectField } from "@/components/ui/SelectField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { TextareaField } from "@/components/ui/TextareaField";
import { useFieldErrors } from "@/components/ui/useFieldErrors";
import choice from "@/components/ui/ChoiceGroup.module.css";
import stack from "@/components/ui/Stack.module.css";
import { submitWithoutReset } from "@/components/ui/submitWithoutReset";
import type { ActionState } from "@/lib/actions";
import { addAvailability, removeAvailability } from "@/lib/availability/actions";
import { slotStates, timesWithin, type Hours, type Slot, type SlotState } from "@/lib/availability/slots";
import { formatDay } from "@/lib/students/age";
import { WEEKDAYS, WEEKDAY_LABELS, addDays, dayOfWeek, timeRange } from "@/lib/time/weekdays";
import styles from "./Availability.module.css";

export type Mode = "teacher" | "admin";

type Props = {
  mode: Mode;
  teacherId: string;
  hours: Hours[];
  slots: Slot[];
  pendingRemovalIds: string[];
  today: string;
};

const STATE_BADGES: Record<SlotState, { label: string; tone: BadgeTone }> = {
  active: { label: "פעיל", tone: "success" },
  pending_removal: { label: "ממתין להסרה", tone: "warning" },
  ending: { label: "מסתיים", tone: "neutral" },
  outside_hours: { label: "מחוץ לשעות הפעילות", tone: "error" },
};

// Weekly availability grouped by weekday, as in the "זמינות מורה" wireframe.
export function WeeklyAvailability({ mode, teacherId, hours, slots, pendingRemovalIds, today }: Props) {
  const openDays = hours.map((h) => h.day_of_week);
  return (
    <>
      <div className={styles.cardHeader}>
        <h2 className="text-h3">זמינות שבועית</h2>
        <AddSlotDialog teacherId={teacherId} hours={hours} disabled={openDays.length === 0} />
      </div>
      {openDays.length === 0 && (
        <Alert tone="info">עדיין לא הוגדרו שעות פעילות לבית הספר, ולכן אי אפשר להוסיף זמינות.</Alert>
      )}
      <ul className={styles.days}>
        {WEEKDAYS.map((day) => {
          const open = hours.find((h) => h.day_of_week === day);
          const daySlots = slots.filter((s) => s.day_of_week === day);
          return (
            <li key={day} className={styles.day}>
              <div className={styles.dayName}>
                <span>{WEEKDAY_LABELS[day]}</span>
                <span className={`text-small ${styles.muted}`}>
                  {open ? (
                    <>
                      שעות פעילות: <span className={styles.time}>{timeRange(open.open_time, open.close_time)}</span>
                    </>
                  ) : (
                    "בית הספר סגור"
                  )}
                </span>
              </div>
              {daySlots.length ? (
                <ul className={styles.slots}>
                  {daySlots.map((slot) => (
                    <li key={slot.id} className={styles.slot}>
                      <span className={styles.time}>{timeRange(slot.start_time, slot.end_time)}</span>
                      {slotStates(slot, hours, pendingRemovalIds.includes(slot.id)).map((state) => (
                        <Badge key={state} tone={STATE_BADGES[state].tone}>
                          {state === "ending" ? `עד ${formatDay(slot.valid_to!)}` : STATE_BADGES[state].label}
                        </Badge>
                      ))}
                      <RemoveSlotDialog mode={mode} slot={slot} today={today} />
                    </li>
                  ))}
                </ul>
              ) : (
                <span className={styles.muted}>אין זמינות</span>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function AddSlotDialog({ teacherId, hours, disabled }: { teacherId: string; hours: Hours[]; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  return (
    <>
      <Button
        variant="secondary"
        disabled={disabled}
        onClick={() => {
          setFormKey((k) => k + 1);
          setOpen(true);
        }}
      >
        <Plus size={18} aria-hidden="true" />
        הוספת טווח שעות
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="הוספת טווח זמינות"
        description="הזמינות נכנסת לתוקף מיד, ורק בתוך שעות הפעילות של בית הספר."
      >
        <AddSlotForm key={formKey} teacherId={teacherId} hours={hours} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

// Fields are controlled so their values survive a failed submit (React resets uncontrolled form fields).
function AddSlotForm({ teacherId, hours, onDone }: { teacherId: string; hours: Hours[]; onDone: () => void }) {
  const [day, setDay] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const { errors, setErrors, clear } = useFieldErrors();
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await addAvailability(prev, formData);
    setErrors(result.fieldErrors ?? {});
    if (result.ok) onDone();
    return result;
  }, {});
  const open = hours.find((h) => String(h.day_of_week) === day);
  // Only times within the chosen day's operating hours are offered, and the end comes after the start.
  const times = open ? timesWithin(open) : [];
  const options = (list: string[]) => list.map((t) => ({ value: t, label: t }));

  return (
    <form onSubmit={submitWithoutReset(formAction)} className={stack.form} noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <input type="hidden" name="teacherId" value={teacherId} />
      <SelectField
        label="יום"
        name="day"
        placeholder="בחירת יום"
        defaultValue={day}
        options={hours.map((h) => ({
          value: String(h.day_of_week),
          label: `${WEEKDAY_LABELS[h.day_of_week]} (${timeRange(h.open_time, h.close_time)})`,
        }))}
        onValueChange={(v) => {
          setDay(v);
          setStart("");
          setEnd("");
          clear("day", "start", "end");
        }}
        error={errors.day}
      />
      <div className={styles.row}>
        <SelectField
          key={`start-${day}`}
          label="משעה"
          name="start"
          placeholder="התחלה"
          defaultValue={start}
          options={options(times.slice(0, -1))}
          onValueChange={(v) => {
            setStart(v);
            if (end && end <= v) setEnd("");
            clear("start", "end");
          }}
          error={errors.start}
        />
        <SelectField
          key={`end-${day}-${start}`}
          label="עד שעה"
          name="end"
          placeholder="סיום"
          defaultValue={end}
          options={options(times.filter((t) => t > (start || times[0])))}
          onValueChange={(v) => {
            setEnd(v);
            clear("end");
          }}
          error={errors.end}
        />
      </div>
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          ביטול
        </Button>
        <SubmitButton pending={pending} fullWidth={false} pendingText="שומרים...">
          הוספה
        </SubmitButton>
      </DialogActions>
    </form>
  );
}

function RemoveSlotDialog({ mode, slot, today }: { mode: Mode; slot: Slot; today: string }) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const label = `${WEEKDAY_LABELS[slot.day_of_week]} ${timeRange(slot.start_time, slot.end_time)}`;
  return (
    <>
      <Button
        variant="ghost"
        size="small"
        aria-label={`הסרת הזמינות ביום ${label}`}
        onClick={() => {
          setFormKey((k) => k + 1);
          setOpen(true);
        }}
      >
        הסרה
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`הסרת זמינות — יום ${label}`}
        description={
          mode === "teacher"
            ? "הבקשה תישלח למנהלים, והזמינות תוסר רק אחרי אישור."
            : "ההסרה תיכנס לתוקף מיד ותתועד בשמך."
        }
      >
        <RemoveSlotForm key={formKey} mode={mode} slot={slot} today={today} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function RemoveSlotForm({ mode, slot, today, onDone }: { mode: Mode; slot: Slot; today: string; onDone: () => void }) {
  // A one-time removal must fall on the slot's weekday: suggest the next such date.
  let nextDate = today;
  while (dayOfWeek(nextDate) !== slot.day_of_week) nextDate = addDays(nextDate, 1);

  const [kind, setKind] = useState<"" | "remove_weekly" | "remove_once">("");
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const { errors, setErrors, clear } = useFieldErrors();
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await removeAvailability(prev, formData);
    setErrors(result.fieldErrors ?? {});
    if (result.ok) onDone();
    return result;
  }, {});

  return (
    <form onSubmit={submitWithoutReset(formAction)} className={stack.form} noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <input type="hidden" name="availabilityId" value={slot.id} />
      <fieldset
        className={choice.fieldset}
        aria-invalid={errors.kind ? true : undefined}
        aria-describedby={errors.kind ? "kind-error" : undefined}
      >
        <legend className={choice.legend}>סוג ההסרה</legend>
        <div className={choice.options}>
          {(
            [
              ["remove_weekly", "קבועה — החל מתאריך", today],
              ["remove_once", "חד־פעמית — בתאריך אחד בלבד", nextDate],
            ] as const
          ).map(([value, label, suggested]) => (
            <label key={value} className={choice.option}>
              <input
                type="radio"
                name="kind"
                value={value}
                checked={kind === value}
                onChange={() => {
                  setKind(value);
                  setDate(suggested);
                  clear("kind", "date");
                }}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        {errors.kind && (
          <p id="kind-error" className={choice.error}>
            {errors.kind}
          </p>
        )}
      </fieldset>
      {kind && (
        <Field
          label={kind === "remove_weekly" ? "החל מתאריך" : `תאריך (יום ${WEEKDAY_LABELS[slot.day_of_week]})`}
          name="date"
          type="date"
          min={today}
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            clear("date");
          }}
          error={errors.date}
        />
      )}
      <TextareaField
        label="סיבה (לא חובה)"
        name="reason"
        maxLength={500}
        rows={2}
        value={reason}
        onChange={(e) => {
          setReason(e.target.value);
          clear("reason");
        }}
        error={errors.reason}
      />
      <p className="text-small text-secondary">אין שיעורים מושפעים.</p>
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          ביטול
        </Button>
        <SubmitButton pending={pending} fullWidth={false} variant={mode === "admin" ? "danger" : "primary"} pendingText="שולחים...">
          {mode === "teacher" ? "שליחת בקשה" : "הסרה"}
        </SubmitButton>
      </DialogActions>
    </form>
  );
}
