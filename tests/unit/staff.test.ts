import { describe, expect, it } from "vitest";
import { canAccessPath, isGuestOnlyPath, isPublicPath, isSuperAdmin } from "@/lib/auth/roles";
import { dbErrorMessage, GENERIC_ERROR } from "@/lib/errors";
import { invitationMailto } from "@/lib/invitations/mailto";
import { createInvitationToken, hashInvitationToken, registrationLink } from "@/lib/invitations/token";
import { LESSON_TYPE_COLOR_VALUES, colorLabel } from "@/lib/lesson-types/colors";
import { navItemsForRole } from "@/lib/nav/items";
import { accountState } from "@/lib/teachers/account";
import { adminInviteSchema, lessonTypeSchema, profileSchema, teacherSchema } from "@/lib/validation/staff";
import { changePasswordSchema } from "@/lib/validation/auth";

const UUID = "3f1c2a4e-8b7d-4c6e-9a5b-1d2e3f4a5b6c";

describe("teacherSchema", () => {
  it("accepts a teacher with several lesson types and normalizes the email", () => {
    const result = teacherSchema.parse({
      fullName: "  אמיר לוי ",
      email: " Amir@Example.COM ",
      phone: "050-1234567",
      lessonTypeIds: [UUID, "7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d"],
    });
    expect(result.fullName).toBe("אמיר לוי");
    expect(result.email).toBe("amir@example.com");
    expect(result.lessonTypeIds).toHaveLength(2);
  });

  it("requires at least one lesson type and a valid phone", () => {
    const result = teacherSchema.safeParse({ fullName: "אמיר", email: "a@b.co", phone: "abc", lessonTypeIds: [] });
    expect(result.success).toBe(false);
    const paths = result.error!.issues.map((i) => i.path[0]);
    expect(paths).toContain("lessonTypeIds");
    expect(paths).toContain("phone");
  });

  it("allows an empty phone", () => {
    expect(teacherSchema.safeParse({ fullName: "אמיר", email: "a@b.co", phone: "", lessonTypeIds: [UUID] }).success).toBe(true);
  });
});

describe("lessonTypeSchema", () => {
  it("accepts durations in steps of 5 between 5 and 240", () => {
    expect(lessonTypeSchema.safeParse({ name: "פסנתר", defaultDurationMinutes: "45" }).success).toBe(true);
    expect(lessonTypeSchema.safeParse({ name: "פסנתר", defaultDurationMinutes: "47" }).success).toBe(false);
    expect(lessonTypeSchema.safeParse({ name: "פסנתר", defaultDurationMinutes: "0" }).success).toBe(false);
    expect(lessonTypeSchema.safeParse({ name: "פסנתר", defaultDurationMinutes: "300" }).success).toBe(false);
  });

  it("accepts only palette colors", () => {
    expect(lessonTypeSchema.safeParse({ name: "א", defaultDurationMinutes: 30, color: LESSON_TYPE_COLOR_VALUES[0] }).success).toBe(true);
    expect(lessonTypeSchema.safeParse({ name: "א", defaultDurationMinutes: 30, color: "#000000" }).success).toBe(false);
    expect(colorLabel("#6b46c1")).toBe("סגול");
  });
});

describe("other staff schemas", () => {
  it("validates admin invitations and profile edits", () => {
    expect(adminInviteSchema.safeParse({ fullName: "נועה כהן", email: "noya@example.com" }).success).toBe(true);
    expect(adminInviteSchema.safeParse({ fullName: "", email: "nope" }).success).toBe(false);
    expect(profileSchema.safeParse({ fullName: "נועה כהן", phone: "" }).success).toBe(true);
  });

  it("requires matching new passwords", () => {
    const result = changePasswordSchema.safeParse({ currentPassword: "x", password: "longenough1", confirmPassword: "different1" });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0].path[0]).toBe("confirmPassword");
  });
});

describe("invitation tokens and links", () => {
  it("creates random tokens and stores only a hash", () => {
    const a = createInvitationToken();
    const b = createInvitationToken();
    expect(a.token).not.toBe(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(43);
    expect(a.hash).toBe(hashInvitationToken(a.token));
    expect(a.hash).not.toContain(a.token);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("builds the registration link from the site URL", () => {
    expect(registrationLink("abc", "https://school.example/")).toBe("https://school.example/register?token=abc");
  });

  it("builds a prefilled Hebrew email", () => {
    const href = invitationMailto({
      email: "amir@example.com",
      fullName: "אמיר",
      link: "https://x/register?token=abc",
      expiresAt: "2026-11-05T10:00:00Z",
    });
    expect(href.startsWith("mailto:amir%40example.com?subject=")).toBe(true);
    expect(decodeURIComponent(href)).toContain("https://x/register?token=abc");
    expect(decodeURIComponent(href)).toContain("שלום אמיר");
  });
});

describe("accountState", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  it("distinguishes registered, invited, expired and none", () => {
    expect(accountState(true, undefined, now).kind).toBe("registered");
    expect(accountState(false, undefined, now).kind).toBe("none");
    expect(accountState(false, { id: "1", expires_at: "2026-11-01T00:00:00Z" }, now).kind).toBe("invited");
    expect(accountState(false, { id: "1", expires_at: "2026-10-28T00:00:00Z" }, now).kind).toBe("expired");
  });
});

describe("database error messages", () => {
  it("maps known keys to Hebrew and falls back to a generic message", () => {
    expect(dbErrorMessage({ message: "email_taken" })).toBe("כתובת האימייל כבר רשומה במערכת.");
    expect(dbErrorMessage({ message: "Cannot remove or demote the last active super admin" })).toContain("מנהל ראשי");
    expect(dbErrorMessage({ message: "x", code: "23503" }, { "23503": "custom" })).toBe("custom");
    expect(dbErrorMessage({ message: "something internal" })).toBe(GENERIC_ERROR);
  });
});

describe("navigation and access for Milestone 2", () => {
  it("shows management screens to admins only", () => {
    const admin = navItemsForRole("admin").map((i) => i.href);
    expect(admin).toEqual(["/admin", "/admin/teachers", "/admin/users", "/admin/settings", "/profile"]);
    expect(navItemsForRole("teacher").map((i) => i.href)).toEqual(["/teacher", "/profile"]);
  });

  it("keeps /admin/* for admins, opens /profile to everyone, and /register to guests", () => {
    expect(canAccessPath("teacher", "/admin/teachers")).toBe(false);
    expect(canAccessPath("teacher", "/profile")).toBe(true);
    expect(isPublicPath("/register")).toBe(true);
    expect(isGuestOnlyPath("/register")).toBe(true);
    expect(isSuperAdmin("super_admin")).toBe(true);
    expect(isSuperAdmin("admin")).toBe(false);
  });
});
