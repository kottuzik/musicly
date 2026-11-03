import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { NotificationTab } from "./labels";

type Client = SupabaseClient<Database>;

export const PAGE_SIZE = 30;

export async function loadNotifications(supabase: Client, tab: NotificationTab, page: number) {
  const { data } = await supabase.rpc("list_notifications", { p_tab: tab, p_offset: (page - 1) * PAGE_SIZE });
  const rows = data ?? [];
  return { rows, total: Number(rows[0]?.total ?? 0) };
}

// Waiting notifications of the signed-in user (not read, not archived). RLS limits it to their own.
export async function unreadNotificationCount(supabase: Client): Promise<number> {
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null)
    .is("archived_at", null);
  return count ?? 0;
}

// Which tabs hold something unread (not read, not archived). RLS limits it to the signed-in user.
export async function unreadTabs(supabase: Client): Promise<{ activity: boolean; system: boolean }> {
  const { data } = await supabase.from("notifications").select("category").is("read_at", null).is("archived_at", null);
  const rows = data ?? [];
  return { activity: rows.some((r) => r.category === "activity"), system: rows.some((r) => r.category === "system") };
}

export type ReminderSettings = { enabled: boolean; offsets: number[] };

export async function loadReminderSettings(supabase: Client): Promise<ReminderSettings> {
  const { data } = await supabase.from("reminder_preferences").select("enabled, offsets_minutes").maybeSingle();
  return { enabled: data?.enabled ?? false, offsets: data?.offsets_minutes ?? [] };
}

export async function loadChannel(supabase: Client, userId: string): Promise<"in_app" | "in_app_email"> {
  const { data } = await supabase.from("notification_preferences").select("channel").eq("user_id", userId).maybeSingle();
  return data?.channel ?? "in_app";
}

// The teacher's override for one lesson: null = follows the general preference.
export async function loadLessonReminder(supabase: Client, lessonId: string) {
  const { data } = await supabase
    .from("lesson_reminder_overrides")
    .select("mode, offsets_minutes")
    .eq("lesson_id", lessonId)
    .maybeSingle();
  return data ? { mode: data.mode, offsets: data.offsets_minutes } : null;
}

// Requests that a notification is about and that still wait for an answer, keyed by request id.
// The notification offers the answer buttons only while the request is pending, with the version the
// reader saw (so a request another admin handled meanwhile is not overwritten).
export type PendingRequest = { version: number; kind: string | null };

export async function loadPendingRequests(
  supabase: Client,
  rows: { entity: string | null; entity_id: string | null }[],
): Promise<Record<string, PendingRequest>> {
  const ids = (entity: string) => [...new Set(rows.filter((r) => r.entity === entity && r.entity_id).map((r) => r.entity_id!))];
  const [change, approval, availability] = await Promise.all([
    ids("change_request").length
      ? supabase.from("lesson_change_requests").select("id, version, kind").eq("status", "pending").in("id", ids("change_request"))
      : null,
    ids("approval_request").length
      ? supabase.from("exception_booking_requests").select("id, version").eq("status", "pending").in("id", ids("approval_request"))
      : null,
    ids("availability_request").length
      ? supabase.from("availability_requests").select("id, version").eq("status", "pending").in("id", ids("availability_request"))
      : null,
  ]);

  const pending: Record<string, PendingRequest> = {};
  for (const r of change?.data ?? []) pending[r.id] = { version: r.version, kind: r.kind };
  for (const r of approval?.data ?? []) pending[r.id] = { version: r.version, kind: null };
  for (const r of availability?.data ?? []) pending[r.id] = { version: r.version, kind: null };
  return pending;
}
