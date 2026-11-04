"use client";

import { Pencil, Plus } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ChoiceGroup } from "@/components/ui/ChoiceGroup";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { submitWithoutReset } from "@/components/ui/submitWithoutReset";
import type { ActionState } from "@/lib/actions";
import { LESSON_TYPE_COLORS } from "@/lib/lesson-types/colors";
import lessonChange from "@/components/lessons/LessonChange.module.css";
import stack from "@/components/ui/Stack.module.css";
import { SelectField } from "@/components/ui/SelectField";
import { WEEKDAY_LABELS } from "@/lib/time/weekdays";
import { formatDay } from "@/lib/students/age";
import { createLessonType, getDurationImpact, updateLessonType, type DurationImpactSeries } from "./actions";

type LessonType = { id: string; name: string; default_duration_minutes: number; color: string };

export function LessonTypeDialog({ lessonType }: { lessonType?: LessonType }) {
  const editing = Boolean(lessonType);
  const [open, setOpen] = useState(false);
  // Remount the form on every open so old errors and values are cleared.
  const [formKey, setFormKey] = useState(0);

  function openDialog() {
    setFormKey((k) => k + 1);
    setOpen(true);
  }

  return (
    <>
      {editing ? (
        <Button variant="ghost" size="small" onClick={openDialog} aria-label={`עריכה: ${lessonType!.name}`}>
          <Pencil size={16} aria-hidden="true" />
          עריכה
        </Button>
      ) : (
        <Button onClick={openDialog}>
          <Plus size={18} aria-hidden="true" />
          תחום חדש
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen} title={editing ? "עריכת תחום לימוד" : "תחום לימוד חדש"}>
        <LessonTypeForm key={formKey} lessonType={lessonType} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function LessonTypeForm({ lessonType, onDone }: { lessonType?: LessonType; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await (lessonType ? updateLessonType : createLessonType)(prev, formData);
    if (result.ok) onDone();
    return result;
  }, {});

  // A changed duration can also be applied to existing weekly series: the admin chooses which,
  // and what happens to the meetings that would clash.
  const [duration, setDuration] = useState(String(lessonType?.default_duration_minutes ?? 45));
  const [scope, setScope] = useState<"new" | "existing">("new");
  const [impact, setImpact] = useState<DurationImpactSeries[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [alternatives, setAlternatives] = useState<Record<string, string>>({});
  const newMinutes = Number(duration);
  const changed = Boolean(lessonType) && Number.isInteger(newMinutes) && newMinutes >= 5 && newMinutes <= 240 && newMinutes !== lessonType?.default_duration_minutes;

  useEffect(() => {
    if (!lessonType || !changed || scope !== "existing") return;
    let active = true;
    void getDurationImpact(lessonType.id, newMinutes).then((list) => {
      if (!active) return;
      setImpact(list);
      setPicked(new Set(list.map((x) => x.series_id)));
    });
    return () => {
      active = false;
    };
  }, [lessonType, changed, scope, newMinutes]);

  const durationSeries =
    scope === "existing" && changed && impact
      ? impact
          .filter((x) => picked.has(x.series_id))
          .map((x) => ({
            seriesId: x.series_id,
            alternatives: x.conflicts.map((c) => ({ lessonId: c.lesson_id, start: alternatives[c.lesson_id] || null })),
          }))
      : [];

  return (
    <form onSubmit={submitWithoutReset(formAction)} className={stack.form} noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {lessonType && <input type="hidden" name="id" value={lessonType.id} />}
      {lessonType && <input type="hidden" name="durationSeries" value={JSON.stringify(durationSeries)} />}
      <Field label="שם התחום" name="name" required maxLength={60} defaultValue={lessonType?.name} error={state.fieldErrors?.name} />
      <Field
        label="משך שיעור ברירת מחדל (דקות)"
        name="defaultDurationMinutes"
        type="number"
        inputMode="numeric"
        min={5}
        max={240}
        step={5}
        required
        value={duration}
        onChange={(e) => setDuration(e.target.value)}
        error={state.fieldErrors?.defaultDurationMinutes}
        hint={lessonType ? "השינוי יחול על שיעורים חדשים. שיעורים בודדים שכבר נקבעו לא משתנים." : undefined}
      />
      {changed && (
        <fieldset className={lessonChange.scope}>
          <legend>מה לעשות עם סדרות שבועיות קיימות?</legend>
          {(
            [
              ["new", "רק שיבוצים חדשים", "הסדרות הקיימות נשארות באורך הנוכחי."],
              ["existing", "גם סדרות קיימות", "אפשר לבחור אילו סדרות יתעדכנו, ומה לעשות במפגשים שמתנגשים."],
            ] as const
          ).map(([value, title, hint]) => (
            <label key={value} className={lessonChange.option}>
              <input type="radio" name="durationScope" checked={scope === value} onChange={() => setScope(value)} />
              <span>
                <strong>{title}</strong>
                <br />
                <span className="text-secondary">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {changed && scope === "existing" && impact === null && <p className="text-secondary">בודקים אילו סדרות מושפעות...</p>}
      {changed && scope === "existing" && impact && impact.length === 0 && (
        <p className="text-secondary">אין סדרות פעילות בתחום הזה עם מפגשים עתידיים.</p>
      )}
      {changed && scope === "existing" && impact && impact.length > 0 && (
        <div className={lessonChange.scope}>
          {impact.map((x) => (
            <fieldset key={x.series_id} className={lessonChange.scope}>
              <label className={lessonChange.option}>
                <input
                  type="checkbox"
                  checked={picked.has(x.series_id)}
                  onChange={(e) =>
                    setPicked((set) => {
                      const next = new Set(set);
                      if (e.target.checked) next.add(x.series_id);
                      else next.delete(x.series_id);
                      return next;
                    })
                  }
                />
                <span>
                  <strong>{x.student_name}</strong> — {x.teacher_name}, יום {WEEKDAY_LABELS[x.day]} {x.start}
                  <br />
                  <span className="text-secondary">
                    {x.meetings} מפגשים עתידיים, כיום {x.current_duration} דקות
                    {x.conflicts.length > 0 && ` · ${x.conflicts.length} מתנגשים`}
                  </span>
                </span>
              </label>
              {picked.has(x.series_id) &&
                x.conflicts.map((c) => (
                  <SelectField
                    key={c.lesson_id}
                    label={`מפגש מתנגש — ${formatDay(c.date)} ${c.start}`}
                    name={`alt-${c.lesson_id}`}
                    value={alternatives[c.lesson_id] ?? ""}
                    options={[
                      { value: "", label: "ללא שינוי למפגש הזה (נשאר באורך הישן)" },
                      ...c.suggestions.map((t) => ({ value: t, label: `להעביר ל־${t}` })),
                    ]}
                    onValueChange={(v) => setAlternatives((all) => ({ ...all, [c.lesson_id]: v }))}
                  />
                ))}
            </fieldset>
          ))}
        </div>
      )}
      {lessonType ? (
        <ChoiceGroup
          legend="צבע בלוח השנה"
          name="color"
          type="radio"
          variant="swatches"
          options={LESSON_TYPE_COLORS.map((c) => ({ value: c.value, label: c.label, color: c.value }))}
          defaultValue={[LESSON_TYPE_COLORS.find((c) => c.value.toLowerCase() === lessonType.color.toLowerCase())?.value ?? lessonType.color]}
          error={state.fieldErrors?.color}
        />
      ) : (
        <p className="text-secondary">צבע לתצוגה בלוח השנה יוקצה אוטומטית, ואפשר לשנות אותו בעריכה.</p>
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
