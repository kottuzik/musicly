import { hasAppAccess } from "@/lib/auth/roles";
import { getCurrentProfile } from "@/lib/auth/session";
import { contentDisposition } from "@/lib/export/csv";
import { lessonToIcs } from "@/lib/export/ics";
import { loadLesson } from "@/lib/lessons/queries";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

// A calendar file (.ics) for one lesson. The lesson is read with the signed-in user's own client,
// so a teacher gets only their own lessons and an admin any lesson. Unknown and forbidden look the same.
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const { userId, profile } = await getCurrentProfile();
  if (!userId) return text("יש להתחבר כדי להוסיף ללוח השנה.", 401);
  if (!profile || !hasAppAccess(profile) || profile.status !== "active") return text("אין לך הרשאה.", 403);

  if (!UUID.test(id)) return text("השיעור לא נמצא.", 404);

  const supabase = await createClient();
  const lesson = await loadLesson(supabase, id);
  if (!lesson) return text("השיעור לא נמצא.", 404);
  if (lesson.status !== "scheduled") return text("שיעור מבוטל אינו מתווסף ללוח השנה.", 409);

  return new Response(lessonToIcs(lesson), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": contentDisposition(`שיעור-${lesson.occurrence_date}.ics`),
      "cache-control": "no-store",
    },
  });
}
