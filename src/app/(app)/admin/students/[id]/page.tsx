import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StudentSubjectsList } from "@/components/students/StudentSubjectsList";
import { Alert } from "@/components/ui/Alert";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ConfirmAction } from "@/components/ui/ConfirmAction";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import stack from "@/components/ui/Stack.module.css";
import table from "@/components/ui/Table.module.css";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { ageOn, formatDay } from "@/lib/students/age";
import { RETURN_MODE_LABELS, STUDENT_STATUS_LABELS } from "@/lib/students/labels";
import { getStudent } from "@/lib/students/queries";
import { createClient } from "@/lib/supabase/server";
import { removeStudentSubject, setStudentStatus } from "../actions";
import { StudentDialog } from "../StudentDialog";
import { StudentStatusDialog } from "../StudentStatusDialog";
import { StudentSubjectDialog } from "../StudentSubjectDialog";
import styles from "../Students.module.css";

export const metadata: Metadata = { title: "פרטי תלמיד" };

export default async function StudentDetailsPage({ params, searchParams }: PageProps<"/admin/students/[id]">) {
  await requireRole(ADMIN_ROLES);
  const { id } = await params;
  const { tab, notice } = await searchParams;
  const current = tab === "subjects" ? "subjects" : "general";

  const supabase = await createClient();
  const [detail, { data: lessonTypes }, { data: teachers }] = await Promise.all([
    getStudent(supabase, id, { withContacts: true }),
    supabase.from("lesson_types").select("id, name").order("name"),
    supabase.from("teachers").select("id, full_name, status, teacher_skills(lesson_type_id)").order("full_name"),
  ]);
  if (!detail) notFound();
  const { student, contacts, subjects } = detail;

  const active = student.status === "active";
  const enrolled = new Set(subjects.map((s) => s.lessonType.id));
  const teacherOptions = (teachers ?? []).map((t) => ({
    id: t.id,
    full_name: t.full_name,
    active: t.status === "active",
    lessonTypeIds: t.teacher_skills.map((s) => s.lesson_type_id),
  }));
  const base = `/admin/students/${student.id}`;

  return (
    <div className={stack.page}>
      <Link href="/admin/students" className={stack.back}>
        <ArrowRight size={18} aria-hidden="true" />
        חזרה לרשימת התלמידים
      </Link>

      {notice === "created" && <Alert tone="success">התלמיד נוסף. עכשיו אפשר לרשום אותו לתחומי לימוד.</Alert>}

      <PageHeader
        title={
          <span className={styles.title}>
            <Avatar name={student.full_name} size="large" />
            {student.full_name}
          </span>
        }
        subtitle={
          <span className={styles.subtitle}>
            <span>גיל {ageOn(student.birth_date)}</span>
            <Badge tone={STUDENT_STATUS_LABELS[student.status].tone}>{STUDENT_STATUS_LABELS[student.status].label}</Badge>
          </span>
        }
        actions={
          <StudentDialog
            student={{
              id: student.id,
              full_name: student.full_name,
              birth_date: student.birth_date,
              phone: contacts?.phone ?? null,
              email: contacts?.email ?? null,
              parent_name: contacts?.parent_name ?? null,
              parent_phone: contacts?.parent_phone ?? null,
              parent_email: contacts?.parent_email ?? null,
            }}
          />
        }
      />

      {/* Lesson history (M5) and attendance (M7) tabs are added in later milestones. */}
      <Tabs
        label="פרטי תלמיד"
        items={[
          { key: "general", href: base, label: "פרטים כלליים" },
          { key: "subjects", href: `${base}?tab=subjects`, label: `תחומי לימוד (${subjects.length})` },
        ]}
        current={current}
      />

      {current === "general" ? (
        <div className={styles.grid}>
          <Card>
            <h2 className={`text-h3 ${stack.sectionTitle}`}>פרטים אישיים ופרטי קשר</h2>
            <dl className={stack.details}>
              <dt>תאריך לידה</dt>
              <dd>
                {formatDay(student.birth_date)} (גיל {ageOn(student.birth_date)})
              </dd>
              <dt>טלפון</dt>
              <dd className={table.ltr}>{contacts?.phone || "—"}</dd>
              <dt>אימייל</dt>
              <dd className={table.ltr}>{contacts?.email || "—"}</dd>
              {(contacts?.parent_name || contacts?.parent_phone || contacts?.parent_email) && (
                <>
                  <dt>שם ההורה</dt>
                  <dd>{contacts?.parent_name || "—"}</dd>
                  <dt>טלפון ההורה</dt>
                  <dd className={table.ltr}>{contacts?.parent_phone || "—"}</dd>
                  <dt>אימייל ההורה</dt>
                  <dd className={table.ltr}>{contacts?.parent_email || "—"}</dd>
                </>
              )}
            </dl>
          </Card>

          <Card>
            <h2 className={`text-h3 ${stack.sectionTitle}`}>סטטוס</h2>
            <dl className={stack.details}>
              <dt>סטטוס</dt>
              <dd>
                <Badge tone={STUDENT_STATUS_LABELS[student.status].tone}>{STUDENT_STATUS_LABELS[student.status].label}</Badge>
              </dd>
              {!active && (
                <>
                  <dt>תאריך חזרה משוער</dt>
                  <dd>{student.expected_return_date ? formatDay(student.expected_return_date) : "לא נקבע"}</dd>
                  {student.return_mode && (
                    <>
                      <dt>בתאריך החזרה</dt>
                      <dd>{RETURN_MODE_LABELS[student.return_mode].label}</dd>
                    </>
                  )}
                </>
              )}
            </dl>
            {student.return_mode && (
              <p className="text-small text-secondary">
                {RETURN_MODE_LABELS[student.return_mode].description}
              </p>
            )}
            <div className={stack.inlineActions}>
              {active ? (
                <StudentStatusDialog studentId={student.id} />
              ) : (
                <>
                  <ConfirmAction
                    action={setStudentStatus}
                    fields={{ id: student.id, status: "active" }}
                    trigger="הפוך לפעיל"
                    triggerVariant="primary"
                    title="הפיכת התלמיד לפעיל"
                    description="התלמיד יחזור להיות פעיל. שיבוצים קודמים אינם חוזרים אוטומטית, ותאריך החזרה המשוער יימחק."
                    confirmLabel="הפוך לפעיל"
                  />
                  <StudentStatusDialog
                    studentId={student.id}
                    current={{ returnDate: student.expected_return_date, returnMode: student.return_mode }}
                  />
                </>
              )}
            </div>
          </Card>
        </div>
      ) : (
        <section aria-labelledby="subjects-title" className={stack.page}>
          <PageHeader
            level={2}
            title={<span id="subjects-title">תחומי לימוד</span>}
            actions={
              <StudentSubjectDialog
                studentId={student.id}
                availableLessonTypes={(lessonTypes ?? []).filter((lt) => !enrolled.has(lt.id))}
                teachers={teacherOptions}
              />
            }
          />
          <StudentSubjectsList
            subjects={subjects}
            emptyText="התלמיד עדיין לא רשום לאף תחום לימוד."
            actions={(s) => (
              <>
                <StudentSubjectDialog
                  studentId={student.id}
                  availableLessonTypes={[]}
                  teachers={teacherOptions}
                  subject={{
                    id: s.id,
                    lessonTypeId: s.lessonType.id,
                    lessonTypeName: s.lessonType.name,
                    teacherId: s.teacherId,
                    level: s.level,
                    background: s.background,
                  }}
                />
                <ConfirmAction
                  action={removeStudentSubject}
                  fields={{ id: s.id, studentId: student.id }}
                  trigger={`הסרת ${s.lessonType.name}`}
                  triggerVariant="ghost"
                  title={`הסרת התלמיד מתחום ${s.lessonType.name}`}
                  description="השיוך למורה, הרמה והרקע המקצועי בתחום זה יימחקו. אפשר לרשום את התלמיד לתחום מחדש בכל עת."
                  confirmLabel="הסרה"
                  confirmVariant="danger"
                />
              </>
            )}
          />
        </section>
      )}
    </div>
  );
}
