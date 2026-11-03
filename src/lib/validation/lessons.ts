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

const optionalDate = z.union([z.literal(""), z.string().regex(DATE, "תאריך לא תקין")]);
const optionalTime = z.union([z.literal(""), time]);
const reasonText = z.string().trim().max(500, "הטקסט ארוך מדי (עד 500 תווים)");
const versionField = z.coerce.number().int().positive();

export const editLessonSchema = z.object({
  lessonId: z.uuid(),
  version: versionField,
  date: date("יש לבחור תאריך"),
  start: time,
  duration: bookLessonSchema.shape.duration,
  teacherId: z.uuid({ error: "יש לבחור מורה" }),
  location,
  confirmOutsideHours: confirm,
  changeRequestId: z.union([z.literal(""), z.uuid()]).optional(),
});

export const cancelLessonSchema = z.object({
  id: z.uuid(),
  version: versionField,
  reason: reasonText,
  confirmHeld: confirm,
});

export const attendanceSchema = z.object({
  lessonId: z.uuid(),
  status: z.enum(["held", "student_absent", "teacher_absent"], { error: "יש לבחור סטטוס נוכחות" }),
  note: z.string().trim().max(500, "ההערה ארוכה מדי (עד 500 תווים)"),
  // Version of the existing report; empty when the lesson has none yet.
  version: z.union([z.literal(""), z.coerce.number().int().positive()]),
});

export const restoreLessonSchema = z
  .object({
    id: z.uuid(),
    version: versionField,
    date: optionalDate,
    start: optionalTime,
    confirmOutsideHours: confirm,
  })
  .refine((v) => (v.date === "") === (v.start === ""), { path: ["start"], message: "יש לבחור תאריך ושעה יחד" });

export const attentionSchema = z.object({ id: z.uuid(), version: versionField });

export const seriesChangeSchema = z.object({
  seriesId: z.uuid(),
  fromDate: date("יש לבחור תאריך"),
  day: z.coerce.number().int().min(0).max(6),
  start: time,
  duration: bookLessonSchema.shape.duration,
  teacherId: z.uuid({ error: "יש לבחור מורה" }),
  location,
  confirmOutsideHours: confirm,
});

export const stopSeriesSchema = z.object({ seriesId: z.uuid(), fromDate: date("יש לבחור תאריך") });

export const extendSeriesSchema = z.object({
  seriesId: z.uuid(),
  endDate: optionalDate,
  resumeFrom: optionalDate,
});

export const lessonChangeRequestSchema = z
  .object({
    lessonId: z.uuid(),
    kind: z.enum(["cancel", "change"], { error: "יש לבחור סוג בקשה" }),
    date: optionalDate,
    start: optionalTime,
    reason: reasonText,
  })
  .refine((v) => (v.date === "") === (v.start === ""), { path: ["start"], message: "יש לבחור תאריך ושעה יחד" });

export const decideChangeRequestSchema = z
  .object({
    id: z.uuid(),
    version: versionField,
    decision: z.enum(["approve", "reject"]),
    note: reasonText,
    // Turning a request down with another time suggested instead (both or none).
    counterDate: z.union([z.literal(""), z.string().regex(DATE, "יש לבחור תאריך")]).default(""),
    counterStart: z.union([z.literal(""), time]).default(""),
  })
  .superRefine((v, ctx) => {
    if (v.decision !== "reject" && (v.counterDate || v.counterStart)) {
      ctx.addIssue({ code: "custom", path: ["counterDate"], message: "ניתן להציע מועד רק בדחיית בקשה" });
    }
    if (Boolean(v.counterDate) !== Boolean(v.counterStart)) {
      ctx.addIssue({ code: "custom", path: [v.counterDate ? "counterStart" : "counterDate"], message: "יש לבחור תאריך ושעה" });
    }
    if (v.counterDate && v.counterDate < schoolToday()) {
      ctx.addIssue({ code: "custom", path: ["counterDate"], message: "התאריך כבר עבר" });
    }
  });

// What the admin decides for each lesson a teacher's absence or removed availability touches.
export const lessonDecisionsSchema = z.array(
  z.object({
    lessonId: z.uuid(),
    action: z.enum(["cancel", "substitute", "move", "keep"]),
    teacherId: z.uuid().optional(),
    date: optionalDate.optional(),
    start: optionalTime.optional(),
  }),
);

export const durationSeriesSchema = z.array(
  z.object({
    seriesId: z.uuid(),
    alternatives: z.array(z.object({ lessonId: z.uuid(), start: optionalTime.nullable() })),
  }),
);

export type BookLessonInput = z.infer<typeof bookLessonSchema>;
export type SeriesInput = z.infer<typeof seriesSchema>;
