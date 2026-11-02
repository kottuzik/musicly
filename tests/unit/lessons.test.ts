import { describe, expect, it } from "vitest";
import { visibleHours } from "@/lib/lessons/calendar-params";
import {
  addMinutes,
  localToUtc,
  schoolDate,
  schoolTime,
  shiftDate,
  utcBounds,
  viewRange,
} from "@/lib/lessons/time";
import { dbErrorMessage } from "@/lib/errors";
import {
  ATTENTION_REASON_LABELS,
  CANCEL_SOURCE_LABELS,
  EXCEPTION_KIND_LABELS,
} from "@/lib/lessons/labels";
import {
  bookLessonSchema,
  cancelLessonSchema,
  durationSeriesSchema,
  lessonChangeRequestSchema,
  lessonDecisionsSchema,
  restoreLessonSchema,
  seriesChangeSchema,
  seriesSchema,
} from "@/lib/validation/lessons";

describe("school time zone conversions", () => {
  it("converts local wall-clock time to UTC in winter and summer", () => {
    expect(localToUtc("2026-01-15", "16:00").toISOString()).toBe("2026-01-15T14:00:00.000Z");
    expect(localToUtc("2026-07-15", "16:00").toISOString()).toBe("2026-07-15T13:00:00.000Z");
  });

  it("handles the days the clock changes", () => {
    // Israel moved to summer time on Friday 27/03/2026 at 02:00 and back on Sunday 25/10/2026.
    expect(localToUtc("2026-03-27", "10:00").toISOString()).toBe("2026-03-27T07:00:00.000Z");
    expect(localToUtc("2026-03-26", "10:00").toISOString()).toBe("2026-03-26T08:00:00.000Z");
    expect(localToUtc("2026-10-25", "10:00").toISOString()).toBe("2026-10-25T08:00:00.000Z");
    expect(localToUtc("2026-10-24", "10:00").toISOString()).toBe("2026-10-24T07:00:00.000Z");
  });

  it("shows instants as school date and time", () => {
    expect(schoolTime("2026-07-15T13:00:00Z")).toBe("16:00");
    expect(schoolDate("2026-07-15T22:30:00Z")).toBe("2026-07-16");
  });

  it("adds minutes to a time", () => {
    expect(addMinutes("16:15", 45)).toBe("17:00");
    expect(addMinutes("09:50", 130)).toBe("12:00");
  });
});

describe("calendar ranges", () => {
  it("weeks start on Sunday and months cover whole weeks", () => {
    expect(viewRange("week", "2026-11-04")).toEqual({ from: "2026-11-01", to: "2026-11-07" });
    expect(viewRange("day", "2026-11-04")).toEqual({ from: "2026-11-04", to: "2026-11-04" });
    // November 2026 starts on a Sunday; the grid shows six weeks, through Saturday 12 December.
    expect(viewRange("month", "2026-11-18")).toEqual({ from: "2026-11-01", to: "2026-12-12" });
    expect(viewRange("month", "2026-12-05")).toEqual({ from: "2026-11-29", to: "2027-01-09" });
  });

  it("moves by a day, a week or a month", () => {
    expect(shiftDate("day", "2026-11-30", 1)).toBe("2026-12-01");
    expect(shiftDate("week", "2026-11-04", -1)).toBe("2026-10-28");
    expect(shiftDate("month", "2026-01-31", 1)).toBe("2026-02-01");
  });

  it("queries from local midnight to the next local midnight", () => {
    expect(utcBounds("2026-07-15", "2026-07-15")).toEqual({
      from: "2026-07-14T21:00:00.000Z",
      to: "2026-07-15T21:00:00.000Z",
    });
  });

  it("time grid spans the opening hours, widened for lessons outside them", () => {
    const hours = [{ open_time: "09:00:00", close_time: "19:30:00" }];
    expect(visibleHours(hours, [])).toEqual({ slotMinTime: "09:00", slotMaxTime: "20:00" });
    const late = { start_at: "2026-07-15T18:00:00Z", end_at: "2026-07-15T18:45:00Z" } as never;
    expect(visibleHours(hours, [late])).toEqual({ slotMinTime: "09:00", slotMaxTime: "22:00" });
  });
});

