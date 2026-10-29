import { describe, expect, it } from "vitest";
import { fieldErrors, forgotPasswordSchema, loginSchema, resetPasswordSchema } from "@/lib/validation/auth";

describe("loginSchema", () => {
  it("accepts a valid email and password and trims the email", () => {
    const result = loginSchema.safeParse({ email: "  a@b.co ", password: "x" });
    expect(result.success && result.data.email).toBe("a@b.co");
  });

  it("returns Hebrew errors for missing fields", () => {
    const result = loginSchema.safeParse({ email: "", password: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = fieldErrors(result.error);
      expect(errors.email).toBe("יש להזין כתובת אימייל");
      expect(errors.password).toBe("יש להזין סיסמה");
    }
  });

  it("rejects an invalid email", () => {
    const result = forgotPasswordSchema.safeParse({ email: "not-an-email" });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error).email).toBe("כתובת האימייל אינה תקינה");
  });
});

describe("resetPasswordSchema", () => {
  it("requires at least 8 characters", () => {
    const result = resetPasswordSchema.safeParse({ password: "short", confirmPassword: "short" });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error).password).toContain("8");
  });

  it("requires matching passwords", () => {
    const result = resetPasswordSchema.safeParse({ password: "longenough1", confirmPassword: "longenough2" });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error).confirmPassword).toBe("הסיסמאות אינן תואמות");
  });

  it("accepts a valid new password", () => {
    expect(resetPasswordSchema.safeParse({ password: "longenough1", confirmPassword: "longenough1" }).success).toBe(true);
  });
});
