import { Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, ColorChip } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { SelectField } from "@/components/ui/SelectField";
import stack from "@/components/ui/Stack.module.css";
import table from "@/components/ui/Table.module.css";
import toolbar from "@/components/ui/Toolbar.module.css";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { ACCOUNT_LABELS, STATUS_LABELS, accountState } from "@/lib/teachers/account";
import { createClient } from "@/lib/supabase/server";
import { TeacherDialog } from "./TeacherDialog";

export const metadata: Metadata = { title: "מורים" };

const STATUS_FILTERS = [
  { value: "", label: "כל הסטטוסים" },
  { value: "active", label: "פעיל" },
  { value: "inactive", label: "לא פעיל" },
  { value: "unregistered", label: "טרם נרשם" },
];

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default async function TeachersPage({ searchParams }: PageProps<"/admin/teachers">) {
  await requireRole(ADMIN_ROLES);
  const params = await searchParams;
  const q = param(params.q).trim();
  const subject = param(params.subject);
  const status = param(params.status);

  const supabase = await createClient();
  const [{ data: teachers }, { data: lessonTypes }, { data: invitations }] = await Promise.all([
    supabase
      .from("teachers")
      .select("id, full_name, email, phone, status, profile_id, teacher_skills(lesson_types(id, name, color))")
      .order("full_name"),
    supabase.from("lesson_types").select("id, name, color").order("name"),
    supabase.rpc("list_open_invitations"),
  ]);

  const rows = (teachers ?? []).map((t) => ({
    ...t,
    skills: t.teacher_skills.flatMap((s) => (s.lesson_types ? [s.lesson_types] : [])),
    account: accountState(Boolean(t.profile_id), invitations?.find((i) => i.teacher_id === t.id)),
  }));

  const needle = q.toLowerCase();
  const filtered = rows.filter(
    (t) =>
      (!needle || t.full_name.toLowerCase().includes(needle)) &&
      (!subject || t.skills.some((s) => s.id === subject)) &&
      (!status ||
        (status === "unregistered" ? t.account.kind !== "registered" : t.status === status)),
  );
  const hasFilters = Boolean(q || subject || status);

  return (
    <div className={stack.page}>
      <PageHeader title="מורים" actions={<TeacherDialog lessonTypes={lessonTypes ?? []} />} />

      <form className={toolbar.toolbar} role="search" aria-label="חיפוש וסינון מורים">
        <div className={toolbar.search}>
          <label htmlFor="teacher-search" className="visually-hidden">
            חיפוש מורה לפי שם
          </label>
          <input id="teacher-search" name="q" type="search" placeholder="חיפוש מורה..." defaultValue={q} />
          <Search size={18} aria-hidden="true" />
        </div>
        <SelectField
          label="תחום"
          hideLabel
          name="subject"
          defaultValue={subject}
          options={[{ value: "", label: "כל התחומים" }, ...(lessonTypes ?? []).map((lt) => ({ value: lt.id, label: lt.name }))]}
        />
        <SelectField label="סטטוס" hideLabel name="status" defaultValue={status} options={STATUS_FILTERS} />
        <Button type="submit" variant="outline">
          סינון
        </Button>
      </form>

      <p className={toolbar.count} role="status">
        {hasFilters ? `נמצאו ${filtered.length} מתוך ${rows.length} מורים. ` : `${rows.length} מורים. `}
        {hasFilters && <Link href="/admin/teachers">ניקוי סינון</Link>}
      </p>

      <div className={table.wrapper}>
        {filtered.length ? (
          <table className={table.table}>
            <thead>
              <tr>
                <th scope="col">שם</th>
                <th scope="col">תחומי הוראה</th>
                <th scope="col">טלפון</th>
                <th scope="col">סטטוס</th>
                <th scope="col">חשבון</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id}>
                  <td>
                    <div className={table.primaryCell}>
                      <Avatar name={t.full_name} />
                      <Link href={`/admin/teachers/${t.id}`}>{t.full_name}</Link>
                    </div>
                  </td>
                  <td data-label="תחומי הוראה">
                    <div className={table.chips}>
                      {t.skills.map((s) => (
                        <ColorChip key={s.id} color={s.color}>
                          {s.name}
                        </ColorChip>
                      ))}
                    </div>
                  </td>
                  <td data-label="טלפון">
                    <span className={table.ltr}>{t.phone || "—"}</span>
                  </td>
                  <td data-label="סטטוס">
                    <Badge tone={STATUS_LABELS[t.status].tone}>{STATUS_LABELS[t.status].label}</Badge>
                  </td>
                  <td data-label="חשבון">
                    <Badge tone={ACCOUNT_LABELS[t.account.kind].tone}>{ACCOUNT_LABELS[t.account.kind].label}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={table.empty}>
            {rows.length ? "לא נמצאו מורים התואמים לחיפוש." : "עדיין לא נוספו מורים. הוסיפו את המורה הראשון."}
          </p>
        )}
      </div>
    </div>
  );
}
