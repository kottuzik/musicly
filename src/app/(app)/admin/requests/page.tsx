import { Search } from "lucide-react";
import type { Metadata } from "next";
import { RequestsTable } from "@/components/availability/RequestsTable";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { SelectField } from "@/components/ui/SelectField";
import { Tabs } from "@/components/ui/Tabs";
import stack from "@/components/ui/Stack.module.css";
import table from "@/components/ui/Table.module.css";
import toolbar from "@/components/ui/Toolbar.module.css";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { REQUEST_KIND_LABELS, type RequestKind } from "@/lib/availability/labels";
import { REQUEST_COLUMNS } from "@/lib/availability/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "בקשות אישור" };

const KINDS = Object.keys(REQUEST_KIND_LABELS) as RequestKind[];

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

// Shared queue for all admins. Updates live; a decision only applies if the request is still
// pending at the version shown (another admin may have handled it).
export default async function RequestsPage({ searchParams }: PageProps<"/admin/requests">) {
  await requireRole(ADMIN_ROLES);
  const params = await searchParams;
  const tab = one(params.tab) === "handled" ? "handled" : "pending";
  const kind = KINDS.includes(one(params.kind) as RequestKind) ? (one(params.kind) as RequestKind) : "";
  const q = one(params.q).trim();

  const supabase = await createClient();
  let query = supabase.from("availability_requests").select(`${REQUEST_COLUMNS}, teachers!inner(full_name)`);
  query =
    tab === "pending"
      ? query.eq("status", "pending").order("created_at", { ascending: true })
      : query.neq("status", "pending").order("updated_at", { ascending: false }).limit(100);
  if (kind) query = query.eq("kind", kind);
  if (q) query = query.ilike("teachers.full_name", `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);

  const [{ data }, { count: pendingCount }] = await Promise.all([
    query,
    supabase.from("availability_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  const rows = (data ?? []).map(({ teachers, ...r }) => ({ ...r, teacherName: teachers.full_name }));

  const link = (t: string) => `/admin/requests?${new URLSearchParams({ ...(t === "handled" ? { tab: t } : {}), ...(kind ? { kind } : {}), ...(q ? { q } : {}) })}`;

  return (
    <div className={stack.page}>
      <LiveRefresh tables={["availability_requests"]} />
      <PageHeader title="בקשות אישור" subtitle="בקשות מורים להסרת זמינות ולהיעדרות. כל מנהל יכול לטפל בבקשה." />
      <Tabs
        label="סטטוס בקשות"
        current={tab}
        items={[
          { key: "pending", href: link("pending"), label: `ממתינות (${pendingCount ?? 0})` },
          { key: "handled", href: link("handled"), label: "טופלו" },
        ]}
      />
      <form className={toolbar.toolbar} role="search" aria-label="חיפוש וסינון בקשות">
        {tab === "handled" && <input type="hidden" name="tab" value="handled" />}
        <div className={toolbar.search}>
          <label htmlFor="request-search" className="visually-hidden">
            חיפוש לפי שם מורה
          </label>
          <input id="request-search" name="q" type="search" placeholder="חיפוש מורה..." defaultValue={q} />
          <Search size={18} aria-hidden="true" />
        </div>
        <SelectField
          label="סוג בקשה"
          hideLabel
          name="kind"
          defaultValue={kind}
          options={[{ value: "", label: "כל הסוגים" }, ...KINDS.map((k) => ({ value: k, label: REQUEST_KIND_LABELS[k] }))]}
        />
        <Button type="submit" variant="secondary">
          סינון
        </Button>
      </form>
      <div className={table.wrapper}>
        <RequestsTable
          rows={rows}
          mode="admin"
          empty={q || kind ? "לא נמצאו בקשות מתאימות." : tab === "pending" ? "אין בקשות ממתינות." : "אין בקשות שטופלו."}
        />
      </div>
    </div>
  );
}