describe("booking validation", () => {
  const base = {
    studentId: "8f1d2c3b-1a2b-4c3d-8e4f-5a6b7c8d9e0f",
    lessonTypeId: "8f1d2c3b-1a2b-4c3d-8e4f-5a6b7c8d9e01",
    teacherId: "8f1d2c3b-1a2b-4c3d-8e4f-5a6b7c8d9e02",
    date: "2099-01-01",
    start: "16:00",
    duration: "45",
    location: "zoom",
    confirmOutsideHours: "false",
  };

  it("accepts a valid lesson and rejects off-grid times, bad durations and past dates", () => {
    expect(bookLessonSchema.safeParse(base).success).toBe(true);
    // The dialog sends the outside-hours confirmation as a boolean.
    expect(bookLessonSchema.safeParse({ ...base, confirmOutsideHours: true }).data?.confirmOutsideHours).toBe(true);
    expect(bookLessonSchema.safeParse({ ...base, start: "16:10" }).success).toBe(false);
    expect(bookLessonSchema.safeParse({ ...base, duration: "300" }).success).toBe(false);
    expect(bookLessonSchema.safeParse({ ...base, date: "2020-01-01" }).success).toBe(false);
    expect(bookLessonSchema.safeParse({ ...base, location: "room" }).success).toBe(false);
  });

  it("series: end after start, at least one meeting, no duplicates", () => {
    const series = {
      studentId: base.studentId,
      lessonTypeId: base.lessonTypeId,
      startDate: "2099-01-01",
      endDate: "",
      meetings: [{ day: "1", start: "16:00" }],
      location: "school",
      confirmOutsideHours: "false",
    };
    expect(seriesSchema.safeParse(series).success).toBe(true);
    expect(seriesSchema.safeParse({ ...series, endDate: "2098-12-01" }).success).toBe(false);
    expect(seriesSchema.safeParse({ ...series, meetings: [] }).success).toBe(false);
    expect(
      seriesSchema.safeParse({ ...series, meetings: [{ day: "1", start: "16:00" }, { day: "1", start: "16:00" }] }).success,
    ).toBe(false);
  });
});

describe("time grid without school hours", () => {
  it("falls back to the 10:00–22:00 default", () => {
    expect(visibleHours([], [])).toEqual({ slotMinTime: "10:00", slotMaxTime: "22:00" });
  });
});

describe("validation of lesson changes", () => {
  const id = "3f1c6b0e-8a52-4d6f-9d1e-2b9f0a7c4e11";
  const future = "2999-01-05";

  it("a restore needs the date and the time together, or neither", () => {
    expect(restoreLessonSchema.safeParse({ id, version: 2, date: "", start: "" }).success).toBe(true);
    expect(restoreLessonSchema.safeParse({ id, version: 2, date: future, start: "16:15" }).success).toBe(true);
    expect(restoreLessonSchema.safeParse({ id, version: 2, date: future, start: "" }).success).toBe(false);
    expect(restoreLessonSchema.safeParse({ id, version: 2, date: "", start: "16:15" }).success).toBe(false);
  });

  it("a teacher's request may suggest a time, but only as date and time together", () => {
    const base = { lessonId: id, kind: "change", reason: "מופע" };
    expect(lessonChangeRequestSchema.safeParse({ ...base, date: "", start: "" }).success).toBe(true);
    expect(lessonChangeRequestSchema.safeParse({ ...base, date: future, start: "17:00" }).success).toBe(true);
    expect(lessonChangeRequestSchema.safeParse({ ...base, date: future, start: "" }).success).toBe(false);
    expect(lessonChangeRequestSchema.safeParse({ ...base, kind: "other", date: "", start: "" }).success).toBe(false);
    expect(lessonChangeRequestSchema.safeParse({ ...base, date: "", start: "", reason: "א".repeat(501) }).success).toBe(false);
  });

  it("a cancellation reason is limited to 500 characters", () => {
    expect(cancelLessonSchema.safeParse({ id, version: 1, reason: "" }).success).toBe(true);
    expect(cancelLessonSchema.safeParse({ id, version: 1, reason: "א".repeat(501) }).success).toBe(false);
  });

  it("a series change needs a quarter-hour start and a valid weekday", () => {
    const base = { seriesId: id, fromDate: future, day: 2, start: "16:15", duration: 45, teacherId: id, location: "school" };
    expect(seriesChangeSchema.safeParse(base).success).toBe(true);
    expect(seriesChangeSchema.safeParse({ ...base, start: "16:10" }).success).toBe(false);
    expect(seriesChangeSchema.safeParse({ ...base, day: 7 }).success).toBe(false);
    expect(seriesChangeSchema.safeParse({ ...base, fromDate: "2000-01-03" }).success).toBe(false);
  });

  it("per-lesson decisions accept only the four actions", () => {
    expect(lessonDecisionsSchema.safeParse([{ lessonId: id, action: "cancel" }]).success).toBe(true);
    expect(lessonDecisionsSchema.safeParse([{ lessonId: id, action: "substitute", teacherId: id }]).success).toBe(true);
    expect(lessonDecisionsSchema.safeParse([{ lessonId: id, action: "move", date: future, start: "10:00" }]).success).toBe(true);
    expect(lessonDecisionsSchema.safeParse([{ lessonId: id, action: "delete" }]).success).toBe(false);
  });

  it("duration choices may leave a meeting without a new start", () => {
    expect(durationSeriesSchema.safeParse([{ seriesId: id, alternatives: [{ lessonId: id, start: null }] }]).success).toBe(true);
    expect(durationSeriesSchema.safeParse([{ seriesId: id, alternatives: [{ lessonId: id, start: "14:00" }] }]).success).toBe(true);
  });
});

