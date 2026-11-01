"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/actions";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { dbErrorMessage } from "@/lib/errors";
import { findHoliday } from "@/lib/holidays/israeli";
import { schoolToday } from "@/lib/students/age";
import { createClient } from "@/lib/supabase/server";
import { addDays } from "@/lib/time/weekdays";
import { fieldErrors } from "@/lib/validation/auth";
import { closureSchema } from "@/lib/validation/availability";

function revalidateClosures() {
  revalidatePath("/admin/settings/closures");
  revalidatePath("/teacher/availability");
}

// The holiday's name and dates are computed on the server from its key, never taken from the form.
export async function addHolidayClosure(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(ADMIN_ROLES);
  const today = schoolToday();
  const holiday = findHoliday(String(formData.get("key") ?? ""), today, addDays(today, 366));
  if (!holiday) return { error: dbErrorMessage({ message: "not_found" }) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_closure", {
    p_name: holiday.name,
    p_start_date: holiday.startDate,
    p_end_date: holiday.endDate,
    p_holiday_key: holiday.key,
  });
  if (error) return { error: dbErrorMessage(error) };

  revalidateClosures();
  return { ok: true };
}

export async function addCustomClosure(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(ADMIN_ROLES);
  const parsed = closureSchema.safeParse({
    name: formData.get("name"),
    startDate: String(formData.get("startDate") ?? ""),
    endDate: String(formData.get("endDate") ?? ""),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_closure", {
    p_name: parsed.data.name,
    p_start_date: parsed.data.startDate,
    p_end_date: parsed.data.endDate,
    p_holiday_key: "",
  });
  if (error) return { error: dbErrorMessage(error) };

  revalidateClosures();
  return { ok: true };
}

export async function cancelClosure(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(ADMIN_ROLES);
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_closure", { p_id: String(formData.get("id") ?? "") });
  if (error) return { error: dbErrorMessage(error) };

  revalidateClosures();
  return { ok: true };
}
