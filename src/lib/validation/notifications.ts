import { z } from "zod";

export const channelSchema = z.object({
  channel: z.enum(["in_app", "in_app_email"], { error: "יש לבחור ערוץ התראות" }),
});

export const notificationIdsSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(100),
});

export const lessonReminderSchema = z.object({
  lessonId: z.uuid(),
  mode: z.enum(["default", "off", "custom"], { error: "יש לבחור אפשרות" }),
});
