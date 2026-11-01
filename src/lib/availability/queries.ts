import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { schoolToday } from "@/lib/students/age";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

export const REQUEST_COLUMNS =
  "id, teacher_id, kind, availability_id, day_of_week, start_date, end_date, start_time, end_time, reason, status, version, created_at, decided_at, decision_note";

// Everything the availability screens show for one teacher (RLS limits teachers to their own rows).
export async function loadTeacherAvailability(supabase: Client, teacherId: string) {
  const today = schoolToday();
  const [hours, slots, requests, absences, closures] = await Promise.all([
    supabase.from("operating_hours").select("day_of_week, open_time, close_time").order("day_of_week"),
    supabase
      .from("teacher_availability")
      .select("id, day_of_week, start_time, end_time, valid_from, valid_to")
      .eq("teacher_id", teacherId)
      .or(`valid_to.is.null,valid_to.gte.${today}`)
      .order("day_of_week")
      .order("start_time"),
    supabase
      .from("availability_requests")
      .select(REQUEST_COLUMNS)
      .eq("teacher_id", teacherId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("teacher_absences")
      .select("id, start_date, end_date, start_time, end_time")
      .eq("teacher_id", teacherId)
      .gte("end_date", today)
      .order("start_date"),
    supabase
      .from("school_closures")
      .select("id, name, start_date, end_date")
      .eq("status", "active")
      .gte("end_date", today)
      .order("start_date")
      .limit(10),
  ]);

  return {
    today,
    hours: hours.data ?? [],
    slots: slots.data ?? [],
    requests: requests.data ?? [],
    absences: absences.data ?? [],
    closures: closures.data ?? [],
  };
}

export type TeacherAvailability = Awaited<ReturnType<typeof loadTeacherAvailability>>;
export type AvailabilityRequest = TeacherAvailability["requests"][number];
