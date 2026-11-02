"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Field } from "@/components/ui/Field";
import { SelectField } from "@/components/ui/SelectField";
import { getAvailabilityImpact, type ImpactedLesson } from "@/lib/availability/actions";
import { listSubstitutes, type SubstituteOption } from "@/lib/lessons/actions";
import { formatLessonDate, lessonTimeRange } from "@/lib/lessons/time";
import { schoolToday } from "@/lib/students/age";
import { TIME_OPTIONS } from "@/lib/time/weekdays";
import styles from "./Availability.module.css";

type Action = "cancel" | "substitute" | "move" | "keep";
type Decision = { action: Action; teacherId: string; date: string; start: string };

const ACTION_OPTIONS = [
  { value: "keep", label: "להשאיר לטיפול (יסומן ”דורש טיפול”)" },
  { value: "cancel", label: "לבטל את השיעור" },
  { value: "substitute", label: "מורה מחליף באותה שעה" },
  { value: "move", label: "מועד אחר" },
];
const timeOptions = TIME_OPTIONS.map((t) => ({ value: t, label: t }));

// Approving a teacher's absence or removed availability: for every upcoming lesson it touches, the
// admin decides what happens. The choices are sent as one JSON field and applied all together.
export function ImpactDecisions({ requestId, failedId }: { requestId: string; failedId?: string }) {
  const [lessons, setLessons] = useState<ImpactedLesson[] | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [substitutes, setSubstitutes] = useState<Record<string, SubstituteOption[]>>({});

  useEffect(() => {
    let active = true;
    void getAvailabilityImpact(requestId).then((list) => active && setLessons(list));
    return () => {
      active = false;
    };
  }, [requestId]);

  const decisionOf = (id: string): Decision => decisions[id] ?? { action: "keep", teacherId: "", date: "", start: "" };

  function update(id: string, patch: Partial<Decision>) {
    setDecisions((all) => ({ ...all, [id]: { ...decisionOf(id), ...patch } }));
    if (patch.action === "substitute" && !substitutes[id]) {
      void listSubstitutes(id).then((list) => setSubstitutes((all) => ({ ...all, [id]: list })));
    }
  }

  if (lessons === null) return <p className="text-secondary">בודקים אילו שיעורים מושפעים...</p>;
  if (lessons.length === 0) {
    return <p className="text-secondary">אין שיעורים עתידיים שהבקשה משפיעה עליהם.</p>;
  }

  const payload = lessons.map((l) => {
    const d = decisionOf(l.lessonId);
    return {
      lessonId: l.lessonId,
      action: d.action,
      ...(d.action === "substitute" ? { teacherId: d.teacherId || undefined } : {}),
      ...(d.action === "move" ? { date: d.date, start: d.start } : {}),
    };
  });

  return (
    <div className={styles.impact}>
      <input type="hidden" name="decisions" value={JSON.stringify(payload)} />
      <p className={styles.impactTitle}>
        הבקשה משפיעה על {lessons.length === 1 ? "שיעור עתידי אחד" : `${lessons.length} שיעורים עתידיים`}. מה לעשות עם כל אחד?
      </p>
      <p className="text-small text-secondary">הכול נשמר יחד: אם אחת ההחלטות נכשלת, שום דבר לא ישתנה.</p>
      {lessons.map((l) => {
        const d = decisionOf(l.lessonId);
        const failed = failedId === l.lessonId;
        return (
          <fieldset key={l.lessonId} className={`${styles.impactItem} ${failed ? styles.impactFailed : ""}`}>
            <legend>
              {l.studentName} — {l.lessonTypeName}, {formatLessonDate(l.startAt)}{" "}
              <bdi dir="ltr">{lessonTimeRange(l.startAt, l.endAt)}</bdi>
            </legend>
            {failed && <Alert tone="error">ההחלטה לשיעור הזה לא התאפשרה (למשל המועד נתפס). בחרו פעולה אחרת.</Alert>}
            <SelectField
              label="החלטה"
              name={`action-${l.lessonId}`}
              value={d.action}
              options={ACTION_OPTIONS}
              onValueChange={(v) => update(l.lessonId, { action: v as Action })}
            />
            {d.action === "substitute" && (
              <SelectField
                label="מורה מחליף"
                name={`teacher-${l.lessonId}`}
                value={d.teacherId}
                placeholder={substitutes[l.lessonId] ? "בחרו מורה" : "טוענים..."}
                options={(substitutes[l.lessonId] ?? []).map((t) => ({
                  value: t.id,
                  label: t.available ? `${t.name} (פנוי)` : `${t.name} (פנוי — מחוץ לזמינות, יישלח אישור)`,
                }))}
                onValueChange={(v) => update(l.lessonId, { teacherId: v })}
              />
            )}
            {d.action === "move" && (
              <div className={styles.impactRow}>
                <Field
                  label="תאריך"
                  name={`date-${l.lessonId}`}
                  type="date"
                  min={schoolToday()}
                  value={d.date}
                  onChange={(e) => update(l.lessonId, { date: e.target.value })}
                />
                <SelectField
                  label="שעה"
                  name={`start-${l.lessonId}`}
                  value={d.start}
                  placeholder="בחרו שעה"
                  options={timeOptions}
                  onValueChange={(v) => update(l.lessonId, { start: v })}
                />
              </div>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}
