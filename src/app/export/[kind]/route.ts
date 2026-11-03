import { ADMIN_ROLES, hasAppAccess } from "@/lib/auth/roles";
import { getCurrentProfile } from "@/lib/auth/session";
import { toCsv, contentDisposition } from "@/lib/export/csv";
import {
  reportDataset,
  scheduleDataset,
  studentsDataset,
  teachersDataset,
  type Dataset,
} from "@/lib/export/datasets";
import {
  EXPORT_KINDS,
  MAX_EXPORT_DAYS,
  MAX_EXPORT_ROWS,
  daysBetween,
  reportParams,
  scheduleParams,
  studentsParams,
  teachersParams,
  type ExportKind,
} from "@/lib/export/params";
import { dbErrorMessage } from "@/lib/errors";
import { loadReport } from "@/lib/reports/queries";
import { schoolToday } from "@/lib/students/age";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const FILE_NAMES: Record<ExportKind, string> = {
  students: "תלמידים",
  teachers: "מורים",
  schedule: "מערכת-שעות",
  "report-teachers": "דוח-לפי-מורה",
  "report-subjects": "דוח-לפי-תחום",
};

function text(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

// CSV downloads. The role comes from the database, never from the request. Everything is read with the
// signed-in user's own client, so row-level security and the admin-only functions limit what can leave.
// A teacher may export only their own schedule; everything else is for admins.
export async function GET(request: Request, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params;
  if (!(EXPORT_KINDS as readonly string[]).includes(kind)) return text("סוג הייצוא אינו מוכר.", 404);
  const exportKind = kind as ExportKind;

  const { userId, profile } = await getCurrentProfile();
  if (!userId) return text("יש להתחבר כדי לייצא.", 401);
  if (!profile || !hasAppAccess(profile) || profile.status !== "active") return text("אין לך הרשאה לייצא.", 403);
  const isAdmin = ADMIN_ROLES.includes(profile.role);
  if (!isAdmin && exportKind !== "schedule") return text("אין לך הרשאה לייצא.", 403);

  const query = Object.fromEntries(new URL(request.url).searchParams);
  const supabase = await createClient();

  let dataset: Dataset<never>;
  let logKind: "students" | "teachers" | null = null;
  try {
    if (exportKind === "students") {
      const p = studentsParams.safeParse(query);
      if (!p.success) return text("חלק מהמסננים אינם תקינים.", 422);
      dataset = (await studentsDataset(supabase, p.data)) as unknown as Dataset<never>;
      logKind = "students";
    } else if (exportKind === "teachers") {
      const p = teachersParams.safeParse(query);
      if (!p.success) return text("חלק מהמסננים אינם תקינים.", 422);
      dataset = (await teachersDataset(supabase, p.data)) as unknown as Dataset<never>;
      logKind = "teachers";
    } else if (exportKind === "schedule") {
      const p = scheduleParams.safeParse(query);
      if (!p.success) return text("יש לבחור טווח תאריכים תקין.", 422);
      if (p.data.to < p.data.from || daysBetween(p.data.from, p.data.to) > MAX_EXPORT_DAYS - 1) {
        return text("טווח התאריכים ארוך מדי. בחרו עד שנה אחת.", 422);
      }
      dataset = (await scheduleDataset(supabase, p.data)) as unknown as Dataset<never>;
    } else {
      const p = reportParams.safeParse(query);
      if (!p.success) return text("יש לבחור טווח תאריכים תקין.", 422);
      const group = exportKind === "report-teachers" ? "teacher" : "lesson_type";
      const { lines, error } = await loadReport(supabase, p.data, p.data.teacher, group);
      if (error) return text(dbErrorMessage(error), 422);
      dataset = reportDataset(lines, group === "teacher" ? "מורה" : "תחום") as unknown as Dataset<never>;
    }
  } catch {
    return text("הייצוא נכשל. נסו שוב.", 500);
  }

  if (dataset.rows.length > MAX_EXPORT_ROWS) {
    return text("יש יותר מדי שורות לייצוא. צמצמו את הסינון או את טווח התאריכים.", 422);
  }

  // Personal data leaves the system only after the export is on record (kind and count, never content).
  if (logKind) {
    const { error } = await supabase.rpc("log_export", { p_kind: logKind, p_rows: dataset.rows.length });
    if (error) return text("הייצוא נכשל. נסו שוב.", 500);
  }

  const body = toCsv(dataset.columns, dataset.rows);
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": contentDisposition(`${FILE_NAMES[exportKind]}-${schoolToday()}.csv`),
      "cache-control": "no-store",
    },
  });
}
