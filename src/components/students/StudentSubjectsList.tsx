import type { ReactNode } from "react";
import { Badge, ColorChip } from "@/components/ui/Badge";
import type { StudentSubjectView } from "@/lib/students/queries";
import { LEVEL_LABELS } from "@/lib/students/labels";
import styles from "./StudentSubjectsList.module.css";

// One card per subject: regular teacher, level and background. Actions are supplied per subject by the page.
export function StudentSubjectsList({
  subjects,
  actions,
  emptyText,
}: {
  subjects: StudentSubjectView[];
  actions?: (subject: StudentSubjectView) => ReactNode;
  emptyText: string;
}) {
  if (!subjects.length) return <p className={styles.empty}>{emptyText}</p>;
  return (
    <ul className={styles.list}>
      {subjects.map((s) => {
        const itemActions = actions?.(s);
        return (
          <li key={s.id} className={styles.item}>
            <div className={styles.head}>
              <h3 className="text-h3">
                <ColorChip color={s.lessonType.color}>{s.lessonType.name}</ColorChip>
              </h3>
              <Badge tone="primary">{LEVEL_LABELS[s.level]}</Badge>
            </div>
            <dl className={styles.details}>
              <dt>מורה קבוע</dt>
              <dd>
                {s.teacherName}
                {s.teacherInactive && (
                  <>
                    {" "}
                    <Badge tone="warning">מורה לא פעיל</Badge>
                  </>
                )}
              </dd>
              <dt>רקע מקצועי</dt>
              <dd className={styles.background}>{s.background || "—"}</dd>
            </dl>
            {itemActions && <div className={styles.actions}>{itemActions}</div>}
          </li>
        );
      })}
    </ul>
  );
}
