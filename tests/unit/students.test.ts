import { describe, expect, it } from "vitest";
import { dbErrorMessage } from "@/lib/errors";
import { ageOn, formatDay, isMinor, schoolToday } from "@/lib/students/age";
import { LEVEL_LABELS, RETURN_MODE_LABELS } from "@/lib/students/labels";
import { professionalInfoSchema, studentSchema, studentStatusSchema, studentSubjectSchema } from "@/lib/validation/students";

function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe("age", () => {
  it("counts full years, including on the birthday itself", () => {
    expect(ageOn("2010-05-20", "2026-05-19")).toBe(15);
    expect(ageOn("2010-05-20", "2026-05-20")).toBe(16);
    expect(ageOn("2010-05-20", "2026-12-31")).toBe(16);
  });

  it("handles 29 February birthdays", () => {
    expect(ageOn("2008-02-29", "2026-02-28")).toBe(17);
    expect(ageOn("2008-02-29", "2026-03-01")).toBe(18);
  });

  it("is a minor until the 18th birthday", () => {
    expect(isMinor("2008-10-30", "2026-10-29")).toBe(true);
    expect(isMinor("2008-10-29", "2026-10-29")).toBe(false);
  });

  it("uses the school's date (Asia/Jerusalem), not UTC", () => {
    // 22:30 UTC on 29 Oct is already 30 Oct in Israel.
    expect(schoolToday(new Date("2026-10-29T22:30:00Z"))).toBe("2026-10-30");
  });

  it("formats dates as day/month/year", () => {
    expect(formatDay("2015-03-07")).toBe("07/03/2015");
  });
});

describe("student validation", () => {
  const valid = {
    fullName: "דני כהן",
    birthDate: "2014-01-01",
    phone: "",
    email: "",
    parentName: "",
    parentPhone: "",
    parentEmail: "",
  };

  it("requires only a name and a birth date", () => {
    expect(studentSchema.safeParse(valid).success).toBe(true);
    expect(studentSchema.safeParse({ ...valid, fullName: "" }).success).toBe(false);
    expect(studentSchema.safeParse({ ...valid, birthDate: "" }).success).toBe(false);
  });

  it("rejects a birth date in the future and bad contact details", () => {
    expect(studentSchema.safeParse({ ...valid, birthDate: addDays(schoolToday(), 1) }).success).toBe(false);
    expect(studentSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
    expect(studentSchema.safeParse({ ...valid, parentPhone: "abc" }).success).toBe(false);
  });

  it("lower-cases optional emails", () => {
    const parsed = studentSchema.parse({ ...valid, email: "Dani@Example.COM", parentEmail: "P@X.CO" });
    expect(parsed.email).toBe("dani@example.com");
    expect(parsed.parentEmail).toBe("p@x.co");
  });
});

describe("status and return date", () => {
  const future = addDays(schoolToday(), 30);

  it("allows inactive without a return date", () => {
    expect(studentStatusSchema.safeParse({ status: "inactive", returnDate: "" }).success).toBe(true);
    expect(studentStatusSchema.safeParse({ status: "active" }).success).toBe(true);
  });

  it("requires an explicit notify/auto choice with a return date (no default)", () => {
    const result = studentStatusSchema.safeParse({ status: "inactive", returnDate: future });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["returnMode"]);
    expect(studentStatusSchema.safeParse({ status: "inactive", returnDate: future, returnMode: "notify" }).success).toBe(true);
    expect(studentStatusSchema.safeParse({ status: "inactive", returnDate: future, returnMode: "auto" }).success).toBe(true);
    expect(studentStatusSchema.safeParse({ status: "inactive", returnDate: future, returnMode: "later" }).success).toBe(false);
  });

  it("rejects a return date that is not in the future", () => {
    expect(studentStatusSchema.safeParse({ status: "inactive", returnDate: schoolToday(), returnMode: "notify" }).success).toBe(false);
  });
});

describe("subjects and professional info", () => {
  const id = "00000000-0000-4000-8000-000000000000";

  it("requires a subject, a teacher and a level", () => {
    expect(studentSubjectSchema.safeParse({ lessonTypeId: id, teacherId: id, level: "beginner", background: "" }).success).toBe(true);
    expect(studentSubjectSchema.safeParse({ lessonTypeId: id, teacherId: "", level: "beginner", background: "" }).success).toBe(false);
    expect(studentSubjectSchema.safeParse({ lessonTypeId: id, teacherId: id, level: "", background: "" }).success).toBe(false);
  });

  it("limits the background to 2,000 characters", () => {
    expect(professionalInfoSchema.safeParse({ level: "advanced", background: "א".repeat(2000) }).success).toBe(true);
    expect(professionalInfoSchema.safeParse({ level: "advanced", background: "א".repeat(2001) }).success).toBe(false);
  });

  it("has Hebrew labels", () => {
    expect(LEVEL_LABELS).toEqual({ beginner: "מתחיל", intermediate: "בינוני", advanced: "מתקדם" });
    expect(RETURN_MODE_LABELS.notify.label).toBe("התראה למנהלים");
    expect(RETURN_MODE_LABELS.auto.label).toBe("הפעלה אוטומטית");
  });

  it("maps the new database errors to Hebrew", () => {
    for (const key of ["skill_in_use", "teacher_not_qualified", "teacher_inactive", "subject_taken", "return_mode_required", "return_date_past", "birth_date_future"]) {
      expect(dbErrorMessage({ message: key })).not.toBe(dbErrorMessage({ message: "unknown" }));
    }
  });
});
