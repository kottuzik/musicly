import type { Metadata } from "next";
import Link from "next/link";
import { NotificationList } from "@/components/notifications/NotificationList";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import stack from "@/components/ui/Stack.module.css";
import toolbar from "@/components/ui/Toolbar.module.css";
import { isAdminRole } from "@/lib/auth/roles";
import { requireProfile } from "@/lib/auth/session";
import { isNotificationTab, NOTIFICATION_TABS } from "@/lib/notifications/labels";
import { loadBookingOptions, loadLessonChangeRequests } from "@/lib/lessons/queries";
import { loadNotifications, loadPendingRequests, PAGE_SIZE } from "@/lib/notifications/queries";
import { createClient } from "@/lib/supabase/server";
import styles from "@/components/notifications/Notifications.module.css";

export const metadata: Metadata = { title: "התראות" };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

const EMPTY = {
  activity: "אין התראות פעילות.",
  system: "אין הודעות מערכת.",
  archive: "הארכיון ריק.",
};

// The notification center, shared by admins and teachers. A user only ever sees their own
// notifications (RLS and the database function).
export default async function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  const profile = await requireProfile();
  const params = await searchParams;
  const tab = isNotificationTab(one(params.tab)) ? (one(params.tab) as "activity" | "system" | "archive") : "activity";
  const page = Math.max(1, Number.parseInt(one(params.page), 10) || 1);
  const base = isAdminRole(profile.role) ? "/admin" : "/teacher";

  const supabase = await createClient();
  const { rows, total } = await loadNotifications(supabase, tab, page);
  const pending = await loadPendingRequests(supabase, rows);
  // Admins answer teachers' change requests right here, so they need the request and the booking options.
  const hasChangeRequests = isAdminRole(profile.role) && rows.some((r) => r.type === "change_request_new");
  const [changeList, options] = hasChangeRequests
    ? await Promise.all([loadLessonChangeRequests(supabase, true), loadBookingOptions(supabase)])
    : [[], undefined];
  const changeRequests = Object.fromEntries(changeList.map((r) => [r.id, r]));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (p: number) => `/notifications?tab=${tab}&page=${p}`;

  return (
    <div className={stack.page}>
      <LiveRefresh tables={["notifications", "lesson_change_requests", "availability_requests", "exception_booking_requests"]} />
      <PageHeader title="התראות" subtitle="עדכונים, בקשות ותזכורות. אפשר לסמן כנקרא ולהעביר לארכיון." />
      <Tabs
        label="סוגי התראות"
        items={NOTIFICATION_TABS.map((t) => ({ key: t.key, label: t.label, href: `/notifications?tab=${t.key}` }))}
        current={tab}
      />
      <Card>
        {rows.length === 0 ? (
          <p className="text-secondary" role="status">
            {EMPTY[tab]}
          </p>
        ) : (
          <NotificationList rows={rows} tab={tab} base={base} pending={pending} changeRequests={changeRequests} options={options} />
        )}
      </Card>
      {pages > 1 && (
        <nav aria-label="עמודים" className={`${toolbar.toolbar} ${styles.pager}`}>
          {page > 1 && <Link href={link(page - 1)}>העמוד הקודם</Link>}
          <span aria-current="page">
            עמוד {page} מתוך {pages}
          </span>
          {page < pages && <Link href={link(page + 1)}>העמוד הבא</Link>}
        </nav>
      )}
    </div>
  );
}
