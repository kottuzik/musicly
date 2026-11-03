"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/actions";
import { TEACHER_ROLES } from "@/lib/auth/roles";
import { requireProfile, requireRole } from "@/lib/auth/session";
import { dbErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/validation/auth";
import { channelSchema, lessonReminderSchema, notificationIdsSchema } from "@/lib/validation/notifications";
import { loadLessonReminder, loadReminderSettings } from "./queries";
import { buildOffsets } from "./reminders";

// Notifications are only ever marked read or archived; nothing here deletes one. The database
// functions act on the signed-in user's own rows.

function revalidateNotifications() {
  revalidatePath("/", "layout");
}

export async function markNotificationsRead(ids: string[]): Promise<ActionState> {
  await requireProfile();
  const parsed = notificationIdsSchema.safeParse({ ids });
  if (!parsed.success) return { error: dbErrorMessage(null) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notifications_read", { p_ids: parsed.data.ids });
  if (error) return { error: dbErrorMessage(error) };
  revalidateNotifications();
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<ActionState> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_all_notifications_read");
  if (error) return { error: dbErrorMessage(error) };
  revalidateNotifications();
  return { ok: true };
}

export async function archiveNotifications(ids: string[]): Promise<ActionState> {
  await requireProfile();
  const parsed = notificationIdsSchema.safeParse({ ids });
  if (!parsed.success) return { error: dbErrorMessage(null) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_notifications", { p_ids: parsed.data.ids });
  if (error) return { error: dbErrorMessage(error) };
  revalidateNotifications();
  return { ok: true };
}

export async function unarchiveNotifications(ids: string[]): Promise<ActionState> {
  await requireProfile();
  const parsed = notificationIdsSchema.safeParse({ ids });
  if (!parsed.success) return { error: dbErrorMessage(null) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("unarchive_notifications", { p_ids: parsed.data.ids });
  if (error) return { error: dbErrorMessage(error) };
  revalidateNotifications();
  return { ok: true };
}

export async function saveNotificationChannel(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireProfile();
  const parsed = channelSchema.safeParse({ channel: String(formData.get("channel") ?? "") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_notification_channel", { p_channel: parsed.data.channel });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath("/profile");
  return { ok: true, success: "ההעדפה נשמרה." };
}

function offsetsFrom(formData: FormData) {
  return buildOffsets(
    formData.getAll("preset").map(String),
    String(formData.get("customAmount") ?? ""),
    String(formData.get("customUnit") ?? "minutes"),
  );
}

export async function saveReminderPreferences(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(TEACHER_ROLES);
  const enabled = formData.get("enabled") === "on";
  const { offsets, error: offsetsError } = offsetsFrom(formData);
  if (offsetsError) return { fieldErrors: { customAmount: offsetsError } };
  if (enabled && offsets.length === 0) {
    return { fieldErrors: { preset: "כדי להפעיל תזכורות יש לבחור לפחות מועד אחד." } };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_reminder_preferences", { p_enabled: enabled, p_offsets: offsets });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath("/profile");
  return { ok: true, success: "העדפות התזכורות נשמרו." };
}

// What the lesson's reminder dialog shows: this lesson's own setting (if any) and the general one.
export async function getLessonReminder(lessonId: string) {
  await requireRole(TEACHER_ROLES);
  const supabase = await createClient();
  const [override, general] = await Promise.all([loadLessonReminder(supabase, lessonId), loadReminderSettings(supabase)]);
  return { override, general };
}

export async function saveLessonReminder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(TEACHER_ROLES);
  const parsed = lessonReminderSchema.safeParse({
    lessonId: String(formData.get("lessonId") ?? ""),
    mode: String(formData.get("mode") ?? ""),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  let offsets: number[] = [];
  if (parsed.data.mode === "custom") {
    const built = offsetsFrom(formData);
    if (built.error) return { fieldErrors: { customAmount: built.error } };
    if (built.offsets.length === 0) return { fieldErrors: { preset: "יש לבחור לפחות מועד אחד." } };
    offsets = built.offsets;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_lesson_reminder", {
    p_lesson: parsed.data.lessonId,
    p_mode: parsed.data.mode,
    p_offsets: offsets,
  });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath("/teacher/calendar");
  return { ok: true, success: "התזכורת לשיעור נשמרה." };
}
