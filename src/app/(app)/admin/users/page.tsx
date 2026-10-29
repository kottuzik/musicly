import { Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CreateInviteButton } from "@/components/invitations/CreateInviteButton";
import { Alert } from "@/components/ui/Alert";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmAction } from "@/components/ui/ConfirmAction";
import { PageHeader } from "@/components/ui/PageHeader";
import { SelectField } from "@/components/ui/SelectField";
import stack from "@/components/ui/Stack.module.css";
import table from "@/components/ui/Table.module.css";
import toolbar from "@/components/ui/Toolbar.module.css";
import { ADMIN_ROLES, ROLE_LABELS, isSuperAdmin, type Role } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { ACCOUNT_LABELS, STATUS_LABELS, accountState, formatDate } from "@/lib/teachers/account";
import { createClient } from "@/lib/supabase/server";
import { revokeInvitation } from "../teachers/actions";
import { regenerateAdminInvitation, setAdminStatus } from "./actions";
import { InviteAdminDialog } from "./InviteAdminDialog";
import { PermissionsDialog } from "./PermissionsDialog";
import { TransferDialog } from "./TransferDialog";
import styles from "./Users.module.css";

export const metadata: Metadata = { title: "משתמשים" };

const ROLE_ORDER: Record<Role, number> = { super_admin: 0, admin: 1, teacher: 2 };

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const me = await requireRole(ADMIN_ROLES);
  const canManage = isSuperAdmin(me.role);
  const params = await searchParams;
  const q = param(params.q).trim().toLowerCase();
  const role = param(params.role);

  const supabase = await createClient();
  const [{ data: profiles }, { data: teachers }, { data: permissions }, { data: invitations }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, role, status"),
    supabase.from("teachers").select("id, profile_id"),
    supabase.from("admin_permissions").select("profile_id, delete_student_history"),
    supabase.rpc("list_open_invitations"),
  ]);

  const teacherByProfile = new Map((teachers ?? []).map((t) => [t.profile_id, t.id]));
  const permissionByProfile = new Map((permissions ?? []).map((p) => [p.profile_id, p.delete_student_history]));
  const users = (profiles ?? [])
    .filter((p) => (!q || p.full_name.toLowerCase().includes(q) || p.email.includes(q)) && (!role || p.role === role))
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.full_name.localeCompare(b.full_name, "he"));
  const pendingAdmins = (invitations ?? []).filter(
    (i) =>
      i.role === "admin" &&
      (!q || i.full_name.toLowerCase().includes(q) || i.email.includes(q)) &&
      (!role || role === "admin"),
  );
  const activeAdmins = (profiles ?? []).filter((p) => p.role === "admin" && p.status === "active");

  return (
    <div className={stack.page}>
      <PageHeader
        title="משתמשים"
        subtitle={canManage ? undefined : "צפייה בלבד. ניהול מנהלים והרשאות שמור למנהל הראשי."}
        actions={
          canManage && (
            <>
              <TransferDialog admins={activeAdmins} />
              <InviteAdminDialog />
            </>
          )
        }
      />
      {params.notice === "transferred" && (
        <Alert tone="success">תפקיד המנהל הראשי הועבר. כעת יש לך הרשאות של מנהל רגיל.</Alert>
      )}

      <form className={toolbar.toolbar} role="search" aria-label="חיפוש וסינון משתמשים">
        <div className={toolbar.search}>
          <label htmlFor="user-search" className="visually-hidden">
            חיפוש לפי שם או אימייל
          </label>
          <input id="user-search" name="q" type="search" placeholder="חיפוש משתמשים..." defaultValue={param(params.q)} />
          <Search size={18} aria-hidden="true" />
        </div>
        <SelectField
          label="תפקיד"
          hideLabel
          name="role"
          defaultValue={role}
          options={[
            { value: "", label: "כל התפקידים" },
            ...(Object.keys(ROLE_LABELS) as Role[]).map((r) => ({ value: r, label: ROLE_LABELS[r] })),
          ]}
        />
        <Button type="submit" variant="outline">
          סינון
        </Button>
      </form>

      <div className={table.wrapper}>
        {users.length || pendingAdmins.length ? (
          <table className={table.table}>
            <thead>
              <tr>
                <th scope="col">שם</th>
                <th scope="col">אימייל</th>
                <th scope="col">תפקיד</th>
                <th scope="col">סטטוס</th>
                <th scope="col">
                  <span className="visually-hidden">פעולות</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const teacherId = teacherByProfile.get(u.id);
                const isSelf = u.id === me.id;
                return (
                  <tr key={u.id}>
                    <td>
                      <div className={table.primaryCell}>
                        <Avatar name={u.full_name} />
                        {teacherId ? <Link href={`/admin/teachers/${teacherId}`}>{u.full_name}</Link> : u.full_name}
                        {isSelf && <span className="text-small text-secondary">(את/ה)</span>}
                      </div>
                    </td>
                    <td data-label="אימייל">
                      <span className={styles.email}>{u.email}</span>
                    </td>
                    <td data-label="תפקיד">
                      <Badge tone={u.role === "teacher" ? "neutral" : "primary"}>{ROLE_LABELS[u.role]}</Badge>
                    </td>
                    <td data-label="סטטוס">
                      <Badge tone={STATUS_LABELS[u.status].tone}>{STATUS_LABELS[u.status].label}</Badge>
                    </td>
                    <td>
                      <div className={table.actions}>
                        {canManage && u.role === "admin" && (
                          <>
                            <PermissionsDialog
                              profileId={u.id}
                              name={u.full_name}
                              deleteStudentHistory={permissionByProfile.get(u.id) ?? false}
                            />
                            <ConfirmAction
                              action={setAdminStatus}
                              fields={{ id: u.id, status: u.status === "active" ? "inactive" : "active" }}
                              trigger={u.status === "active" ? "הסרה" : "הפעלה מחדש"}
                              triggerVariant={u.status === "active" ? "danger" : "outline"}
                              title={u.status === "active" ? `הסרת ${u.full_name}` : `הפעלת ${u.full_name} מחדש`}
                              description={
                                u.status === "active"
                                  ? "החשבון יושבת והמנהל לא יוכל להתחבר. הנתונים נשמרים, ואפשר להפעיל אותו מחדש בכל עת."
                                  : "המנהל יוכל שוב להתחבר עם הסיסמה הקיימת שלו."
                              }
                              confirmLabel={u.status === "active" ? "הסר מנהל" : "הפעל מחדש"}
                              confirmVariant={u.status === "active" ? "danger" : "primary"}
                            />
                          </>
                        )}
                        {teacherId && (
                          <Link href={`/admin/teachers/${teacherId}`} className="text-small">
                            לפרטי המורה
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {pendingAdmins.map((i) => {
                const state = accountState(false, i);
                return (
                  <tr key={i.id}>
                    <td>
                      <div className={table.primaryCell}>
                        <Avatar name={i.full_name} />
                        {i.full_name}
                      </div>
                    </td>
                    <td data-label="אימייל">
                      <span className={styles.email}>{i.email}</span>
                    </td>
                    <td data-label="תפקיד">
                      <Badge tone="primary">{ROLE_LABELS.admin}</Badge>
                    </td>
                    <td data-label="סטטוס">
                      <Badge tone={ACCOUNT_LABELS[state.kind].tone}>
                        {state.kind === "invited"
                          ? `${ACCOUNT_LABELS.invited.label} (עד ${formatDate(i.expires_at)})`
                          : ACCOUNT_LABELS[state.kind].label}
                      </Badge>
                    </td>
                    <td>
                      {canManage && (
                        <div className={table.actions}>
                          <CreateInviteButton action={regenerateAdminInvitation} fields={{ id: i.id }} label="צור קישור חדש" />
                          <ConfirmAction
                            action={revokeInvitation}
                            fields={{ id: i.id }}
                            trigger="בטל הזמנה"
                            triggerVariant="ghost"
                            title="ביטול הזמנת מנהל"
                            description="קישור ההרשמה שנשלח יפסיק לעבוד."
                            confirmLabel="בטל הזמנה"
                            confirmVariant="danger"
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className={table.empty}>לא נמצאו משתמשים התואמים לחיפוש.</p>
        )}
      </div>
    </div>
  );
}
