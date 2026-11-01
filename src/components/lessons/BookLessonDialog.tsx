"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { SelectField } from "@/components/ui/SelectField";
import stack from "@/components/ui/Stack.module.css";
import {
  bookLesson,
  createSeries,
  previewSeries,
  type BookingState,
  type SeriesPreview,
  type SeriesState,
} from "@/lib/lessons/actions";
import { LOCATION_LABELS, SKIP_REASON_LABELS, type LessonLocation } from "@/lib/lessons/labels";
import type { BookingOptions } from "@/lib/lessons/queries";
import { addMinutes } from "@/lib/lessons/time";
import { formatDay, schoolToday } from "@/lib/students/age";
import { TIME_OPTIONS, WEEKDAY_LABELS, dayOfWeek, shortTime, timeRange } from "@/lib/time/weekdays";
import styles from "./BookLesson.module.css";

type Mode = "single" | "series";
type Meeting = { day: string; start: string };

export function BookLessonDialog({ options }: { options: BookingOptions }) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  return (
    <>
      <Button
        onClick={() => {
          setFormKey((k) => k + 1);
          setOpen(true);
        }}
      >
        <Plus size={18} aria-hidden="true" />
        שיעור חדש
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="שיעור חדש">
        {options.students.length === 0 ? (
          <Alert tone="warning">אין עדיין תלמידים פעילים הרשומים לתחום. הוסיפו תלמיד ותחום לימוד בדף התלמידים.</Alert>
        ) : (
          <BookLessonForm key={formKey} options={options} onClose={() => setOpen(false)} />
        )}
      </Dialog>
    </>
  );
}

const timeOptions = TIME_OPTIONS.map((t) => ({ value: t, label: t }));
const dayOptions = WEEKDAY_LABELS.map((label, i) => ({ value: String(i), label }));

