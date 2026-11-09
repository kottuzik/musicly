import type { Metadata } from "next";
import Link from "next/link";
import { ExportLink } from "@/components/export/ExportLink";
import { NoticeAlert } from "../../NoticeAlert";
import { DeleteStudentButton } from "@/components/deletion/DeleteButtons";
import { DeletedPeopleTable } from "@/components/deletion/DeletedPeopleTable";
import { Tabs } from "@/components/ui/Tabs";
import { BookForStudentButton, StudentBookingProvider } from "@/components/lessons/StudentBooking";
import { StudentDetails } from "@/components/students/StudentDetails";
import { StudentRow } from "@/components/students/StudentRow";
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
import { loadBookingOptions } from "@/lib/lessons/queries";
import { listStudents, loadStudentAbsences, readFilters } from "@/lib/students/queries";
import { createClient } from "@/lib/supabase/server";
import { deleteStudentHistory, restoreStudent } from "./actions";
import { StudentDialog } from "./StudentDialog";
import styles from "./Students.module.css";

export const metadata: Metadata = { title: "תלמידים" };

export default async function StudentsPage({ searchParams }: PageProps<"/admin/students">) {
  await requireRole(ADMIN_ROLES);
  const params = await searchParams;
  const deletedView = params.view === "deleted";
  const filters = readFilters(params);

  const supabase = await createClient();
  if (deletedView) {
    const [{ data: deleted }, { data: canDelete }] = await Promise.all([
      supabase.rpc("list_deleted_people", { p_kind: "student" }),
      supabase.rpc("can_delete_student_history"),
    ]);
    return (
      <div className={stack.page}>
        <PageHeader title="תלמידים" />
        <StudentTabs current="deleted" />
        <p className="text-secondary">
          תלמיד שנמחק מוסתר ל־30 יום ואפשר לשחזר אותו. אחר כך הפרופיל ופרטי הקשר נמחקים, ונשארת היסטוריית שיעורים מינימלית.
        </p>
        <DeletedPeopleTable
          kind="student"
          rows={deleted ?? []}
          restore={restoreStudent}
          deleteHistory={deleteStudentHistory}
          canDeleteHistory={Boolean(canDelete)}
        />
      </div>
    );
  }
  const [{ rows, total }, { data: lessonTypes }, { data: teachers }, bookingOptions] = await Promise.all([
    listStudents(supabase, filters, { withContacts: true }),
    supabase.from("lesson_types").select("id, name").order("name"),
    supabase.from("teachers").select("id, full_name").is("deleted_at", null).order("full_name"),
    loadBookingOptions(supabase),
  ]);
  const absences = await loadStudentAbsences(supabase, rows.map((r) => r.id));
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className={stack.page}>
      <NoticeAlert notice={params.notice} />
      <PageHeader
        title="תלמידים"
        actions={
          <>
            <ExportLink kind="students" params={{ ...filters }} />
            <StudentDialog />
          </>
        }
      />
      <StudentTabs current="active" />

      <StudentFiltersForm
        filters={filters}
        lessonTypes={lessonTypes ?? []}
        teachers={(teachers ?? []).map((t) => ({ id: t.id, name: t.full_name }))}
      />

      <p className={toolbar.count} role="status">
        {hasFilters ? `נמצאו ${rows.length} מתוך ${total} תלמידים. ` : `${total} תלמידים. `}
        {hasFilters && <Link href="/admin/students">ניקוי סינון</Link>}
      </p>

      <StudentBookingProvider options={bookingOptions}>
      <div className={table.wrapper} tabIndex={0}>
        {rows.length ? (
          <table className={table.table}>
            <thead>
              <tr>
                <th scope="col">שם</th>
                <th scope="col">גיל</th>
                <th scope="col">תחומי לימוד</th>
                <th scope="col">טלפון</th>
                <th scope="col">סטטוס</th>
                <th scope="col">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <StudentRow
                  key={s.id}
                  label={s.fullName}
                  columns={6}
                  name={
                    <>
                      <Avatar name={s.fullName} />
                      <Link href={`/admin/students/${s.id}`}>{s.fullName}</Link>
                    </>
                  }
                  cells={
                    <>
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
                  <td data-label="פעולות">
                    <div className={table.actions}>
                      {s.status === "active" && <BookForStudentButton id={s.id} name={s.fullName} />}
                      <DeleteStudentButton id={s.id} name={s.fullName} inRow />
                    </div>
                  </td>
                    </>
                  }
                  details={<StudentDetails student={s} absences={absences.get(s.id)} />}
                />
              ))}
            </tbody>
          </table>
        ) : (
          <p className={table.empty}>
            {total ? "לא נמצאו תלמידים התואמים לחיפוש." : "עדיין לא נוספו תלמידים. הוסיפו את התלמיד הראשון."}
          </p>
        )}
      </div>
      </StudentBookingProvider>
    </div>
  );
}

function StudentTabs({ current }: { current: "active" | "deleted" }) {
  return (
    <Tabs
      label="תצוגת תלמידים"
      items={[
        { key: "active", href: "/admin/students", label: "תלמידים" },
        { key: "deleted", href: "/admin/students?view=deleted", label: "נמחקו לאחרונה" },
      ]}
      current={current}
    />
  );
}
