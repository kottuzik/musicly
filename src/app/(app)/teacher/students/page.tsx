import type { Metadata } from "next";
import Link from "next/link";
import { StudentFiltersForm } from "@/components/students/StudentFiltersForm";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, ColorChip } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import stack from "@/components/ui/Stack.module.css";
import table from "@/components/ui/Table.module.css";
import toolbar from "@/components/ui/Toolbar.module.css";
import { ageOn } from "@/lib/students/age";
import { LEVEL_LABELS, STUDENT_STATUS_LABELS } from "@/lib/students/labels";
import { listStudents, readFilters } from "@/lib/students/queries";
import { requireActiveTeacher } from "@/lib/students/teacher";

export const metadata: Metadata = { title: "התלמידים שלי" };

export default async function MyStudentsPage({ searchParams }: PageProps<"/teacher/students">) {
  const { supabase, teacherId } = await requireActiveTeacher();
  // Teachers have no teacher filter; contact details are never queried for them.
  const filters = { ...readFilters(await searchParams), teacher: "" };

  const [{ rows, total }, { data: lessonTypes }] = await Promise.all([
    listStudents(supabase, filters, { withContacts: false }),
    supabase.from("lesson_types").select("id, name").order("name"),
  ]);
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className={stack.page}>
      <PageHeader title="התלמידים שלי" subtitle="תלמידים שאתם המורה הקבוע שלהם לפחות בתחום אחד." />

      <StudentFiltersForm filters={filters} lessonTypes={lessonTypes ?? []} />

      <p className={toolbar.count} role="status">
        {hasFilters ? `נמצאו ${rows.length} מתוך ${total} תלמידים. ` : `${total} תלמידים. `}
        {hasFilters && <Link href="/teacher/students">ניקוי סינון</Link>}
      </p>

      <div className={table.wrapper}>
        {rows.length ? (
          <table className={table.table}>
            <thead>
              <tr>
                <th scope="col">שם</th>
                <th scope="col">גיל</th>
                <th scope="col">התחומים שאני מלמד/ת</th>
                <th scope="col">סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className={table.primaryCell}>
                      <Avatar name={s.fullName} />
                      <Link href={`/teacher/students/${s.id}`}>{s.fullName}</Link>
                    </div>
                  </td>
                  <td data-label="גיל">{ageOn(s.birthDate)}</td>
                  <td data-label="התחומים שלי">
                    <div className={table.chips}>
                      {s.subjects
                        .filter((sub) => sub.teacherId === teacherId)
                        .map((sub) => (
                          <ColorChip key={sub.id} color={sub.lessonType.color}>
                            {sub.lessonType.name} · {LEVEL_LABELS[sub.level]}
                          </ColorChip>
                        ))}
                    </div>
                  </td>
                  <td data-label="סטטוס">
                    <Badge tone={STUDENT_STATUS_LABELS[s.status].tone}>{STUDENT_STATUS_LABELS[s.status].label}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={table.empty}>
            {total ? "לא נמצאו תלמידים התואמים לחיפוש." : "עדיין לא שויכו אליך תלמידים."}
          </p>
        )}
      </div>
    </div>
  );
}
