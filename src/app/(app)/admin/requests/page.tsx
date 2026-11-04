import { Search } from "lucide-react";
import type { Metadata } from "next";
import { RequestsTable } from "@/components/availability/RequestsTable";
import { ExceptionRequestsTable } from "@/components/lessons/ExceptionRequestsTable";
import { LessonChangeRequestsTable } from "@/components/lessons/LessonChangeRequestsTable";
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
import { loadBookingOptions, loadExceptionRequests, loadLessonChangeRequests } from "@/lib/lessons/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "בקשות אישור" };

const KINDS = Object.keys(REQUEST_KIND_LABELS) as RequestKind[];

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

// Shared queue for all admins. Updates live; a decision only applies if the request is still
// pending at the version shown (another admin may have handled it).
export default async function RequestsPage({ searchParams }: PageProps<"/admin/requests">) {
  await requireRole(ADMIN_ROLES);
  const params = await searchParams;
  if (one(params.section) === "booking") return <BookingRequests handled={one(params.tab) === "handled"} />;
  if (one(params.section) === "changes") return <ChangeRequests handled={one(params.tab) === "handled"} />;
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
      <SectionTabs current="availability" />
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
      <div className={table.wrapper} tabIndex={0}>
        <RequestsTable
          rows={rows}
          mode="admin"
          empty={q || kind ? "לא נמצאו בקשות מתאימות." : tab === "pending" ? "אין בקשות ממתינות." : "אין בקשות שטופלו."}
        />
      </div>
    </div>
  );
}

function SectionTabs({ current }: { current: "availability" | "booking" | "changes" }) {
  return (
    <Tabs
      label="סוג בקשות"
      current={current}
      items={[
        { key: "availability", href: "/admin/requests", label: "זמינות והיעדרויות" },
        { key: "booking", href: "/admin/requests?section=booking", label: "שיבוץ מחוץ לזמינות" },
        { key: "changes", href: "/admin/requests?section=changes", label: "שינוי וביטול שיעורים" },
      ]}
    />
  );
}

// Bookings outside a teacher's availability, waiting for (or answered by) the teacher.
async function BookingRequests({ handled }: { handled: boolean }) {
  const supabase = await createClient();
  const all = await loadExceptionRequests(supabase);
  const pending = all.filter((r) => r.status === "pending");
  const rows = handled ? all.filter((r) => r.status !== "pending") : pending;

  return (
    <div className={stack.page}>
      <LiveRefresh tables={["exception_booking_requests", "lessons"]} />
      <PageHeader
        title="בקשות אישור"
        subtitle="שיבוצים מחוץ לזמינות המורה ממתינים לאישור המורה. בקשה ממתינה אינה שומרת את השעה."
      />
      <SectionTabs current="booking" />
      <Tabs
        label="סטטוס בקשות"
        current={handled ? "handled" : "pending"}
        items={[
          { key: "pending", href: "/admin/requests?section=booking", label: `ממתינות (${pending.length})` },
          { key: "handled", href: "/admin/requests?section=booking&tab=handled", label: "הסתיימו" },
        ]}
      />
      <div className={table.wrapper} tabIndex={0}>
        <ExceptionRequestsTable
          rows={rows}
          mode="admin"
          empty={handled ? "אין בקשות שהסתיימו." : "אין בקשות שיבוץ ממתינות."}
        />
      </div>
    </div>
  );
}

// Teachers' requests to change or cancel one of their lessons, for an admin to answer.
async function ChangeRequests({ handled }: { handled: boolean }) {
  const supabase = await createClient();
  await supabase.rpc("expire_lesson_change_requests");
  const [all, options] = await Promise.all([loadLessonChangeRequests(supabase), loadBookingOptions(supabase)]);
  const pending = all.filter((r) => r.status === "pending");
  const rows = handled ? all.filter((r) => r.status !== "pending") : pending;

  return (
    <div className={stack.page}>
      <LiveRefresh tables={["lesson_change_requests", "lessons"]} />
      <PageHeader
        title="בקשות אישור"
        subtitle="מורים יכולים לבקש שינוי או ביטול של שיעור עד היום שלפני השיעור. ביטול מאשרים כאן; שינוי מאשרים בקביעת המועד החדש."
      />
      <SectionTabs current="changes" />
      <Tabs
        label="סטטוס בקשות"
        current={handled ? "handled" : "pending"}
        items={[
          { key: "pending", href: "/admin/requests?section=changes", label: `ממתינות (${pending.length})` },
          { key: "handled", href: "/admin/requests?section=changes&tab=handled", label: "טופלו" },
        ]}
      />
      <div className={table.wrapper} tabIndex={0}>
        <LessonChangeRequestsTable
          rows={rows}
          mode="admin"
          options={options}
          empty={handled ? "אין בקשות שטופלו." : "אין בקשות ממתינות לשינוי או לביטול שיעור."}
        />
      </div>
    </div>
  );
}
