import { Card } from "@/components/ui/Card";
import stack from "@/components/ui/Stack.module.css";
import type { TeacherAvailability } from "@/lib/availability/queries";
import { formatDay } from "@/lib/students/age";
import { timeRange } from "@/lib/time/weekdays";
import { AbsenceDialog } from "./AbsenceDialog";
import { RequestsTable } from "./RequestsTable";
import { WeeklyAvailability, type Mode } from "./WeeklyAvailability";
import styles from "./Availability.module.css";

function dateRange(start: string, end: string) {
  return start === end ? formatDay(start) : `${formatDay(start)} – ${formatDay(end)}`;
}

// The availability screen of one teacher: weekly slots, absences, requests and (for the teacher) closures.
export function AvailabilityPanel({
  mode,
  teacherId,
  data,
}: {
  mode: Mode;
  teacherId: string;
  data: TeacherAvailability;
}) {
  const pendingRemovalIds = data.requests
    .filter((r) => r.status === "pending" && r.kind === "remove_weekly" && r.availability_id)
    .map((r) => r.availability_id!);

  return (
    <div className={styles.grid}>
      <div className={styles.stackGap}>
        <Card>
          <WeeklyAvailability
            mode={mode}
            teacherId={teacherId}
            hours={data.hours}
            slots={data.slots}
            pendingRemovalIds={pendingRemovalIds}
            today={data.today}
          />
        </Card>
        {/* On a card, so the heading never sits on the decorative background. */}
        <Card>
          <section aria-labelledby="requests-title">
            <h2 id="requests-title" className={`text-h3 ${stack.sectionTitle}`}>
              {mode === "teacher" ? "הבקשות שלי" : "בקשות המורה"}
            </h2>
            <RequestsTable rows={data.requests} mode={mode} empty="אין בקשות להסרת זמינות או להיעדרות." />
          </section>
        </Card>
      </div>

      <div className={styles.stackGap}>
        <Card>
          <div className={styles.cardHeader}>
            <h2 className="text-h3">היעדרויות קרובות</h2>
            <AbsenceDialog mode={mode} teacherId={teacherId} today={data.today} hours={data.hours} />
          </div>
          {data.absences.length ? (
            <ul className={styles.list}>
              {data.absences.map((a) => (
                <li key={a.id} className={styles.listItem}>
                  <span>{dateRange(a.start_date, a.end_date)}</span>
                  <span className={styles.time}>{a.start_time && a.end_time ? timeRange(a.start_time, a.end_time) : "יום שלם"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>אין היעדרויות מאושרות.</p>
          )}
        </Card>
        {mode === "teacher" && (
          <Card>
            <h2 className="text-h3">ימי סגירה קרובים</h2>
            {data.closures.length ? (
              <ul className={styles.list}>
                {data.closures.map((c) => (
                  <li key={c.id} className={styles.listItem}>
                    <span>{c.name}</span>
                    <span>{dateRange(c.start_date, c.end_date)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>לא הוגדרו ימי סגירה קרובים.</p>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
