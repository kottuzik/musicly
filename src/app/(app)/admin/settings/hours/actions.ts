"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/actions";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { dbErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { WEEKDAYS } from "@/lib/time/weekdays";
import { fieldErrors } from "@/lib/validation/auth";
import { operatingHoursSchema } from "@/lib/validation/availability";

// Saves the whole week at once; unchecked days are closed.
export async function saveOperatingHours(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(ADMIN_ROLES);
  const days = WEEKDAYS.filter((d) => formData.get(`open${d}`) === "on").map((d) => ({
    day: d,
    open: String(formData.get(`start${d}`) ?? ""),
    close: String(formData.get(`end${d}`) ?? ""),
  }));
  const parsed = operatingHoursSchema.safeParse(days);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data: outside, error } = await supabase.rpc("set_operating_hours", { p_days: parsed.data });
  if (error) return { error: dbErrorMessage(error) };

  // Upcoming lessons that no longer fit the hours are flagged "needs attention", never moved.
  const { count: flagged } = await supabase
    .from("lessons")
    .select("id", { count: "exact", head: true })
    .eq("attention_reason", "outside_hours")
    .gt("start_at", new Date().toISOString());

  revalidatePath("/admin/settings/hours");
  revalidatePath("/admin/calendar");
  revalidatePath("/teacher/availability");
  revalidatePath("/admin/teachers/[id]", "page");
  return {
    ok: true,
    success: "שעות הפעילות נשמרו.",
    // Existing availability is never changed automatically (PRD §4.2).
    error:
      [
        outside
          ? `${outside === 1 ? "טווח זמינות אחד של מורה נמצא" : `${outside} טווחי זמינות של מורים נמצאים`} מחוץ לשעות הפעילות החדשות. הזמינות לא שונתה, והיא מסומנת במסכי הזמינות.`
          : "",
        flagged
          ? `${flagged === 1 ? "שיעור עתידי אחד נמצא" : `${flagged} שיעורים עתידיים נמצאים`} מחוץ לשעות החדשות, ו${flagged === 1 ? "סומן" : "סומנו"} ”דורש טיפול”. בלוח השנה אפשר לסנן ”רק שיעורים שדורשים טיפול”.`
          : "",
      ]
        .filter(Boolean)
        .join(" ") || undefined,
  };
}
