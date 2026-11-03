import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { schoolToday } from "@/lib/students/age";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

export type ReportRow = Database["public"]["Functions"]["report_lessons_summary"]["Returns"][number];
export type ReportGroup = "teacher" | "lesson_type" | "total";

// The database returns bigint counts as numbers in JSON; one place to normalise them.
export type ReportCounts = {
  scheduled: number;
  held: number;
  studentAbsent: number;
  teacherAbsent: number;
  unreported: number;
  upcoming: number;
  cancelled: number;
  closedDay: number;
};

export type ReportLine = { id: string | null; name: string } & ReportCounts;

function toLine(r: ReportRow): ReportLine {
  return {
    id: r.group_id,
    name: r.group_name,
    scheduled: Number(r.scheduled_total),
    held: Number(r.held),
    studentAbsent: Number(r.student_absent),
    teacherAbsent: Number(r.teacher_absent),
    unreported: Number(r.unreported),
    upcoming: Number(r.upcoming),
    cancelled: Number(r.cancelled),
    closedDay: Number(r.closed_day),
  };
}

export async function loadReport(
  supabase: Client,
  range: { from: string; to: string },
  teacherId: string | undefined,
  group: ReportGroup,
): Promise<{ lines: ReportLine[]; error: { message: string; code?: string } | null }> {
  const { data, error } = await supabase.rpc("report_lessons_summary", {
    p_from: range.from,
    p_to: range.to,
    p_teacher_id: (teacherId || null) as unknown as string,
    p_group: group,
  });
  if (error) return { lines: [], error: { message: error.message, code: error.code } };
  return { lines: (data ?? []).map(toLine), error: null };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

// The period in the URL, or the current month.
export function readReportRange(params: Record<string, string | string[] | undefined>) {
  const today = schoolToday();
  const from = DATE.test(one(params.from)) ? one(params.from) : `${today.slice(0, 7)}-01`;
  const to = DATE.test(one(params.to)) ? one(params.to) : today;
  return { from, to };
}

// Quick periods for the filter bar.
export function reportShortcuts(today = schoolToday()) {
  const [y, m] = today.split("-").map(Number);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const thisStart = `${today.slice(0, 7)}-01`;
  const lastStart = iso(new Date(Date.UTC(y, m - 2, 1)));
  const lastEnd = iso(new Date(Date.UTC(y, m - 1, 0)));
  const d30 = iso(new Date(Date.parse(`${today}T00:00:00Z`) - 29 * 86_400_000));
  return [
    { label: "החודש", from: thisStart, to: today },
    { label: "חודש שעבר", from: lastStart, to: lastEnd },
    { label: "30 הימים האחרונים", from: d30, to: today },
  ];
}