function BookLessonForm({ options, onClose }: { options: BookingOptions; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("single");
  const [studentId, setStudentId] = useState("");
  const [lessonTypeId, setLessonTypeId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [duration, setDuration] = useState("");
  const [location, setLocation] = useState<LessonLocation>("school");
  const [startDate, setStartDate] = useState(schoolToday());
  const [endDate, setEndDate] = useState("");
  const [meetings, setMeetings] = useState<Meeting[]>([{ day: "", start: "" }]);
  const [confirmHours, setConfirmHours] = useState(false);
  const [state, setState] = useState<BookingState & SeriesState>({});
  const [preview, setPreview] = useState<SeriesPreview | null>(null);
  const [pending, startTransition] = useTransition();

  const student = options.students.find((s) => s.id === studentId);
  const lessonType = options.lessonTypes.find((lt) => lt.id === lessonTypeId);
  const regularTeacherId = student?.subjects.find((s) => s.lessonTypeId === lessonTypeId)?.regularTeacherId ?? "";
  const effectiveTeacherId = mode === "series" ? regularTeacherId : teacherId;
  const teacher = options.teachers.find((t) => t.id === effectiveTeacherId);

  const subjectOptions = (student?.subjects ?? [])
    .map((s) => options.lessonTypes.find((lt) => lt.id === s.lessonTypeId))
    .filter((lt) => lt !== undefined)
    .map((lt) => ({ value: lt.id, label: lt.name }));
  const teacherOptions = options.teachers
    .filter((t) => t.lessonTypeIds.includes(lessonTypeId))
    .map((t) => ({ value: t.id, label: t.id === regularTeacherId ? `${t.name} (מורה קבוע)` : `${t.name} (מחליף)` }));

  // Any change to what is being booked invalidates an earlier answer from the server.
  function reset() {
    setState({});
    setPreview(null);
    setConfirmHours(false);
  }

  function chooseStudent(id: string) {
    setStudentId(id);
    const subjects = options.students.find((s) => s.id === id)?.subjects ?? [];
    chooseSubject(subjects.length === 1 ? subjects[0].lessonTypeId : "", id);
  }

  function chooseSubject(id: string, forStudent = studentId) {
    setLessonTypeId(id);
    const s = options.students.find((x) => x.id === forStudent);
    const regular = s?.subjects.find((x) => x.lessonTypeId === id)?.regularTeacherId ?? "";
    // The regular teacher is the default only if they are active (inactive teachers are not listed).
    setTeacherId(options.teachers.some((t) => t.id === regular) ? regular : "");
    setDuration(String(options.lessonTypes.find((lt) => lt.id === id)?.duration ?? ""));
    reset();
  }

  const availabilityText = useMemo(() => {
    if (!effectiveTeacherId) return null;
    const today = schoolToday();
    const days = mode === "single" ? (date ? [dayOfWeek(date)] : []) : [...new Set(meetings.filter((m) => m.day).map((m) => Number(m.day)))];
    if (!days.length) return null;
    return days.map((d) => {
      const slots = options.slots
        .filter((s) => s.teacher_id === effectiveTeacherId && s.day_of_week === d)
        .filter((s) => (mode === "single" && date ? s.valid_from <= date && (!s.valid_to || s.valid_to >= date) : !s.valid_to || s.valid_to >= today))
        .map((s) => timeRange(s.start_time, s.end_time));
      const hours = options.hours.find((h) => h.day_of_week === d);
      return {
        day: WEEKDAY_LABELS[d],
        slots: slots.length ? slots.join(", ") : "אין זמינות",
        hours: hours ? timeRange(hours.open_time, hours.close_time) : "בית הספר סגור",
      };
    });
  }, [effectiveTeacherId, mode, date, meetings, options.slots, options.hours]);

  const commonInput = { studentId, lessonTypeId, location, confirmOutsideHours: confirmHours };

  function submitSingle() {
    startTransition(async () => {
      const result = await bookLesson({ ...commonInput, teacherId, date, start, duration });
      setState(result);
    });
  }

  const seriesInput = () => ({
    ...commonInput,
    startDate,
    endDate,
    meetings: meetings.map((m) => ({ day: m.day, start: m.start })),
  });

  function submitPreview() {
    startTransition(async () => {
      const result = await previewSeries(seriesInput());
      setState(result);
      setPreview(result.preview ?? null);
    });
  }

  function submitSeries() {
    startTransition(async () => {
      const result = await createSeries(seriesInput());
      setState(result);
    });
  }

  const errors = state.fieldErrors ?? {};
  const durationNumber = Number(duration) || lessonType?.duration || 0;

  // Final screens: what was created.
  if (state.ok) {
    return (
      <div className={stack.form}>
        {state.results ? <SeriesResults results={state.results} /> : (
          <Alert tone={state.requested ? "info" : "success"}>{state.success}</Alert>
        )}
        <DialogActions>
          <Button onClick={onClose}>סיום</Button>
        </DialogActions>
      </div>
    );
  }

  const previewNeedsConfirm = preview?.some((p) => p.outside_hours) ?? false;

  return (
    <form
      className={stack.form}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (mode === "single") submitSingle();
        else if (!preview) submitPreview();
        else submitSeries();
      }}
    >
      <div className={styles.modes} role="radiogroup" aria-label="סוג שיבוץ">
        {(["single", "series"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            className={styles.mode}
            onClick={() => {
              setMode(m);
              reset();
            }}
          >
            {m === "single" ? "שיעור בודד" : "סדרת שיעורים"}
          </button>
        ))}
      </div>

      <SelectField
        label="תלמיד"
        name="studentId"
        value={studentId}
        placeholder="בחרו תלמיד"
        options={options.students.map((s) => ({ value: s.id, label: s.name }))}
        onValueChange={chooseStudent}
        error={errors.studentId}
      />
      <SelectField
        label="תחום"
        name="lessonTypeId"
        value={lessonTypeId}
        placeholder={student ? "בחרו תחום" : "בחרו קודם תלמיד"}
        options={subjectOptions}
        onValueChange={(v) => chooseSubject(v)}
        error={errors.lessonTypeId}
      />

      {mode === "single" ? (
        <SelectField
          label="מורה"
          name="teacherId"
          value={teacherId}
          placeholder={lessonTypeId ? "בחרו מורה" : "בחרו קודם תחום"}
          options={teacherOptions}
          onValueChange={(v) => {
            setTeacherId(v);
            reset();
          }}
          error={errors.teacherId}
        />
      ) : (
        lessonTypeId && (
          <p className={styles.readonly}>
            <span className="text-secondary">מורה: </span>
            {teacher ? teacher.name : "המורה הקבוע אינו פעיל — לא ניתן ליצור סדרה"}
            <span className="text-secondary"> · סדרה נקבעת תמיד עם המורה הקבוע</span>
          </p>
        )
      )}

      {mode === "single" ? (
        <>
          <Field
            label="תאריך"
            name="date"
            type="date"
            min={schoolToday()}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              reset();
            }}
            error={errors.date}
          />
          <div className={styles.row}>
            <SelectField
              label="שעת התחלה"
              name="start"
              value={start}
              placeholder="בחרו שעה"
              options={timeOptions}
              onValueChange={(v) => {
                setStart(v);
                reset();
              }}
              error={errors.start}
            />
            <Field
              label="משך (דקות)"
              name="duration"
              type="number"
              inputMode="numeric"
              min={5}
              max={240}
              step={5}
              value={duration}
              onChange={(e) => {
                setDuration(e.target.value);
                reset();
              }}
              hint={lessonType ? `ברירת המחדל לתחום: ${lessonType.duration} דקות` : undefined}
              error={errors.duration}
            />
          </div>
          {start && durationNumber > 0 && (
            <p className="text-secondary">
              השיעור יסתיים ב־<span dir="ltr">{addMinutes(start, durationNumber)}</span>
            </p>
          )}
        </>
      ) : (
        <>
          <div className={styles.row}>
            <Field
              label="תאריך התחלה"
              name="startDate"
              type="date"
              min={schoolToday()}
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                reset();
              }}
              error={errors.startDate}
            />
            <Field
              label="תאריך סיום (לא חובה)"
              name="endDate"
              type="date"
              min={startDate}
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                reset();
              }}
              hint={endDate ? undefined : "ללא תאריך סיום"}
              error={errors.endDate}
            />
          </div>
          <fieldset className={styles.meetings}>
            <legend>מפגשים שבועיים</legend>
            {meetings.map((m, i) => (
              <div key={i} className={styles.meeting}>
                <SelectField
                  label={`יום — מפגש ${i + 1}`}
                  name={`meetingDay${i}`}
                  value={m.day}
                  placeholder="יום"
                  options={dayOptions}
                  onValueChange={(v) => {
                    setMeetings((list) => list.map((x, j) => (j === i ? { ...x, day: v } : x)));
                    reset();
                  }}
                />
                <SelectField
                  label={`שעה — מפגש ${i + 1}`}
                  name={`meetingStart${i}`}
                  value={m.start}
                  placeholder="שעה"
                  options={timeOptions}
                  onValueChange={(v) => {
                    setMeetings((list) => list.map((x, j) => (j === i ? { ...x, start: v } : x)));
                    reset();
                  }}
                />
                {meetings.length > 1 && (
                  <Button
                    variant="ghost"
                    size="small"
                    aria-label={`הסרת מפגש ${i + 1}`}
                    onClick={() => {
                      setMeetings((list) => list.filter((_, j) => j !== i));
                      reset();
                    }}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </Button>
                )}
              </div>
            ))}
            {errors.meetings && <p className={styles.error}>{errors.meetings}</p>}
            {meetings.length < 7 && (
              <Button
                variant="outline"
                size="small"
                onClick={() => {
                  setMeetings((list) => [...list, { day: "", start: "" }]);
                  reset();
                }}
              >
                <Plus size={16} aria-hidden="true" />
                הוספת מפגש שבועי
              </Button>
            )}
          </fieldset>
          {lessonType && <p className="text-secondary">משך כל מפגש: {lessonType.duration} דקות (ברירת המחדל של התחום)</p>}
        </>
      )}

      <fieldset className={styles.locations}>
        <legend>מיקום</legend>
        {(["school", "zoom"] as const).map((loc) => (
          <label key={loc} className={styles.location}>
            <input
              type="radio"
              name="location"
              value={loc}
              checked={location === loc}
              onChange={() => {
                setLocation(loc);
                reset();
              }}
            />
            {LOCATION_LABELS[loc]}
          </label>
        ))}
      </fieldset>

      {availabilityText && (
        <div className={styles.help} aria-live="polite">
          <p className={styles.helpTitle}>זמינות {teacher?.name ?? "המורה"} ושעות הפעילות</p>
          <ul>
            {availabilityText.map((a) => (
              <li key={a.day}>
                יום {a.day}: זמינות <span dir="ltr">{a.slots}</span> · בית הספר <span dir="ltr">{a.hours}</span>
              </li>
            ))}
          </ul>
          <p className="text-secondary">מועד מחוץ לזמינות יישלח למורה לאישור.</p>
        </div>
      )}

      {mode === "series" && preview && <PreviewSummary preview={preview} />}

      {(state.needsConfirm || (mode === "series" && previewNeedsConfirm)) && (
        <Alert tone="warning">
          <p>המועד מחוץ לשעות הפעילות של בית הספר.</p>
          <label className={styles.confirm}>
            <input type="checkbox" checked={confirmHours} onChange={(e) => setConfirmHours(e.target.checked)} />
            אני מאשר/ת שיבוץ חריג מחוץ לשעות הפעילות
          </label>
        </Alert>
      )}

      {/* Next to the buttons, so the message is in view after submitting a long form. */}
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {!state.error && Object.keys(errors).length > 0 && (
        <Alert tone="error">חלק מהפרטים חסרים או אינם תקינים — ההסבר מופיע ליד כל שדה.</Alert>
      )}

      <DialogActions>
        <Button variant="ghost" onClick={onClose}>
          ביטול
        </Button>
        {mode === "series" && preview && (
          <Button variant="outline" onClick={reset}>
            חזרה לעריכה
          </Button>
        )}
        <Button
          type="submit"
          loading={pending}
          disabled={(state.needsConfirm || (mode === "series" && previewNeedsConfirm)) && !confirmHours}
        >
          {mode === "single" ? "שמירה" : preview ? "יצירת הסדרה" : "בדיקת מועדים"}
        </Button>
      </DialogActions>
    </form>
  );
}

