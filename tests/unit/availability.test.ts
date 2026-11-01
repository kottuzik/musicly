import { describe, expect, it } from "vitest";
import { describeRequest, slotStates } from "@/lib/availability/slots";
import { REQUEST_KIND_LABELS, REQUEST_STATUS_LABELS } from "@/lib/availability/labels";
import { dbErrorMessage } from "@/lib/errors";
import { findHoliday, israeliHolidays } from "@/lib/holidays/israeli";
import { schoolToday } from "@/lib/students/age";
import { TIME_OPTIONS, addDays, dayOfWeek, isQuarterHour } from "@/lib/time/weekdays";
import {
  absenceSchema,
  availabilitySlotSchema,
  closureSchema,
  decisionSchema,
  operatingHoursSchema,
  removalSchema,
} from "@/lib/validation/availability";

const UUID = "3f1c2a4e-8b7d-4c6e-9a5b-1d2e3f4a5b6c";

const holiday = (slug: string, from: string, to: string) =>
  israeliHolidays(from, to).find((h) => h.key.startsWith(`${slug}-`));

describe("israeliHolidays", () => {
  it("finds the High Holidays of 5787", () => {
    expect(holiday("rosh-hashana", "2026-09-01", "2026-09-30")).toMatchObject({
      key: "rosh-hashana-5787",
      startDate: "2026-09-12",
      endDate: "2026-09-13",
      isRestDay: true,
    });
    expect(holiday("yom-kippur", "2026-09-01", "2026-09-30")).toMatchObject({ startDate: "2026-09-21", isRestDay: true });
    expect(holiday("erev-yom-kippur", "2026-09-01", "2026-09-30")).toMatchObject({ startDate: "2026-09-20", isRestDay: false });
  });

  it("finds Pesach and Independence Day without a shift", () => {
    expect(holiday("pesach", "2027-04-01", "2027-04-30")?.startDate).toBe("2027-04-22");
    expect(holiday("chol-hamoed-pesach", "2027-04-01", "2027-04-30")).toMatchObject({ startDate: "2027-04-23", endDate: "2027-04-27" });
    expect(holiday("yom-haatzmaut", "2027-05-01", "2027-05-31")?.startDate).toBe("2027-05-12");
    expect(holiday("yom-hazikaron", "2027-05-01", "2027-05-31")?.startDate).toBe("2027-05-11");
  });

  it("moves Independence Day off Shabbat and postpones Tisha B'Av from Shabbat", () => {
    expect(holiday("yom-haatzmaut", "2025-04-20", "2025-05-31")?.startDate).toBe("2025-05-01");
    expect(holiday("yom-hazikaron", "2025-04-20", "2025-05-31")?.startDate).toBe("2025-04-30");
    expect(holiday("tisha-bav", "2025-07-01", "2025-08-31")?.startDate).toBe("2025-08-03");
  });

  it("puts Purim in Adar II in a leap year and Hanukkah over eight days", () => {
    expect(holiday("purim", "2027-03-01", "2027-03-31")?.startDate).toBe("2027-03-23");
    expect(holiday("purim", "2026-03-01", "2026-03-31")?.startDate).toBe("2026-03-03");
    expect(holiday("hanukkah", "2026-11-01", "2026-12-31")).toMatchObject({ startDate: "2026-12-05", endDate: "2026-12-12" });
  });

  it("returns a year of suggestions in order, with only official rest days flagged", () => {
    const list = israeliHolidays("2026-11-01", "2027-10-31");
    const dates = list.map((h) => h.startDate);
    expect(dates).toEqual([...dates].sort());
    const rest = list.filter((h) => h.isRestDay).map((h) => h.key.replace(/-\d+$/, ""));
    expect(new Set(rest)).toEqual(
      new Set(["pesach", "shvii-shel-pesach", "yom-haatzmaut", "shavuot", "rosh-hashana", "yom-kippur", "sukkot", "simchat-torah"]),
    );
    expect(list.some((h) => h.key.startsWith("lag-baomer-"))).toBe(true);
    expect(findHoliday("yom-kippur-5788", "2026-11-01", "2027-10-31")?.startDate).toBe("2027-10-11");
  });
});

describe("weekdays and times", () => {
  it("uses Sunday = 0 and quarter-hour times", () => {
    expect(dayOfWeek("2026-11-01")).toBe(0);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(isQuarterHour("16:45")).toBe(true);
    expect(isQuarterHour("16:50")).toBe(false);
    expect(isQuarterHour("24:00")).toBe(false);
    expect(TIME_OPTIONS[0]).toBe("06:00");
    expect(TIME_OPTIONS.at(-1)).toBe("23:45");
  });
});

