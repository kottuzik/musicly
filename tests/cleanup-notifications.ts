import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/types/database";

// Tests create lessons, requests and students, and the app now notifies real accounts about them.
// After a run this removes what the run left behind in the Development database: notifications
// about things that no longer exist (and system ones with no subject), and their e-mail rows.
const ENTITY_TABLES = {
  lesson: "lessons",
  series: "lesson_series",
  student: "students",
  change_request: "lesson_change_requests",
  approval_request: "exception_booking_requests",
  availability_request: "availability_requests",
} as const;

export async function cleanupNotificationsSince(startedAt: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return;
  const service = createClient<Database>(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: rows } = await service
    .from("notifications")
    .select("id, entity, entity_id")
    .gte("created_at", startedAt)
    .limit(5000);
  const created = rows ?? [];
  const doomed = created.filter((n) => n.entity === null).map((n) => n.id);

  for (const [entity, table] of Object.entries(ENTITY_TABLES)) {
    const ids = [...new Set(created.filter((n) => n.entity === entity && n.entity_id).map((n) => n.entity_id!))];
    if (ids.length === 0) continue;
    const { data: existing } = await service.from(table).select("id").in("id", ids);
    const alive = new Set((existing ?? []).map((r) => r.id));
    for (const n of created) if (n.entity === entity && n.entity_id && !alive.has(n.entity_id)) doomed.push(n.id);
  }

  for (let i = 0; i < doomed.length; i += 200) {
    await service.from("notifications").delete().in("id", doomed.slice(i, i + 200));
  }
  await service.from("email_outbox").delete().gte("created_at", startedAt).is("notification_id", null).like("dedupe_key", "n:%");
}
