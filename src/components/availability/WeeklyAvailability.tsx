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
import { addAvailability, removeAvailability, updateAvailability } from "@/lib/availability/actions";
import { slotStates, timesWithin, type Hours, type Slot, type SlotState } from "@/lib/availability/slots";
import { formatDay } from "@/lib/students/age";
import { WEEKDAYS, WEEKDAY_LABELS, addDays, dayOfWeek, shortTime, timeRange } from "@/lib/time/weekdays";
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
                      {!slot.valid_to && !pendingRemovalIds.includes(slot.id) && (
                        <EditSlotDialog
                          mode={mode}
                          slot={slot}
                          day={open}
                          sameHoursCount={
                            slots.filter((s) => !s.valid_to && s.start_time === slot.start_time && s.end_time === slot.end_time).length
                          }
                        />
                      )}
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
  const [allWeek, setAllWeek] = useState(false);
  const [day, setDay] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const { errors, setErrors, clear } = useFieldErrors();
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await addAvailability(prev, formData);
    setErrors(result.fieldErrors ?? {});
    // Some days were skipped: stay open, so the message can be read.
    if (result.ok && !result.success) onDone();
    return result;
  }, {});
  const open = hours.find((h) => String(h.day_of_week) === day);
  // Only times within the chosen day's operating hours are offered, and the end comes after the start.
  // For the whole week: from the earliest opening to the latest closing of the open days.
  const widest = hours.length
    ? {
        day_of_week: 0,
        open_time: hours.map((h) => h.open_time).sort()[0],
        close_time: hours.map((h) => h.close_time).sort().at(-1)!,
      }
    : null;
  const times = allWeek ? (widest ? timesWithin(widest) : []) : open ? timesWithin(open) : [];
  const options = (list: string[]) => list.map((t) => ({ value: t, label: t }));

  if (state.ok && state.success) {
    return (
      <div className={stack.form}>
        <Alert tone="info">{state.success}</Alert>
        <DialogActions>
          <Button onClick={onDone}>סגירה</Button>
        </DialogActions>
      </div>
    );
  }

  return (
    <form onSubmit={submitWithoutReset(formAction)} className={stack.form} noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <input type="hidden" name="teacherId" value={teacherId} />
      <label className={choice.option}>
        <input
          type="checkbox"
          name="allWeek"
          checked={allWeek}
          onChange={(e) => {
            setAllWeek(e.target.checked);
            setStart("");
            setEnd("");
            clear("day", "start", "end");
          }}
        />
        <span>
          הגדרה לכל השבוע
          <br />
          <span className="text-small text-secondary">אותן שעות בכל הימים שבית הספר פתוח בהם.</span>
        </span>
      </label>
      {!allWeek && (
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
      )}
      <div className={styles.row}>
        <SelectField
          key={`start-${allWeek}-${day}`}
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
          key={`end-${allWeek}-${day}-${start}`}
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
      <SecondRangeFields key={`second-${allWeek}-${day}`} times={times} firstEnd={end} errors={errors} clear={clear} />
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

// An optional second range on the same day, for example 10:00-13:00 and then 16:00-21:00.
function SecondRangeFields({
  times,
  firstEnd,
  errors,
  clear,
}: {
  times: string[];
  firstEnd: string;
  errors: Record<string, string | undefined>;
  clear: (...names: string[]) => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const options = (list: string[]) => list.map((t) => ({ value: t, label: t }));
  return (
    <>
      <label className={choice.option}>
        <input
          type="checkbox"
          name="withSecond"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
            setStart("");
            setEnd("");
            clear("secondStart", "secondEnd");
          }}
        />
        <span>הוספת טווח שעות נוסף באותו יום</span>
      </label>
      {enabled && (
        <div className={styles.row}>
          <SelectField
            key={`second-start-${firstEnd}`}
            label="טווח שני: משעה"
            name="secondStart"
            placeholder="התחלה"
            defaultValue={start}
            options={options(times.slice(0, -1).filter((t) => t >= firstEnd))}
            onValueChange={(v) => {
              setStart(v);
              if (end && end <= v) setEnd("");
              clear("secondStart", "secondEnd");
            }}
            error={errors.secondStart}
          />
          <SelectField
            key={`second-end-${firstEnd}-${start}`}
            label="טווח שני: עד שעה"
            name="secondEnd"
            placeholder="סיום"
            defaultValue={end}
            options={options(times.filter((t) => t > (start || firstEnd)))}
            onValueChange={(v) => {
              setEnd(v);
              clear("secondEnd");
            }}
            error={errors.secondEnd}
          />
        </div>
      )}
    </>
  );
}