describe("Hebrew texts for the new states", () => {
  it("every attention reason, cancellation source and request kind has a label", () => {
    expect(Object.keys(ATTENTION_REASON_LABELS).sort()).toEqual(
      ["availability_removed", "outside_hours", "series_change_conflict", "teacher_absent", "teacher_inactive"],
    );
    expect(Object.keys(CANCEL_SOURCE_LABELS)).toHaveLength(5);
    expect(Object.keys(EXCEPTION_KIND_LABELS)).toEqual(
      expect.arrayContaining(["single", "series", "lesson_change", "series_change", "restore"]),
    );
  });

  it("business errors from the database become Hebrew messages", () => {
    expect(dbErrorMessage({ message: "lesson_changed" })).toContain("השיעור שונה");
    expect(dbErrorMessage({ message: "request_too_late" })).toContain("היום שלפני השיעור");
  });

  it("a failed per-lesson decision adds the reason from the hint", () => {
    const message = dbErrorMessage({ message: "decision_failed", hint: "slot_taken" });
    expect(message).toContain("לא נשמר שום שינוי");
    expect(message).toContain("השעה הזו כבר תפוסה");
  });
});

describe("attendance", () => {
  it("validates a report", async () => {
    const { attendanceSchema } = await import("@/lib/validation/lessons");
    const id = "6f1c1f0e-6a43-4d0c-9e0b-0a3f6a3c9a11";
    expect(attendanceSchema.safeParse({ lessonId: id, status: "held", note: "", version: "" }).success).toBe(true);
    expect(attendanceSchema.safeParse({ lessonId: id, status: "student_absent", note: "x", version: "3" }).success).toBe(true);
    expect(attendanceSchema.safeParse({ lessonId: id, status: "", note: "", version: "" }).success).toBe(false);
    expect(attendanceSchema.safeParse({ lessonId: id, status: "held", note: "א".repeat(501), version: "" }).success).toBe(false);
    expect(attendanceSchema.safeParse({ lessonId: id, status: "held", note: "", version: "0" }).success).toBe(false);
  });

  it("describes log entries with statuses only", async () => {
    const { auditDetail } = await import("@/lib/lessons/labels");
    expect(auditDetail("attendance_reported", null, { status: "held", has_note: true })).toBe("התקיים");
    expect(auditDetail("attendance_changed", { status: "held" }, { status: "student_absent" })).toBe("התקיים ← התלמיד לא הגיע");
    expect(auditDetail("attendance_changed", { status: "held" }, { status: "held" })).toBe("התקיים (ההערה עודכנה)");
    expect(auditDetail("held_lesson_cancelled", { attendance_status: "held" }, { lesson_status: "cancelled" })).toBe("התקיים");
    expect(auditDetail("lesson_cancelled", null, null)).toBeNull();
  });

  it("has a message for the attendance errors", () => {
    expect(dbErrorMessage({ message: "attendance_changed" })).not.toBe(dbErrorMessage({ message: "unknown_key" }));
    expect(dbErrorMessage({ message: "held_confirmation_required" })).toContain("התקיים");
  });

  it("moves between months", async () => {
    const { isMonth, shiftMonth, monthDates } = await import("@/lib/lessons/time");
    expect(isMonth("2026-05")).toBe(true);
    expect(isMonth("2026-13")).toBe(false);
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(monthDates("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
});
