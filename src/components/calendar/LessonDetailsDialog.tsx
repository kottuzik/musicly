"use client";

import { useCallback, useEffect, useState } from "react";
import { AttendanceDialog } from "@/components/attendance/AttendanceDialog";
import { EditLessonDialog } from "@/components/lessons/EditLessonDialog";
import { ExtendSeriesDialog } from "@/components/lessons/ExtendSeriesDialog";
import { LessonChangeRequestDialog } from "@/components/lessons/LessonChangeRequestDialog";
import { RestoreLessonDialog } from "@/components/lessons/RestoreLessonDialog";
import lessonChange from "@/components/lessons/LessonChange.module.css";
import { LessonReminderDialog } from "@/components/notifications/LessonReminderDialog";
import { Alert } from "@/components/ui/Alert";
import { Badge, ColorChip } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmAction } from "@/components/ui/ConfirmAction";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import stack from "@/components/ui/Stack.module.css";
import { TextareaField } from "@/components/ui/TextareaField";
import { clearAttention, cancelLesson, getLessonDetails, getLessonHistory, stopSeries } from "@/lib/lessons/actions";
import {
  ATTENDANCE_LABELS,
  ATTENTION_REASON_LABELS,
  AUDIT_ACTION_LABELS,
  auditDetail,
  CANCEL_SOURCE_LABELS,
  LESSON_CHANGE_KIND_LABELS,
  LESSON_STATUS_LABELS,
  LOCATION_LABELS,
} from "@/lib/lessons/labels";
import type { BookingOptions, LessonDetails, LessonHistoryEntry } from "@/lib/lessons/queries";
import { formatLessonDate, lessonTimeRange, schoolTime } from "@/lib/lessons/time";
import { formatDay, schoolToday } from "@/lib/students/age";
import { WEEKDAY_LABELS, shortTime } from "@/lib/time/weekdays";

type Dialogs = "edit" | "restore" | "extend" | "request" | null;

type Props = {
  lessonId: string | null;
  onClose: () => void;
  // Admins edit, cancel and restore; a teacher can ask for a change and restore their own cancelled lessons.
  isAdmin: boolean;
  // Admins: what the change dialog needs (teachers by subject).
  options?: BookingOptions;
};