function SkippedList({ skipped }: { skipped: { date: string; reason: string }[] }) {
  if (!skipped.length) return null;
  return (
    <ul className={styles.skipped}>
      {skipped.map((s) => (
        <li key={s.date}>
          {formatDay(s.date)} — {SKIP_REASON_LABELS[s.reason] ?? s.reason}
        </li>
      ))}
    </ul>
  );
}

function PreviewSummary({ preview }: { preview: SeriesPreview }) {
  return (
    <div className={styles.preview} aria-live="polite">
      <p className={styles.helpTitle}>לפני השמירה</p>
      {preview.map((p) => (
        <div key={`${p.day}-${p.start}`} className={styles.previewItem}>
          <p>
            <strong>
              יום {WEEKDAY_LABELS[p.day]} בשעה <span dir="ltr">{shortTime(p.start)}</span>
            </strong>{" "}
            · מפגש ראשון {formatDay(p.first_date)}
          </p>
          {p.needs_request ? (
            <p>המועד מחוץ לזמינות הקבועה של המורה: תישלח למורה בקשת אישור לכל הסדרה, והשעה לא תישמר עד לאישורו.</p>
          ) : (
            <p>ייווצרו {p.scheduled} מפגשים (עד 12 חודשים קדימה).</p>
          )}
          {p.closed_dates.length > 0 && (
            <p className="text-secondary">ימי סגירה (יסומנו „לא מתקיים”): {p.closed_dates.map(formatDay).join(", ")}</p>
          )}
          {p.skipped.length > 0 && (
            <>
              <p>תאריכים בעייתיים שלא ייווצרו:</p>
              <SkippedList skipped={p.skipped} />
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function SeriesResults({ results }: { results: NonNullable<SeriesState["results"]> }) {
  return (
    <div className={stack.form}>
      {results.map((r) => (
        <Alert key={`${r.day}-${r.start}`} tone={r.result === "request" ? "info" : "success"}>
          <p>
            <strong>
              יום {WEEKDAY_LABELS[r.day]} בשעה <span dir="ltr">{shortTime(r.start)}</span>:
            </strong>{" "}
            {r.result === "request"
              ? "נשלחה למורה בקשת אישור לסדרה. השעה אינה שמורה עד לאישור."
              : `הסדרה נוצרה עם ${r.created} מפגשים.`}
          </p>
          {r.skipped && r.skipped.length > 0 && (
            <>
              <p>תאריכים שלא נוצרו (אפשר לקבוע להם שיעור בודד במועד אחר):</p>
              <SkippedList skipped={r.skipped} />
            </>
          )}
        </Alert>
      ))}
    </div>
  );
}
