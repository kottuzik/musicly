import type { Metadata } from "next";
import { ExceptionRequestsTable } from "@/components/lessons/ExceptionRequestsTable";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";
import { Alert } from "@/components/ui/Alert";
import { PageHeader } from "@/components/ui/PageHeader";
import stack from "@/components/ui/Stack.module.css";
import table from "@/components/ui/Table.module.css";
import { TEACHER_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { loadExceptionRequests } from "@/lib/lessons/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "בקשות שיבוץ" };

// Lessons an admin wants to book outside the teacher's availability, for the teacher to answer.
export default async function TeacherRequestsPage() {
  const profile = await requireRole(TEACHER_ROLES);
  if (profile.status === "inactive") {
    return <Alert tone="warning">החשבון שלך אינו פעיל. ניתן לצפות בהיסטוריית השיעורים בלבד.</Alert>;
  }

  const supabase = await createClient();
  const rows = await loadExceptionRequests(supabase);
  const pending = rows.filter((r) => r.status === "pending");
  const handled = rows.filter((r) => r.status !== "pending");

  return (
    <div className={stack.page}>
      <LiveRefresh tables={["exception_booking_requests"]} />
      <PageHeader
        title="בקשות שיבוץ"
        subtitle="שיעורים שהמנהל מבקש לקבוע מחוץ לזמינות שלך. השיעור נקבע רק אחרי שתאשר/י, ואם המועד עדיין פנוי."
      />
      <section className={stack.page} aria-labelledby="pending-title">
        <h2 id="pending-title" className="text-h3">
          ממתינות לתשובתך ({pending.length})
        </h2>
        <div className={table.wrapper}>
          <ExceptionRequestsTable rows={pending} mode="teacher" empty="אין בקשות שממתינות לתשובתך." />
        </div>
      </section>
      <section className={stack.page} aria-labelledby="handled-title">
        <h2 id="handled-title" className="text-h3">
          היסטוריה
        </h2>
        <div className={table.wrapper}>
          <ExceptionRequestsTable rows={handled} mode="teacher" empty="אין עדיין בקשות שהסתיימו." />
        </div>
      </section>
    </div>
  );
}
