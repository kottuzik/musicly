import { deleteStudent } from "@/app/(app)/admin/students/actions";
import { deleteTeacher } from "@/app/(app)/admin/teachers/actions";
import { StudentImpactNotice, TeacherImpactNotice } from "@/components/impact/ImpactNotices";
import { ConfirmAction } from "@/components/ui/ConfirmAction";
import styles from "./DeleteButtons.module.css";

// Soft-delete buttons, used in the list rows and on the detail pages (PRD §4.3, §4.4).
export function DeleteStudentButton({ id, name, trigger = "מחיקה", inRow }: { id: string; name: string; trigger?: string; inRow?: boolean }) {
  return (
    <ConfirmAction
      action={deleteStudent}
      fields={{ id }}
      trigger={trigger}
      triggerVariant="danger"
      triggerClassName={inRow ? styles.rowDelete : undefined}
      title={`מחיקת ${name}`}
      description="התלמיד יוסתר מהרשימות והמורים לא יראו אותו. שיעוריו העתידיים יבוטלו והשעות יתפנו. אפשר לשחזר אותו במשך 30 יום, אחר כך הפרופיל ופרטי הקשר נמחקים לצמיתות, ונשארת רק היסטוריית שיעורים מינימלית."
      confirmLabel="מחק תלמיד"
      confirmVariant="danger"
    >
      <StudentImpactNotice studentId={id} />
    </ConfirmAction>
  );
}

export function DeleteTeacherButton({ id, name, trigger = "מחיקה", inRow }: { id: string; name: string; trigger?: string; inRow?: boolean }) {
  return (
    <ConfirmAction
      action={deleteTeacher}
      fields={{ id }}
      trigger={trigger}
      triggerVariant="danger"
      triggerClassName={inRow ? styles.rowDelete : undefined}
      title={`מחיקת ${name}`}
      description="המורה יוסתר מהרשימות ולא יוכל להתחבר. שיעוריו העתידיים יישארו ויסומנו ”דורש טיפול”. אפשר לשחזר אותו במשך 30 יום, אחר כך החשבון ופרטי הקשר נמחקים לצמיתות, ושמו נשמר בהיסטוריית השיעורים."
      confirmLabel="מחק מורה"
      confirmVariant="danger"
    >
      <TeacherImpactNotice teacherId={id} />
    </ConfirmAction>
  );
}
