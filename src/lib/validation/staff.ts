import { z } from "zod";
import { LESSON_TYPE_COLOR_VALUES } from "@/lib/lesson-types/colors";

export const fullName = z
  .string()
  .trim()
  .min(2, "יש להזין שם מלא")
  .max(100, "השם ארוך מדי");

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "יש להזין כתובת אימייל")
  .pipe(z.email("כתובת האימייל אינה תקינה"));

export const phoneField = z
  .string()
  .trim()
  .refine((v) => v === "" || /^[0-9+\-\s()]{9,20}$/.test(v), "מספר הטלפון אינו תקין");

export const lessonTypeSchema = z.object({
  name: z.string().trim().min(1, "יש להזין שם תחום").max(60, "השם ארוך מדי"),
  defaultDurationMinutes: z.coerce
    .number({ error: "יש להזין משך בדקות" })
    .int("יש להזין מספר שלם")
    .min(5, "משך מינימלי: 5 דקות")
    .max(240, "משך מקסימלי: 240 דקות")
    .refine((v) => v % 5 === 0, "המשך צריך להיות בקפיצות של 5 דקות"),
  color: z
    .string()
    .refine((v) => LESSON_TYPE_COLOR_VALUES.some((c) => c.toLowerCase() === v.toLowerCase()), "יש לבחור צבע")
    .optional(),
});

export const teacherSchema = z.object({
  fullName,
  email: emailField,
  phone: phoneField,
  lessonTypeIds: z.array(z.uuid()).min(1, "יש לבחור לפחות תחום הוראה אחד"),
});

export const adminInviteSchema = z.object({ fullName, email: emailField });

export const profileSchema = z.object({ fullName, phone: phoneField });
