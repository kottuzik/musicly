import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClearNotice } from "@/components/ClearNotice";
import { HistoryLessons } from "@/components/attendance/HistoryLessons";
import { AvailabilityPanel } from "@/components/availability/AvailabilityPanel";
import { CreateInviteButton } from "@/components/invitations/CreateInviteButton";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";
import { Alert } from "@/components/ui/Alert";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, ColorChip } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ConfirmAction } from "@/components/ui/ConfirmAction";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import stack from "@/components/ui/Stack.module.css";
import table from "@/components/ui/Table.module.css";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { loadTeacherAvailability } from "@/lib/availability/queries";
import { STUDENT_STATUS_LABELS } from "@/lib/students/labels";
import { loadHistoryLessons } from "@/lib/lessons/queries";
import { isMonth } from "@/lib/lessons/time";
import { schoolToday } from "@/lib/students/age";
import { ACCOUNT_LABELS, STATUS_LABELS, accountState, formatDate } from "@/lib/teachers/account";
import { createClient } from "@/lib/supabase/server";
import { TeacherImpactNotice } from "@/components/impact/ImpactNotices";
import { AvailabilityModeField } from "@/components/deletion/RestoreFields";
import { DeleteTeacherButton } from "@/components/deletion/DeleteButtons";
import { createTeacherInvitation, revokeInvitation, setTeacherStatus } from "../actions";
import { TeacherDialog } from "../TeacherDialog";
import styles from "./TeacherDetails.module.css";

export const metadata: Metadata = { title: "פרטי מורה" };

const LIVE_TABLES = ["teacher_availability", "availability_requests", "teacher_absences", "operating_hours"];