// The lesson panel: details, and the actions the viewer is allowed to take.
export function LessonDetailsDialog({ lessonId, onClose, isAdmin, options }: Props) {
  const [lesson, setLesson] = useState<LessonDetails | null | "missing">(null);
  const [history, setHistory] = useState<LessonHistoryEntry[]>([]);
  const [dialog, setDialog] = useState<Dialogs>(null);
  // When the details were loaded: decides whether the lesson is still ahead.
  const [loadedAt, setLoadedAt] = useState(0);

  const load = useCallback(
    async (id: string) => {
      const data = await getLessonDetails(id);
      setLoadedAt(Date.now());
      setLesson(data ?? "missing");
      if (data && isAdmin) setHistory(await getLessonHistory(id));
    },
    [isAdmin],
  );

  useEffect(() => {
    if (!lessonId) return;
    let active = true;
    void getLessonDetails(lessonId).then(async (data) => {
      if (!active) return;
      setLoadedAt(Date.now());
      setLesson(data ?? "missing");
      if (data && isAdmin) {
        const entries = await getLessonHistory(lessonId);
        if (active) setHistory(entries);
      }
    });
    return () => {
      active = false;
      setLesson(null);
      setHistory([]);
      setDialog(null);
    };
  }, [lessonId, isAdmin]);

  const reload = () => {
    if (lessonId) void load(lessonId);
  };

  const ready = lesson && lesson !== "missing" ? lesson : null;
  const upcoming = ready ? new Date(ready.start_at).getTime() > loadedAt : false;
  const scheduled = ready?.status === "scheduled";
  const sameDay = ready ? ready.occurrence_date <= schoolToday() : false;
  const inActiveSeries = Boolean(ready?.series_id) && ready?.series_status === "active";
  const canResume = Boolean(ready?.series_id) && ready?.series_status === "ended";
  const fields: Record<string, string> = ready ? { id: ready.id, version: String(ready.version) } : {};
  const attendance = ready?.attendance_status ? ATTENDANCE_LABELS[ready.attendance_status] : null;
  // A lesson marked "held" may be cancelled after the fact (with an explicit warning), even once it is over.
  const heldCancel = isAdmin && scheduled && ready?.attendance_status === "held";

  return (
    <Dialog
      open={lessonId !== null}
      onOpenChange={(open) => !open && onClose()}
      title={ready ? `שיעור ${ready.lesson_type_name}` : "פרטי שיעור"}
    >
      {lesson === null && <p className="text-secondary">טוענים...</p>}
      {lesson === "missing" && <Alert tone="error">השיעור לא נמצא. ייתכן שהוא שונה בינתיים.</Alert>}
      {ready && (
        <>
          {isAdmin && ready.requires_attention && ready.attention_reason && (
            <Alert tone="warning">
              <p className={lessonChange.attention}>דורש טיפול: {ATTENTION_REASON_LABELS[ready.attention_reason]}</p>
              <p>אפשר לשנות את השיעור, לבטל אותו, או להשאיר אותו כפי שהוא.</p>
            </Alert>
          )}
          {ready.pending_change_request_id && ready.pending_change_request_kind && (
            <Alert tone="info">
              קיימת בקשה ממתינה: {LESSON_CHANGE_KIND_LABELS[ready.pending_change_request_kind]}.{" "}
              {isAdmin ? "אפשר לטפל בה בדף הבקשות." : "המנהל עוד לא ענה."}
            </Alert>
          )}

          <dl className={stack.details}>
            <dt>תלמיד</dt>
            <dd>{ready.student_name}</dd>
            <dt>מורה</dt>
            <dd>
              {ready.teacher_name}
              {ready.is_substitute && <> (מורה מחליף)</>}
            </dd>
            <dt>תחום</dt>
            <dd>
              <ColorChip color={ready.color}>{ready.lesson_type_name}</ColorChip>
            </dd>
            <dt>תאריך</dt>
            <dd>{formatLessonDate(ready.start_at)}</dd>
            <dt>שעה</dt>
            <dd>
              <bdi dir="ltr">{lessonTimeRange(ready.start_at, ready.end_at)}</bdi>
            </dd>
            <dt>משך</dt>
            <dd>{ready.duration_minutes} דקות</dd>
            <dt>מיקום</dt>
            <dd>{LOCATION_LABELS[ready.location]}</dd>
            <dt>סטטוס</dt>
            <dd>
              <Badge tone={LESSON_STATUS_LABELS[ready.status].tone}>{LESSON_STATUS_LABELS[ready.status].label}</Badge>
              {ready.outside_hours && <> · שובץ מחוץ לשעות הפעילות</>}
              {ready.status === "cancelled" && ready.cancel_source && (
                <>
                  <br />
                  <span className="text-secondary">
                    {CANCEL_SOURCE_LABELS[ready.cancel_source]}
                    {ready.cancel_reason && ` — ${ready.cancel_reason}`}
                  </span>
                </>
              )}
            </dd>
            {scheduled && (
              <>
                <dt>נוכחות</dt>
                <dd>
                  {attendance ? <Badge tone={attendance.tone}>{attendance.label}</Badge> : <span className="text-secondary">לא דווחה</span>}
                  {ready.attendance_note && (
                    <>
                      <br />
                      <span className="text-secondary">{ready.attendance_note}</span>
                    </>
                  )}
                  {attendance && ready.attendance_updated_by_name && ready.attendance_updated_at && (
                    <>
                      <br />
                      <span className="text-small text-secondary">
                        עודכנה בידי {ready.attendance_updated_by_name}, {formatLessonDate(ready.attendance_updated_at)}{" "}
                        <bdi dir="ltr">{schoolTime(ready.attendance_updated_at)}</bdi>
                      </span>
                    </>
                  )}
                </dd>
              </>
            )}
            <dt>סוג</dt>
            <dd>
              {ready.series_id && ready.series_day !== null
                ? `סדרה שבועית${ready.series_status === "ended" ? " (הסתיימה)" : ""} — יום ${WEEKDAY_LABELS[ready.series_day]} בשעה ${shortTime(ready.series_start_time ?? "")}, ${
                    ready.series_end_date ? `עד ${formatDay(ready.series_end_date)}` : "ללא תאריך סיום"
                  }`
                : "שיעור בודד"}
            </dd>
          </dl>

          <div className={lessonChange.actions}>
            {scheduled && (
              <AttendanceDialog
                key={`${ready.id}-${ready.attendance_version ?? 0}`}
                lessonId={ready.id}
                context={`${ready.student_name} — ${formatLessonDate(ready.start_at)}`}
                current={
                  ready.attendance_status && ready.attendance_version !== null
                    ? { status: ready.attendance_status, note: ready.attendance_note, version: ready.attendance_version }
                    : null
                }
                triggerVariant="primary"
                onDone={reload}
              />
            )}
            {isAdmin && scheduled && upcoming && options && (
              <Button variant="ghost" size="small" onClick={() => setDialog("edit")}>
                שינוי
              </Button>
            )}
            {isAdmin && inActiveSeries && upcoming && ready.series_end_date && (
              <Button variant="ghost" size="small" onClick={() => setDialog("extend")}>
                הארכת הסדרה
              </Button>
            )}
            {isAdmin && canResume && (
              <Button variant="ghost" size="small" onClick={() => setDialog("extend")}>
                חידוש הסדרה
              </Button>
            )}
            {isAdmin && ready.requires_attention && scheduled && (
              <ConfirmAction
                action={clearAttention}
                fields={fields}
                trigger="השארה כמו שהוא"
                triggerVariant="ghost"
                title="השארת השיעור כמו שהוא"
                description="הסימון ”דורש טיפול” יוסר, והשיעור יישאר ללא שינוי."
                confirmLabel="השאר כמו שהוא"
                onDone={reload}
              />
            )}
            {ready.status === "cancelled" && (
              <Button variant="ghost" size="small" onClick={() => setDialog("restore")}>
                שחזור השיעור
              </Button>
            )}
            {isAdmin && scheduled && (upcoming || heldCancel) && options && (
              <ConfirmAction
                action={cancelLesson}
                fields={heldCancel ? { ...fields, confirmHeld: "true" } : fields}
                trigger="ביטול שיעור"
                triggerVariant="danger"
                title="ביטול שיעור"
                description={
                  heldCancel
                    ? `השיעור של ${ready.student_name} סומן כ„התקיים”. אם תבטלו אותו, הוא לא ייספר כשיעור שהתקיים ודיווח הנוכחות יוסר. הדיווח הקודם יישמר בהיסטוריית השינויים. אפשר לשחזר את השיעור בהמשך, ואז ידווחו נוכחות מחדש.`
                    : `השיעור של ${ready.student_name} יבוטל וישמר ברשימת השיעורים המבוטלים. אפשר לשחזר אותו בהמשך.`
                }
                confirmLabel="בטל שיעור"
                confirmVariant="danger"
                onDone={reload}
              >
                <TextareaField label="סיבה (לא חובה)" name="reason" maxLength={500} />
              </ConfirmAction>
            )}
            {isAdmin && inActiveSeries && upcoming && (
              <ConfirmAction
                action={stopSeries}
                fields={{ seriesId: ready.series_id ?? "" }}
                trigger="הפסקת הסדרה"
                triggerVariant="danger"
                title="הפסקת הסדרה"
                description="כל המפגשים העתידיים מהתאריך שתבחרו יבוטלו, והסדרה תסתיים. שיעורי עבר לא משתנים."
                confirmLabel="הפסק סדרה"
                confirmVariant="danger"
                onDone={reload}
              >
                <Field label="הפסקה מתאריך (כולל)" name="fromDate" type="date" min={schoolToday()} defaultValue={ready.occurrence_date} />
              </ConfirmAction>
            )}
            {!isAdmin && scheduled && upcoming && <LessonReminderDialog lessonId={ready.id} />}
            {!isAdmin && scheduled && upcoming && !ready.pending_change_request_id && !sameDay && (
              <Button variant="ghost" size="small" onClick={() => setDialog("request")}>
                בקשת שינוי או ביטול
              </Button>
            )}
          </div>
          {!isAdmin && scheduled && upcoming && sameDay && (
            <p className="text-secondary">השיעור מתקיים היום, ולכן שינוי או ביטול מתואמים ישירות עם המנהל.</p>
          )}

          {isAdmin && history.length > 0 && (
            <>
              <p className={lessonChange.sectionTitle}>היסטוריית שינויים</p>
              <ul className={lessonChange.history}>
                {history.map((h) => (
                  <li key={h.id}>
                    {AUDIT_ACTION_LABELS[h.action] ?? h.action}
                    {auditDetail(h.action, h.old_values, h.new_values) && `: ${auditDetail(h.action, h.old_values, h.new_values)}`}
                    {h.actor_name && ` — ${h.actor_name}`}{" "}
                    <span className="text-secondary">
                      ({formatLessonDate(h.created_at)} {schoolTime(h.created_at)})
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {options && (
            <EditLessonDialog
              lesson={ready}
              options={options}
              open={dialog === "edit"}
              onOpenChange={(open) => setDialog(open ? "edit" : null)}
              onDone={reload}
            />
          )}
          <RestoreLessonDialog
            lesson={ready}
            open={dialog === "restore"}
            onOpenChange={(open) => setDialog(open ? "restore" : null)}
            onDone={reload}
          />
          <ExtendSeriesDialog
            lesson={ready}
            open={dialog === "extend"}
            onOpenChange={(open) => setDialog(open ? "extend" : null)}
            onDone={reload}
          />
          <LessonChangeRequestDialog
            lesson={ready}
            open={dialog === "request"}
            onOpenChange={(open) => setDialog(open ? "request" : null)}
            onDone={reload}
          />
        </>
      )}
    </Dialog>
  );
}
