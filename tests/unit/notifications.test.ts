import { describe, expect, it } from "vitest";
import { buildEmail } from "@/lib/email/templates";
import { emailMode, mayEmail, testRecipients } from "@/lib/email/mode";
import { describeNotification, type NotificationRow } from "@/lib/notifications/labels";
import { buildOffsets, customOffsets, describeOffset, splitCustom } from "@/lib/notifications/reminders";
import { channelSchema, lessonReminderSchema, notificationIdsSchema } from "@/lib/validation/notifications";

const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv;

describe("reminder offsets", () => {
  it("sorts the chosen times, longest first, without duplicates", () => {
    expect(buildOffsets(["60", "1440", "60"], "", "hours").offsets).toEqual([1440, 60]);
  });

  it("adds a custom time in minutes, hours or days", () => {
    expect(buildOffsets([], "45", "minutes").offsets).toEqual([45]);
    expect(buildOffsets(["120"], "3", "hours").offsets).toEqual([180, 120]);
    expect(buildOffsets([], "2", "days").offsets).toEqual([2880]);
  });

  it("merges a custom time equal to a preset", () => {
    expect(buildOffsets(["60"], "1", "hours").offsets).toEqual([60]);
  });

  it("rejects a custom time outside 5 minutes to 7 days or that is not a whole number", () => {
    expect(buildOffsets([], "4", "minutes").error).toBeTruthy();
    expect(buildOffsets([], "8", "days").error).toBeTruthy();
    expect(buildOffsets([], "1.5", "hours").error).toBeTruthy();
    expect(buildOffsets([], "-3", "hours").error).toBeTruthy();
    expect(buildOffsets([], "abc", "hours").error).toBeTruthy();
    expect(buildOffsets([], "5", "weeks").error).toBeTruthy();
    expect(buildOffsets([], "5", "minutes").error).toBeUndefined();
    expect(buildOffsets([], "7", "days").error).toBeUndefined();
  });

  it("allows at most five times and ignores unknown presets", () => {
    expect(buildOffsets(["1440", "720", "120", "60", "999"], "45", "minutes").offsets).toEqual([1440, 720, 120, 60, 45]);
    expect(buildOffsets(["1440", "720", "120", "60", "999"], "", "minutes").offsets).toEqual([1440, 720, 120, 60]);
    expect(buildOffsets(["1440", "720", "120", "60"], "45", "minutes").error).toBeUndefined();
  });

  it("describes and splits offsets in plain Hebrew units", () => {
    expect(describeOffset(1440)).toBe("יום");
    expect(describeOffset(2880)).toBe("יומיים");
    expect(describeOffset(4320)).toBe("3 ימים");
    expect(describeOffset(720)).toBe("12 שעות");
    expect(describeOffset(120)).toBe("שעתיים");
    expect(describeOffset(60)).toBe("שעה");
    expect(describeOffset(45)).toBe("45 דקות");
    expect(splitCustom(180)).toEqual({ amount: "3", unit: "hours" });
    expect(splitCustom(2880)).toEqual({ amount: "2", unit: "days" });
    expect(splitCustom(45)).toEqual({ amount: "45", unit: "minutes" });
    expect(customOffsets([1440, 180, 60])).toEqual([180]);
  });
});

describe("who may receive e-mail", () => {
  it("is test mode unless this is Vercel Production with EMAIL_MODE=live", () => {
    expect(emailMode(env({}))).toBe("test");
    expect(emailMode(env({ EMAIL_MODE: "live" }))).toBe("test");
    expect(emailMode(env({ EMAIL_MODE: "live", VERCEL_ENV: "preview" }))).toBe("test");
    expect(emailMode(env({ EMAIL_MODE: "test", VERCEL_ENV: "production" }))).toBe("test");
    expect(emailMode(env({ EMAIL_MODE: "live", VERCEL_ENV: "production" }))).toBe("live");
  });

  it("in test mode only the listed addresses receive mail, ignoring case and spaces", () => {
    const e = env({ EMAIL_TEST_RECIPIENTS: " Me@Example.com , other@example.com " });
    expect(testRecipients(e)).toEqual(["me@example.com", "other@example.com"]);
    expect(mayEmail("me@example.com", e)).toBe(true);
    expect(mayEmail("ME@example.com ", e)).toBe(true);
    expect(mayEmail("teacher@school.co.il", e)).toBe(false);
    expect(mayEmail("anyone@example.com", env({}))).toBe(false);
  });

  it("in live mode anyone may", () => {
    expect(mayEmail("teacher@school.co.il", env({ EMAIL_MODE: "live", VERCEL_ENV: "production" }))).toBe(true);
  });
});

describe("notification texts", () => {
  const row = (type: string, payload: Record<string, unknown>, subject_name: string | null = null) =>
    ({ type, payload, subject_name, entity_id: null }) as unknown as NotificationRow;

  it("describes a reminder with the lesson details", () => {
    const view = describeNotification(
      row("lesson_reminder", { subject: "פסנתר", start_at: "2026-11-10T14:00:00Z", offset_minutes: 60 }, "דנה"),
      "/teacher",
    );
    expect(view.title).toBe("תזכורת: שיעור בעוד שעה");
    expect(view.detail).toContain("פסנתר");
    expect(view.detail).toContain("דנה");
    expect(view.href).toBe("/teacher/calendar?view=day&date=2026-11-10");
  });

  it("links requests to the role's own area", () => {
    expect(describeNotification(row("change_request_new", { kind: "cancel" }), "/admin").href).toBe("/admin/requests");
    expect(describeNotification(row("approval_request_new", {}), "/teacher").href).toBe("/teacher/requests");
  });

  it("falls back to a generic text for an unknown type", () => {
    expect(describeNotification(row("something_new", {}), "/admin").title).toBe("התראה חדשה");
  });
});

describe("e-mail text", () => {
  it("is right-to-left Hebrew with a link and no student name", () => {
    const mail = buildEmail(
      { kind: "lesson_cancelled", payload: { subject: "גיטרה", start_at: "2026-11-10T14:00:00Z" } },
      "https://app.example/",
    );
    expect(mail.html).toContain('dir="rtl"');
    expect(mail.html).toContain("https://app.example/notifications");
    expect(mail.subject).toBe("שיעור שלך בוטל");
    expect(mail.text).toContain("גיטרה");
  });

  it("escapes markup in the payload", () => {
    const mail = buildEmail({ kind: "lesson_updated", payload: { subject: "<script>x</script>" } }, "https://app.example");
    expect(mail.html).not.toContain("<script>");
  });
});

describe("notification input", () => {
  it("accepts only the two channels", () => {
    expect(channelSchema.safeParse({ channel: "in_app" }).success).toBe(true);
    expect(channelSchema.safeParse({ channel: "in_app_email" }).success).toBe(true);
    expect(channelSchema.safeParse({ channel: "sms" }).success).toBe(false);
  });

  it("limits the ids and the reminder mode", () => {
    expect(notificationIdsSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(notificationIdsSchema.safeParse({ ids: ["not-a-uuid"] }).success).toBe(false);
    expect(notificationIdsSchema.safeParse({ ids: ["8a1f2c64-1d6f-4a6e-9d3a-2f6a1b7c9e10"] }).success).toBe(true);
    const id = "8a1f2c64-1d6f-4a6e-9d3a-2f6a1b7c9e10";
    expect(lessonReminderSchema.safeParse({ lessonId: id, mode: "custom" }).success).toBe(true);
    expect(lessonReminderSchema.safeParse({ lessonId: id, mode: "weekly" }).success).toBe(false);
  });
});