describe("slots", () => {
  const hours = [{ day_of_week: 0, open_time: "10:00:00", close_time: "18:00:00" }];
  const slot = { id: UUID, day_of_week: 0, start_time: "10:00:00", end_time: "12:00:00", valid_from: "2026-11-01", valid_to: null };

  it("labels slot states", () => {
    expect(slotStates(slot, hours, false)).toEqual(["active"]);
    expect(slotStates(slot, hours, true)).toEqual(["pending_removal"]);
    expect(slotStates({ ...slot, valid_to: "2026-12-01" }, hours, false)).toEqual(["ending"]);
    expect(slotStates({ ...slot, end_time: "19:00:00" }, hours, false)).toEqual(["outside_hours"]);
    expect(slotStates(slot, [], false)).toEqual(["outside_hours"]);
  });

  it("describes requests in Hebrew", () => {
    const base = { day_of_week: 0, start_time: "10:00:00", end_time: "12:00:00", end_date: null };
    expect(describeRequest({ ...base, kind: "remove_weekly", start_date: "2026-11-08" })).toBe("יום ראשון 10:00–12:00 — החל מ־08/11/2026");
    expect(describeRequest({ ...base, kind: "remove_once", start_date: "2026-11-08" })).toBe("יום ראשון 10:00–12:00 — בתאריך 08/11/2026 בלבד");
    expect(
      describeRequest({ kind: "absence", day_of_week: null, start_date: "2026-11-08", end_date: "2026-11-10", start_time: null, end_time: null }),
    ).toBe("08/11/2026 – 10/11/2026 (ימים שלמים)");
  });

  it("has Hebrew labels and error messages", () => {
    expect(REQUEST_KIND_LABELS.absence).toBe("היעדרות");
    expect(REQUEST_STATUS_LABELS.pending.label).toBe("ממתינה");
    expect(dbErrorMessage({ message: "request_already_handled" })).toBe("הבקשה כבר טופלה בידי מנהל אחר. הרשימה עודכנה.");
    expect(dbErrorMessage({ message: "outside_operating_hours" })).toContain("שעות הפעילות");
  });
});

describe("availability schemas", () => {
  const today = schoolToday();

  it("validates operating hours", () => {
    expect(operatingHoursSchema.safeParse([{ day: 0, open: "08:00", close: "20:00" }]).success).toBe(true);
    expect(operatingHoursSchema.safeParse([{ day: 0, open: "20:00", close: "08:00" }]).success).toBe(false);
    expect(operatingHoursSchema.safeParse([{ day: 0, open: "08:10", close: "20:00" }]).success).toBe(false);
  });

  it("validates a slot", () => {
    expect(availabilitySlotSchema.safeParse({ teacherId: UUID, day: "2", start: "16:00", end: "18:00" }).success).toBe(true);
    expect(availabilitySlotSchema.safeParse({ teacherId: UUID, day: "2", start: "18:00", end: "16:00" }).success).toBe(false);
    expect(availabilitySlotSchema.safeParse({ teacherId: UUID, day: "7", start: "16:00", end: "18:00" }).success).toBe(false);
  });

  it("rejects removals and absences in the past", () => {
    expect(removalSchema.safeParse({ availabilityId: UUID, kind: "remove_weekly", date: today, reason: "" }).success).toBe(true);
    expect(removalSchema.safeParse({ availabilityId: UUID, kind: "remove_weekly", date: "2020-01-01", reason: "" }).success).toBe(false);
  });

  it("allows hours only for a single-day absence", () => {
    const base = { teacherId: UUID, startDate: today, endDate: "", startTime: "", endTime: "", reason: "" };
    expect(absenceSchema.safeParse({ ...base, mode: "days", endDate: addDays(today, 2) }).success).toBe(true);
    expect(absenceSchema.safeParse({ ...base, mode: "days", endDate: addDays(today, -1) }).success).toBe(false);
    expect(absenceSchema.safeParse({ ...base, mode: "hours", startTime: "10:00", endTime: "12:00" }).success).toBe(true);
    expect(absenceSchema.safeParse({ ...base, mode: "hours", startTime: "12:00", endTime: "10:00" }).success).toBe(false);
    expect(absenceSchema.safeParse({ ...base, mode: undefined }).success).toBe(false);
  });

  it("validates decisions and closures", () => {
    expect(decisionSchema.safeParse({ id: UUID, version: "3", decision: "approve", note: "" }).success).toBe(true);
    expect(decisionSchema.safeParse({ id: UUID, version: "0", decision: "approve", note: "" }).success).toBe(false);
    expect(closureSchema.safeParse({ name: "חופשה", startDate: "2027-08-01", endDate: "2027-08-10" }).success).toBe(true);
    expect(closureSchema.safeParse({ name: "חופשה", startDate: "2027-08-10", endDate: "2027-08-01" }).success).toBe(false);
  });
});