export default async function TeacherDetailsPage({ params, searchParams }: PageProps<"/admin/teachers/[id]">) {
  await requireRole(ADMIN_ROLES);
  const { id } = await params;
  const { notice, tab: tabParam, month: monthParam } = await searchParams;
  const tab = tabParam === "availability" ? "availability" : tabParam === "history" ? "history" : "general";
  const month = typeof monthParam === "string" && isMonth(monthParam) ? monthParam : schoolToday().slice(0, 7);

  const supabase = await createClient();
  const [{ data: teacher }, { data: lessonTypes }, { data: invitations }] = await Promise.all([
    supabase
      .from("teachers")
      .select("id, full_name, email, phone, status, profile_id, deleted_at, teacher_skills(lesson_types(id, name, color))")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("lesson_types").select("id, name, color").order("name"),
    supabase.rpc("list_open_invitations"),
  ]);
  // A deleted teacher is only reachable from the "recently deleted" list.
  if (!teacher || teacher.deleted_at || !teacher.email) notFound();
  const email = teacher.email;

  // The students this teacher is the regular teacher of, with the subject of each enrollment.
  const students = tab === "general" ? await loadTeacherStudents(supabase, teacher.id) : [];

  const skills = teacher.teacher_skills.flatMap((s) => (s.lesson_types ? [s.lesson_types] : []));
  const account = accountState(Boolean(teacher.profile_id), invitations?.find((i) => i.teacher_id === teacher.id));
  const active = teacher.status === "active";

  return (
    <div className={stack.page}>
      <Link href="/admin/teachers" className={stack.back}>
        <ArrowRight size={18} aria-hidden="true" />
        חזרה לרשימת המורים
      </Link>

      {notice === "created" && (
        <>
          <ClearNotice />
          <Alert tone="success">המורה נוסף. כדי שיוכל להתחבר, צרו עבורו קישור הרשמה ושלחו אותו אליו.</Alert>
        </>
      )}

      <PageHeader
        title={
          <span className={styles.title}>
            <Avatar name={teacher.full_name} size="large" />
            {teacher.full_name}
          </span>
        }
        subtitle={<Badge tone={STATUS_LABELS[teacher.status].tone}>{STATUS_LABELS[teacher.status].label}</Badge>}
        actions={
          <>
            <TeacherDialog
              lessonTypes={lessonTypes ?? []}
              teacher={{
                id: teacher.id,
                full_name: teacher.full_name,
                email,
                phone: teacher.phone,
                lessonTypeIds: skills.map((s) => s.id),
                registered: Boolean(teacher.profile_id),
              }}
            />
            <ConfirmAction
              action={setTeacherStatus}
              fields={{ id: teacher.id, status: active ? "inactive" : "active" }}
              trigger={active ? "הפוך ללא פעיל" : "הפוך לפעיל"}
              triggerVariant="outline"
              title={active ? "הפיכת המורה ללא פעיל" : "הפיכת המורה לפעיל"}
              description={
                active
                  ? "מורה לא פעיל יוכל להתחבר רק לצפייה בהיסטוריית השיעורים שלו, ולא ניתן יהיה לשבץ לו שיעורים חדשים."
                  : "המורה יוכל שוב להתחבר ולעבוד במערכת באופן מלא."
              }
              confirmLabel={active ? "הפוך ללא פעיל" : "הפוך לפעיל"}
            >
              {active ? <TeacherImpactNotice teacherId={teacher.id} /> : <AvailabilityModeField />}
            </ConfirmAction>
            <DeleteTeacherButton id={teacher.id} name={teacher.full_name} trigger="מחיקת מורה" />
          </>
        }
      />

      <Tabs
        label="פרטי מורה"
        items={[
          { key: "general", href: `/admin/teachers/${teacher.id}`, label: "פרטים כלליים" },
          { key: "availability", href: `/admin/teachers/${teacher.id}?tab=availability`, label: "זמינות" },
          { key: "history", href: `/admin/teachers/${teacher.id}?tab=history`, label: "היסטוריית שיעורים" },
        ]}
        current={tab}
      />

      {tab === "history" ? (
        <>
          <LiveRefresh tables={["lessons", "attendance"]} />
          <HistoryLessons
            lessons={await loadHistoryLessons(supabase, month, { teacherId: teacher.id })}
            month={month}
            hrefForMonth={(m) => `/admin/teachers/${teacher.id}?tab=history&month=${m}`}
            showStudent
            showTeacher={false}
            canReport
            asOf={new Date().toISOString()}
            empty="אין שיעורים למורה בחודש הזה."
          />
        </>
      ) : tab === "availability" ? (
        <>
          <LiveRefresh tables={LIVE_TABLES} />
          {!active && <Alert tone="warning">המורה אינו פעיל, ולכן אי אפשר להוסיף לו זמינות.</Alert>}
          <AvailabilityPanel mode="admin" teacherId={teacher.id} data={await loadTeacherAvailability(supabase, teacher.id)} />
        </>
      ) : (
        <div className={styles.grid}>
          <Card>
            <h2 className={`text-h3 ${stack.sectionTitle}`}>פרטים כלליים</h2>
            <dl className={stack.details}>
              <dt>טלפון</dt>
              <dd className={table.ltr}>{teacher.phone || "—"}</dd>
              <dt>אימייל</dt>
              <dd className={table.ltr}>{email}</dd>
              <dt>תחומי הוראה</dt>
              <dd>
                <div className={table.chips}>
                  {skills.map((s) => (
                    <ColorChip key={s.id} color={s.color}>
                      {s.name}
                    </ColorChip>
                  ))}
                </div>
              </dd>
            </dl>
          </Card>

          <Card className={styles.studentsCard}>
            <h2 className={`text-h3 ${stack.sectionTitle}`}>תלמידים משויכים ({students.length})</h2>
            {students.length ? (
              <ul className={styles.students}>
                {students.map((st) => (
                  <li key={st.id}>
                    <Link href={`/admin/students/${st.id}`}>{st.name}</Link>
                    {st.status === "inactive" && (
                      <Badge tone={STUDENT_STATUS_LABELS.inactive.tone}>{STUDENT_STATUS_LABELS.inactive.label}</Badge>
                    )}
                    <span className={table.chips}>
                      {st.subjects.map((sub) => (
                        <ColorChip key={sub.id} color={sub.color}>
                          {sub.name}
                        </ColorChip>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-secondary">אין תלמידים משויכים למורה.</p>
            )}
          </Card>

          <Card>
            <h2 className={`text-h3 ${stack.sectionTitle}`}>חשבון במערכת</h2>
            <div className={styles.account}>
              <Badge tone={ACCOUNT_LABELS[account.kind].tone}>{ACCOUNT_LABELS[account.kind].label}</Badge>
              <p className="text-secondary">
                {account.kind === "registered" && "המורה נרשם ויכול להתחבר עם האימייל והסיסמה שלו."}
                {account.kind === "invited" && `נוצר קישור הרשמה שתקף עד ${formatDate(account.expiresAt)}.`}
                {account.kind === "expired" && `תוקף הקישור פג ב־${formatDate(account.expiresAt)}. צרו קישור חדש.`}
                {account.kind === "none" && "המורה עדיין לא קיבל קישור הרשמה."}
              </p>
            </div>
            {account.kind !== "registered" && (
              <div className={stack.inlineActions}>
                <CreateInviteButton
                  action={createTeacherInvitation}
                  fields={{ id: teacher.id }}
                  label={account.kind === "none" ? "צור קישור הרשמה" : "צור קישור חדש"}
                />
                {account.kind !== "none" && (
                  <ConfirmAction
                    action={revokeInvitation}
                    fields={{ id: account.invitationId, teacherId: teacher.id }}
                    trigger="בטל קישור"
                    triggerVariant="ghost"
                    title="ביטול קישור ההרשמה"
                    description="הקישור שנשלח למורה יפסיק לעבוד. אפשר ליצור קישור חדש בכל עת."
                    confirmLabel="בטל קישור"
                    confirmVariant="danger"
                  />
                )}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

type Client = Awaited<ReturnType<typeof createClient>>;

async function loadTeacherStudents(supabase: Client, teacherId: string) {
  const { data } = await supabase
    .from("student_subjects")
    .select("id, students!inner(id, full_name, status, deleted_at), lesson_types(id, name, color)")
    .eq("regular_teacher_id", teacherId)
    .is("students.deleted_at", null);

  const byStudent = new Map<string, { id: string; name: string; status: "active" | "inactive"; subjects: { id: string; name: string; color: string }[] }>();
  for (const row of data ?? []) {
    if (!row.students || !row.lesson_types) continue;
    const entry = byStudent.get(row.students.id) ?? {
      id: row.students.id,
      name: row.students.full_name,
      status: row.students.status,
      subjects: [],
    };
    entry.subjects.push({ id: row.id, name: row.lesson_types.name, color: row.lesson_types.color });
    byStudent.set(row.students.id, entry);
  }
  return [...byStudent.values()].sort((a, b) => a.name.localeCompare(b.name, "he"));
}
