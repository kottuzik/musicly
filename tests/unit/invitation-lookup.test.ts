import { beforeEach, describe, expect, it, vi } from "vitest";

const result = vi.hoisted(() => ({ value: { data: null, error: null } as { data: unknown; error: unknown } }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    const query = { select: () => query, eq: () => query, is: () => query, gt: () => query, maybeSingle: async () => result.value };
    return { from: () => query };
  },
}));

import { findValidInvitation } from "@/app/(auth)/register/invitation";

describe("findValidInvitation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("treats an unknown or expired link as not valid", async () => {
    result.value = { data: null, error: null };
    expect(await findValidInvitation("some-token")).toBeNull();
  });

  it("returns a valid invitation", async () => {
    result.value = { data: { email: "a@example.test", full_name: "א", role: "teacher", expires_at: "x" }, error: null };
    expect(await findValidInvitation("some-token")).toEqual({ email: "a@example.test", fullName: "א", role: "teacher" });
  });

  it("reports a technical failure instead of calling the link invalid, without logging the token", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    result.value = { data: null, error: { code: "401", message: "Invalid API key" } };
    await expect(findValidInvitation("secret-token-value")).rejects.toThrow("Invitation lookup failed");
    expect(log).toHaveBeenCalledWith("Registration: invitation lookup failed", "401", "Invalid API key");
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret-token-value");
  });
});
