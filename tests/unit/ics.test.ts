import { describe, expect, it } from "vitest";
import { escapeText, foldLine, icsUtc, lessonToIcs } from "@/lib/export/ics";

const lesson = {
  id: "11111111-2222-3333-4444-555555555555",
  version: 3,
  // 16:00 Israel time in winter (UTC+2) and 16:00 in summer (UTC+3).
  start_at: "2026-12-01T14:00:00.000Z",
  end_at: "2026-12-01T14:45:00.000Z",
  student_name: "דנה כהן",
  teacher_name: "יוסי לוי",
  lesson_type_name: "פסנתר",
  location: "school" as const,
};

describe("ics", () => {
  it("writes UTC times", () => {
    expect(icsUtc("2026-12-01T14:00:00.000Z")).toBe("20261201T140000Z");
    const text = lessonToIcs(lesson, new Date("2026-11-01T08:00:00Z"));
    expect(text).toContain("DTSTART:20261201T140000Z\r\n");
    expect(text).toContain("DTEND:20261201T144500Z\r\n");
    expect(text).toContain("DTSTAMP:20261101T080000Z\r\n");
  });

  it("keeps a summer time correct", () => {
    const summer = lessonToIcs({ ...lesson, start_at: "2027-07-06T13:00:00.000Z", end_at: "2027-07-06T13:45:00.000Z" });
    expect(summer).toContain("DTSTART:20270706T130000Z");
  });

  it("has a stable UID and a sequence equal to the lesson version", () => {
    const text = lessonToIcs(lesson);
    expect(text).toContain("UID:lesson-11111111-2222-3333-4444-555555555555@musicly");
    expect(text).toContain("SEQUENCE:3");
    expect(lessonToIcs({ ...lesson, version: 4 })).toContain("SEQUENCE:4");
  });

  it("uses CRLF everywhere and ends with one", () => {
    const text = lessonToIcs(lesson);
    expect(text.endsWith("\r\n")).toBe(true);
    expect(text.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("escapes special characters", () => {
    expect(escapeText("a,b;c\\d")).toBe("a\\,b\\;c\\\\d");
  });

  it("cannot add fields through a name with line breaks", () => {
    const text = lessonToIcs({ ...lesson, student_name: "דנה\r\nATTENDEE:mailto:x@y.z" });
    expect(text).not.toMatch(/^ATTENDEE/m);
    expect(text).toContain("SUMMARY:פסנתר — דנה ATTENDEE:mailto:x@y.z");
  });

  it("folds long Hebrew lines without splitting a character", () => {
    const long = `SUMMARY:${"שלום ".repeat(40)}`;
    const folded = foldLine(long);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    for (const part of parts.slice(1)) expect(part.startsWith(" ")).toBe(true);
    // Unfolding gives the original text back.
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(long);
  });

  it("holds no contact or professional details", () => {
    const text = lessonToIcs(lesson);
    expect(text).not.toMatch(/@(?!musicly)/);
    expect(text).not.toMatch(/TEL|ATTENDEE|ORGANIZER/);
  });

  it("shows the location label", () => {
    expect(lessonToIcs({ ...lesson, location: "zoom" })).toContain("LOCATION:בזום");
  });
});
