import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CreateInviteButton } from "@/components/invitations/CreateInviteButton";
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
import { ACCOUNT_LABELS, STATUS_LABELS, accountState, formatDate } from "@/lib/teachers/account";
import { createClient } from "@/lib/supabase/server";
import { createTeacherInvitation, revokeInvitation, setTeacherStatus } from "../actions";
import { TeacherDialog } from "../TeacherDialog";
import styles from "./TeacherDetails.module.css";

export const metadata: Metadata = { title: "פרטי מורה" };

export default async function TeacherDetailsPage({ params, searchParams }: PageProps<"/admin/teachers/[id]">) {
  await requireRole(ADMIN_ROLES);
  const { id } = await params;
  const { notice } = await searchParams;

  const supabase = await createClient();
  const [{ data: teacher }, { data: lessonTypes }, { data: invitations }] = await Promise.all([
    supabase
      .from("teachers")
      .select("id, full_name, email, phone, status, profile_id, teacher_skills(lesson_types(id, name, color))")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("lesson_types").select("id, name, color").order("name"),
    supabase.rpc("list_open_invitations"),
  ]);
  if (!teacher) notFound();

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
        <Alert tone="success">
          המורה נוסף. כדי שיוכל להתחבר, צרו עבורו קישור הרשמה ושלחו אותו אליו.
        </Alert>
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
                email: teacher.email,
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
            />
          </>
        }
      />

      {/* Availability (M4) and lesson history (M5) tabs are added in later milestones. */}
      <Tabs label="פרטי מורה" items={[{ key: "general", href: `/admin/teachers/${teacher.id}`, label: "פרטים כלליים" }]} current="general" />

      <div className={styles.grid}>
        <Card>
          <h2 className={`text-h3 ${stack.sectionTitle}`}>פרטים כלליים</h2>
          <dl className={stack.details}>
            <dt>טלפון</dt>
            <dd className={table.ltr}>{teacher.phone || "—"}</dd>
            <dt>אימייל</dt>
            <dd className={table.ltr}>{teacher.email}</dd>
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
    </div>
  );
}
