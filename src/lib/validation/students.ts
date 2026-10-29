import { z } from "zod";
import { schoolToday } from "@/lib/students/age";
import { LEVELS } from "@/lib/students/labels";
import { emailField, fullName, phoneField } from "./staff";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => v === "" || emailField.safeParse(v).success, "כתובת האימייל אינה תקינה");

export const studentSchema = z.object({
  fullName,
  birthDate: z
    .string()
    .regex(DATE, "יש להזין תאריך לידה")
    .refine((v) => v > "1900-01-01", "תאריך הלידה אינו תקין")
    .refine((v) => v <= schoolToday(), "תאריך הלידה לא יכול להיות בעתיד"),
  phone: phoneField,
  email: optionalEmail,
  parentName: z.string().trim().max(100, "השם ארוך מדי"),
  parentPhone: phoneField,
  parentEmail: optionalEmail,
});

// A return date needs an explicit notify/auto choice: there is no default (PRD §4.3).
export const studentStatusSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("active") }),
  z
    .object({
      status: z.literal("inactive"),
      returnDate: z.string().refine((v) => v === "" || DATE.test(v), "התאריך אינו תקין"),
      returnMode: z.enum(["notify", "auto"]).optional(),
    })
    .superRefine((value, ctx) => {
      if (!value.returnDate) return;
      if (value.returnDate <= schoolToday()) {
        ctx.addIssue({ code: "custom", path: ["returnDate"], message: "תאריך החזרה צריך להיות אחרי היום" });
      }
      if (!value.returnMode) {
        ctx.addIssue({ code: "custom", path: ["returnMode"], message: "יש לבחור מה יקרה בתאריך החזרה" });
      }
    }),
]);

const level = z.enum(LEVELS as [string, ...string[]], { error: "יש לבחור רמה" });
const background = z.string().trim().max(2000, "הרקע המקצועי ארוך מדי (עד 2,000 תווים)");

export const studentSubjectSchema = z.object({
  lessonTypeId: z.uuid("יש לבחור תחום לימוד"),
  teacherId: z.uuid("יש לבחור מורה קבוע"),
  level,
  background,
});

export const professionalInfoSchema = z.object({ level, background });