function EditSlotDialog({
  mode,
  slot,
  day,
  sameHoursCount,
}: {
  mode: Mode;
  slot: Slot;
  day: Hours | undefined;
  sameHoursCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  // A slot outside the current operating hours has no valid times to offer: it can only be removed.
  if (!day) return null;
  const dayName = WEEKDAY_LABELS[slot.day_of_week];
  return (
    <>
      <Button
        variant="ghost"
        size="small"
        aria-label={`עריכת הזמינות ביום ${dayName}`}
        onClick={() => {
          setFormKey((k) => k + 1);
          setOpen(true);
        }}
      >
        עריכה
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`עריכת זמינות — יום ${dayName}`}
        description={
          mode === "teacher"
            ? "הרחבת השעות נכנסת לתוקף מיד. קיצור או הזזה דורשים אישור מנהל."
            : "השינוי ייכנס לתוקף מיד. שיעורים עתידיים שיישארו מחוץ לשעות החדשות יסומנו ”דורש טיפול”."
        }
      >
        <EditSlotForm key={formKey} slot={slot} day={day} sameHoursCount={sameHoursCount} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function EditSlotForm({
  slot,
  day,
  sameHoursCount,
  onDone,
}: {
  slot: Slot;
  day: Hours;
  sameHoursCount: number;
  onDone: () => void;
}) {
  const [start, setStart] = useState(shortTime(slot.start_time));
  const [end, setEnd] = useState(shortTime(slot.end_time));
  const { errors, setErrors, clear } = useFieldErrors();
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await updateAvailability(prev, formData);
    setErrors(result.fieldErrors ?? {});
    // A note about skipped days or flagged lessons: stay open, so it can be read.
    if (result.ok && !result.success) onDone();
    return result;
  }, {});
  const times = timesWithin(day);
  const options = (list: string[]) => list.map((t) => ({ value: t, label: t }));

  if (state.ok && state.success) {
    return (
      <div className={stack.form}>
        <Alert tone="info">{state.success}</Alert>
        <DialogActions>
          <Button onClick={onDone}>סגירה</Button>
        </DialogActions>
      </div>
    );
  }

  return (
    <form onSubmit={submitWithoutReset(formAction)} className={stack.form} noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <input type="hidden" name="availabilityId" value={slot.id} />
      <div className={styles.row}>
        <SelectField
          label="משעה"
          name="start"
          defaultValue={start}
          options={options(times.slice(0, -1))}
          onValueChange={(v) => {
            setStart(v);
            if (end <= v) setEnd("");
            clear("start", "end");
          }}
          error={errors.start}
        />
        <SelectField
          key={`end-${start}`}
          label="עד שעה"
          name="end"
          placeholder="סיום"
          defaultValue={end}
          options={options(times.filter((t) => t > start))}
          onValueChange={(v) => {
            setEnd(v);
            clear("end");
          }}
          error={errors.end}
        />
      </div>
      <SecondRangeFields times={times} firstEnd={end} errors={errors} clear={clear} />
      {sameHoursCount > 1 && (
        <label className={choice.option}>
          <input type="checkbox" name="sameHours" />
          <span>להחיל על כל הימים עם אותן שעות ({sameHoursCount} ימים)</span>
        </label>
      )}
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          ביטול
        </Button>
        <SubmitButton pending={pending} fullWidth={false} pendingText="שומרים...">
          שמירה
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
      <p className="text-small text-secondary">
        {mode === "admin"
          ? "שיעורים עתידיים בטווח שהוסר יסומנו ”דורש טיפול” בלוח השנה, ולא ישונו אוטומטית."
          : "אחרי אישור המנהל, שיעורים שכבר נקבעו בטווח הזה יטופלו על ידו אחד אחד."}
      </p>
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
