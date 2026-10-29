import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProfessionalInfoDialog } from "@/components/students/ProfessionalInfoDialog";
import { StudentSubjectsList } from "@/components/students/StudentSubjectsList";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import stack from "@/components/ui/Stack.module.css";
import { ageOn } from "@/lib/students/age";
import { STUDENT_STATUS_LABELS } from "@/lib/students/labels";
import { getStudent } from "@/lib/students/queries";
import { requireActiveTeacher } from "@/lib/students/teacher";
import styles from "../../../admin/students/Students.module.css";

export const metadata: Metadata = { title: "פרטי תלמיד" };

export default async function TeacherStudentPage({ params }: PageProps<"/teacher/students/[id]">) {
  const { supabase, teacherId } = await requireActiveTeacher();
  const { id } = await params;
  // RLS returns nothing for a student who is not the teacher's, so it looks the same as a missing one.
  const detail = await getStudent(supabase, id, { withContacts: false });
  if (!detail) notFound();
  const { student, subjects } = detail;

  return (
    <div className={stack.page}>
      <Link href="/teacher/students" className={stack.back}>
        <ArrowRight size={18} aria-hidden="true" />
        חזרה לתלמידים שלי
      </Link>

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
      />

      <section aria-labelledby="subjects-title" className={stack.page}>
        <h2 id="subjects-title" className="text-h3">
          תחומי לימוד ומידע מקצועי
        </h2>
        <p className="text-secondary">אפשר לערוך את הרמה והרקע המקצועי רק בתחומים שאתם מלמדים את התלמיד.</p>
        <StudentSubjectsList
          subjects={subjects}
          emptyText="אין לתלמיד תחומי לימוד."
          actions={(s) =>
            s.teacherId === teacherId ? (
              <ProfessionalInfoDialog
                studentId={student.id}
                subjectId={s.id}
                subjectName={s.lessonType.name}
                level={s.level}
                background={s.background}
              />
            ) : null
          }
        />
      </section>
    </div>
  );
}
