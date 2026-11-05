import { z } from "zod";
import { schoolToday } from "@/lib/students/age";
import { isQuarterHour } from "@/lib/time/weekdays";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const time = z.string().refine(isQuarterHour, "יש לבחור שעה ברבע שעה עגול (למשל 16:15)");
const futureDate = (message: string) =>
  z
    .string()
    .regex(DATE, message)
    .refine((v) => v >= schoolToday(), "התאריך כבר עבר");
const reason = z.string().trim().max(500, "הטקסט ארוך מדי (עד 500 תווים)");
const day = z.coerce.number().int().min(0).max(6);

export const operatingHoursSchema = z
  .array(z.object({ day, open: time, close: time }))
  .superRefine((days, ctx) => {
    days.forEach((d, i) => {
      if (d.close <= d.open) {
        ctx.addIssue({ code: "custom", path: [`day${d.day}`], message: "שעת הסגירה צריכה להיות אחרי שעת הפתיחה" });
      }
      if (days.findIndex((x) => x.day === d.day) !== i) {
        ctx.addIssue({ code: "custom", path: [`day${d.day}`], message: "היום הוזן פעמיים" });
      }
    });
  });

export const availabilitySlotSchema = z
  .object({ teacherId: z.uuid(), day, start: time, end: time })
  .refine((v) => v.end > v.start, { path: ["end"], message: "שעת הסיום צריכה להיות אחרי שעת ההתחלה" });

export const availabilityEditSchema = z
  .object({ availabilityId: z.uuid(), start: time, end: time })
  .refine((v) => v.end > v.start, { path: ["end"], message: "שעת הסיום צריכה להיות אחרי שעת ההתחלה" });

export const removalSchema = z.object({
  availabilityId: z.uuid(),
  kind: z.enum(["remove_weekly", "remove_once"], { error: "יש לבחור סוג הסרה" }),
  date: futureDate("יש לבחור תאריך"),
  reason,
});

// Whole days (date range), or hours on a single day.
export const absenceSchema = z
  .object({
    teacherId: z.uuid(),
    mode: z.enum(["days", "hours"], { error: "יש לבחור ימים שלמים או שעות" }),
    startDate: futureDate("יש לבחור תאריך"),
    endDate: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    reason,
  })
  .superRefine((v, ctx) => {
    if (v.mode === "days") {
      if (!DATE.test(v.endDate)) ctx.addIssue({ code: "custom", path: ["endDate"], message: "יש לבחור תאריך סיום" });
      else if (v.endDate < v.startDate) {
        ctx.addIssue({ code: "custom", path: ["endDate"], message: "תאריך הסיום צריך להיות אחרי תאריך ההתחלה" });
      }
    } else {
      if (!isQuarterHour(v.startTime)) ctx.addIssue({ code: "custom", path: ["startTime"], message: "יש לבחור שעת התחלה" });
      if (!isQuarterHour(v.endTime)) ctx.addIssue({ code: "custom", path: ["endTime"], message: "יש לבחור שעת סיום" });
      else if (v.endTime <= v.startTime) {
        ctx.addIssue({ code: "custom", path: ["endTime"], message: "שעת הסיום צריכה להיות אחרי שעת ההתחלה" });
      }
    }
  });

export const requestVersionSchema = z.object({ id: z.uuid(), version: z.coerce.number().int().positive() });

export const decisionSchema = requestVersionSchema.extend({
  decision: z.enum(["approve", "reject"]),
  note: reason,
});

export const closureSchema = z
  .object({
    name: z.string().trim().min(2, "יש להזין שם").max(100, "השם ארוך מדי"),
    startDate: z.string().regex(DATE, "יש לבחור תאריך התחלה"),
    endDate: z.string().regex(DATE, "יש לבחור תאריך סיום"),
  })
  .refine((v) => v.endDate >= v.startDate, { path: ["endDate"], message: "תאריך הסיום צריך להיות אחרי תאריך ההתחלה" });
