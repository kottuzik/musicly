import { Button } from "@/components/ui/Button";
import { SelectField, type SelectOption } from "@/components/ui/SelectField";
import toolbar from "@/components/ui/Toolbar.module.css";
import type { CalendarView } from "@/lib/lessons/time";
import styles from "./CalendarFilters.module.css";

type Params = {
  view: CalendarView;
  date: string;
  teacherId: string;
  studentId: string;
  lessonTypeId: string;
  includeCancelled: boolean;
  attentionOnly?: boolean;
};

// GET form: filters are kept in the URL next to the view and date. Teachers get the
// "show cancelled" option only (their calendar holds their own lessons).
export function CalendarFilters({
  params,
  teachers,
  students,
  lessonTypes,
  showAttention = false,
}: {
  params: Params;
  teachers?: SelectOption[];
  students?: SelectOption[];
  lessonTypes?: SelectOption[];
  // Admins: filter to lessons flagged "needs attention".
  showAttention?: boolean;
}) {
  return (
    <form className={toolbar.toolbar} role="search" aria-label="סינון לוח השנה">
      <input type="hidden" name="view" value={params.view} />
      {teachers && (
        <SelectField label="מורה" name="teacher" defaultValue={params.teacherId} options={[{ value: "", label: "כל המורים" }, ...teachers]} />
      )}
      {students && (
        <SelectField label="תלמיד" name="student" defaultValue={params.studentId} options={[{ value: "", label: "כל התלמידים" }, ...students]} />
      )}
      {lessonTypes && (
        <SelectField label="תחום" name="type" defaultValue={params.lessonTypeId} options={[{ value: "", label: "כל התחומים" }, ...lessonTypes]} />
      )}
      <div className={styles.field}>
        <label htmlFor="calendar-date">תאריך</label>
        <input id="calendar-date" type="date" name="date" defaultValue={params.date} />
      </div>
      <label className={styles.check}>
        <input type="checkbox" name="cancelled" value="1" defaultChecked={params.includeCancelled} />
        הצג שיעורים מבוטלים
      </label>
      {showAttention && (
        <label className={styles.check}>
          <input type="checkbox" name="attention" value="1" defaultChecked={params.attentionOnly} />
          רק שיעורים שדורשים טיפול
        </label>
      )}
      <Button type="submit" variant="secondary">
        הצגה
      </Button>
    </form>
  );
}
