import { describe, expect, it } from "vitest";
import {
  canAccessPath,
  hasAppAccess,
  homePathForRole,
  isGuestOnlyPath,
  isPublicPath,
  safeNextPath,
} from "@/lib/auth/roles";

describe("homePathForRole", () => {
  it("sends admins to /admin and teachers to /teacher", () => {
    expect(homePathForRole("super_admin")).toBe("/admin");
    expect(homePathForRole("admin")).toBe("/admin");
    expect(homePathForRole("teacher")).toBe("/teacher");
  });
});

describe("canAccessPath", () => {
  it("restricts /admin to admins", () => {
    expect(canAccessPath("super_admin", "/admin")).toBe(true);
    expect(canAccessPath("admin", "/admin/anything")).toBe(true);
    expect(canAccessPath("teacher", "/admin")).toBe(false);
    expect(canAccessPath("teacher", "/admin/x")).toBe(false);
  });

  it("restricts /teacher to teachers", () => {
    expect(canAccessPath("teacher", "/teacher")).toBe(true);
    expect(canAccessPath("admin", "/teacher")).toBe(false);
  });

  it("does not treat look-alike prefixes as the area", () => {
    expect(canAccessPath("teacher", "/administrator")).toBe(true);
  });
});

describe("hasAppAccess", () => {
  it("allows active users and inactive teachers only", () => {
    expect(hasAppAccess({ role: "admin", status: "active" })).toBe(true);
    expect(hasAppAccess({ role: "teacher", status: "inactive" })).toBe(true);
    expect(hasAppAccess({ role: "admin", status: "inactive" })).toBe(false);
    expect(hasAppAccess({ role: "super_admin", status: "inactive" })).toBe(false);
  });
});

describe("public and guest-only paths", () => {
  it("classifies auth routes", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/auth/confirm")).toBe(true);
    expect(isPublicPath("/reset-password")).toBe(true);
    expect(isPublicPath("/admin")).toBe(false);
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/login-other")).toBe(false);
    expect(isGuestOnlyPath("/login")).toBe(true);
    expect(isGuestOnlyPath("/reset-password")).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("accepts same-site relative paths only", () => {
    expect(safeNextPath("/admin")).toBe("/admin");
    expect(safeNextPath("/teacher?x=1")).toBe("/teacher?x=1");
    expect(safeNextPath("https://evil.example")).toBeNull();
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("/\\evil.example")).toBeNull();
    expect(safeNextPath("")).toBeNull();
    expect(safeNextPath(null)).toBeNull();
  });
});
