import { z } from "zod";
import { schoolToday } from "@/lib/students/age";
import { isQuarterHour } from "@/lib/time/weekdays";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const time = z.string().refine(isQuarterHour, "יש לבחור שעה ברבע שעה עגול (למשל 16:15)");
const date = (message: string) =>
  z
    .string()
    .regex(DATE, message)
    .refine((v) => v >= schoolToday(), "התאריך כבר עבר");
const location = z.enum(["school", "zoom"], { error: "יש לבחור מיקום" });
const confirm = z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean());

export const bookLessonSchema = z.object({
  studentId: z.uuid({ error: "יש לבחור תלמיד" }),
  lessonTypeId: z.uuid({ error: "יש לבחור תחום" }),
  teacherId: z.uuid({ error: "יש לבחור מורה" }),
  date: date("יש לבחור תאריך"),
  start: time,
  duration: z.coerce
    .number({ error: "יש להזין משך בדקות" })
    .int("יש להזין מספר שלם של דקות")
    .min(5, "משך השיעור הוא לפחות 5 דקות")
    .max(240, "משך השיעור הוא עד 240 דקות"),
  location,
  confirmOutsideHours: confirm,
});

export const meetingSchema = z.object({ day: z.coerce.number().int().min(0).max(6), start: time });

export const seriesSchema = z
  .object({
    studentId: z.uuid({ error: "יש לבחור תלמיד" }),
    lessonTypeId: z.uuid({ error: "יש לבחור תחום" }),
    startDate: date("יש לבחור תאריך התחלה"),
    endDate: z.union([z.literal(""), z.string().regex(DATE, "תאריך לא תקין")]),
    meetings: z.array(meetingSchema).min(1, "יש להוסיף לפחות מפגש שבועי אחד").max(7, "אפשר עד 7 מפגשים בשבוע"),
    location,
    confirmOutsideHours: confirm,
  })
  .superRefine((v, ctx) => {
    if (v.endDate && v.endDate < v.startDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "תאריך הסיום צריך להיות אחרי תאריך ההתחלה" });
    }
    v.meetings.forEach((m, i) => {
      if (v.meetings.findIndex((x) => x.day === m.day && x.start === m.start) !== i) {
        ctx.addIssue({ code: "custom", path: ["meetings"], message: "אותו מפגש שבועי הוזן פעמיים" });
      }
    });
  });

export const exceptionDecisionSchema = z.object({
  id: z.uuid(),
  version: z.coerce.number().int().positive(),
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(500, "הטקסט ארוך מדי (עד 500 תווים)"),
});

export type BookLessonInput = z.infer<typeof bookLessonSchema>;
export type SeriesInput = z.infer<typeof seriesSchema>;
