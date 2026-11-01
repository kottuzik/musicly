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
import { bookLessonSchema, seriesSchema } from "@/lib/validation/lessons";

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
  it("falls back to 08:00–20:00", () => {
    expect(visibleHours([], [])).toEqual({ slotMinTime: "08:00", slotMaxTime: "20:00" });
  });
});
