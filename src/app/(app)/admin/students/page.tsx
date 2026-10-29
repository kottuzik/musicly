import type { Metadata } from "next";
import Link from "next/link";
import { StudentFiltersForm } from "@/components/students/StudentFiltersForm";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, ColorChip } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import stack from "@/components/ui/Stack.module.css";
import table from "@/components/ui/Table.module.css";
import toolbar from "@/components/ui/Toolbar.module.css";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { ageOn } from "@/lib/students/age";
import { STUDENT_STATUS_LABELS } from "@/lib/students/labels";
import { listStudents, readFilters } from "@/lib/students/queries";
import { createClient } from "@/lib/supabase/server";
import { StudentDialog } from "./StudentDialog";
import styles from "./Students.module.css";

export const metadata: Metadata = { title: "תלמידים" };

export default async function StudentsPage({ searchParams }: PageProps<"/admin/students">) {
  await requireRole(ADMIN_ROLES);
  const filters = readFilters(await searchParams);

  const supabase = await createClient();
  const [{ rows, total }, { data: lessonTypes }, { data: teachers }] = await Promise.all([
    listStudents(supabase, filters, { withContacts: true }),
    supabase.from("lesson_types").select("id, name").order("name"),
    supabase.from("teachers").select("id, full_name").order("full_name"),
  ]);
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className={stack.page}>
      <PageHeader title="תלמידים" actions={<StudentDialog />} />

      <StudentFiltersForm
        filters={filters}
        lessonTypes={lessonTypes ?? []}
        teachers={(teachers ?? []).map((t) => ({ id: t.id, name: t.full_name }))}
      />

      <p className={toolbar.count} role="status">
        {hasFilters ? `נמצאו ${rows.length} מתוך ${total} תלמידים. ` : `${total} תלמידים. `}
        {hasFilters && <Link href="/admin/students">ניקוי סינון</Link>}
      </p>

      <div className={table.wrapper}>
        {rows.length ? (
          <table className={table.table}>
            <thead>
              <tr>
                <th scope="col">שם</th>
                <th scope="col">גיל</th>
                <th scope="col">תחומי לימוד</th>
                <th scope="col">טלפון</th>
                <th scope="col">סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className={table.primaryCell}>
                      <Avatar name={s.fullName} />
                      <Link href={`/admin/students/${s.id}`}>{s.fullName}</Link>
                    </div>
                  </td>
                  <td data-label="גיל">{ageOn(s.birthDate)}</td>
                  <td data-label="תחומי לימוד">
                    {s.subjects.length ? (
                      <div className={table.chips}>
                        {s.subjects.map((sub) => (
                          <ColorChip key={sub.id} color={sub.lessonType.color}>
                            {sub.lessonType.name}
                          </ColorChip>
                        ))}
                      </div>
                    ) : (
                      <span className="text-secondary">טרם נרשם לתחום</span>
                    )}
                  </td>
                  <td data-label="טלפון">
                    {s.phone ? (
                      <span className={table.ltr}>{s.phone}</span>
                    ) : s.parentPhone ? (
                      <>
                        <span className={table.ltr}>{s.parentPhone}</span>
                        <span className={`text-small text-secondary ${styles.phoneLabel}`}>(הורה)</span>
                      </>
                    ) : (
                      "—"
                    )}
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
            {total ? "לא נמצאו תלמידים התואמים לחיפוש." : "עדיין לא נוספו תלמידים. הוסיפו את התלמיד הראשון."}
          </p>
        )}
      </div>
    </div>
  );
}
