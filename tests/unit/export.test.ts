import { describe, expect, it } from "vitest";
import { contentDisposition, csvCell, toCsv } from "@/lib/export/csv";
import { daysBetween, reportParams, scheduleParams, studentsParams } from "@/lib/export/params";

describe("csvCell", () => {
  it("quotes text and doubles inner quotes", () => {
    expect(csvCell('דני "הגיטרה" כהן')).toBe('"דני ""הגיטרה"" כהן"');
    expect(csvCell("א, ב")).toBe('"א, ב"');
    expect(csvCell("שורה\nשנייה")).toBe('"שורה\nשנייה"');
  });

  it("leaves empty values empty and numbers bare", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell("")).toBe("");
    expect(csvCell(0)).toBe("0");
    expect(csvCell(12)).toBe("12");
  });

  it.each(["=SUM(A1)", "+1+1", "-2+3", "@cmd", "\tx", "\rx"])("defuses a formula start: %j", (value) => {
    expect(csvCell(value)).toBe(`"'${value}"`);
  });

  it("keeps a leading zero in phone numbers by writing them as text", () => {
    expect(csvCell("050-1234567", true)).toBe('"=""050-1234567"""');
    expect(csvCell("+972 50 123 4567", true)).toBe('"=""+972 50 123 4567"""');
  });

  it("does not trust a phone column that holds something else", () => {
    expect(csvCell('=HYPERLINK("http://x")', true)).toBe(`"'=HYPERLINK(""http://x"")"`);
  });
});

describe("toCsv", () => {
  it("writes a BOM, a header row and CRLF line ends", () => {
    const csv = toCsv(
      [
        { header: "שם", value: (r: { n: string; a: number }) => r.n },
        { header: "גיל", value: (r) => r.a },
      ],
      [{ n: "דנה", a: 9 }],
    );
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe('﻿"שם","גיל"\r\n"דנה",9\r\n');
  });

  it("writes only the header for no rows", () => {
    expect(toCsv([{ header: "שם", value: () => "" }], [])).toBe('﻿"שם"\r\n');
  });
});

describe("contentDisposition", () => {
  it("carries a percent-encoded Hebrew name and an ASCII fallback", () => {
    const header = contentDisposition("תלמידים-2026-11-03.csv");
    expect(header).toContain(`filename*=UTF-8''${encodeURIComponent("תלמידים-2026-11-03.csv")}`);
    expect(header).toMatch(/^attachment; filename="[\x20-\x7e]+";/);
  });
});

describe("export parameters", () => {
  it("accepts empty optional filters", () => {
    expect(studentsParams.safeParse({ q: "", status: "", subject: "" }).success).toBe(true);
  });

  it("rejects unknown statuses, bad ids and bad dates", () => {
    expect(studentsParams.safeParse({ status: "deleted" }).success).toBe(false);
    expect(studentsParams.safeParse({ teacher: "not-a-uuid" }).success).toBe(false);
    expect(scheduleParams.safeParse({ from: "2026-13-01x", to: "2026-01-02" }).success).toBe(false);
    expect(reportParams.safeParse({ from: "2026-01-01" }).success).toBe(false);
    expect(reportParams.safeParse({ from: "2026-01-01", to: "2026-01-31" }).success).toBe(true);
  });

  it("counts days between dates", () => {
    expect(daysBetween("2026-01-01", "2026-01-31")).toBe(30);
    expect(daysBetween("2026-03-27", "2026-03-30")).toBe(3);
  });
});
