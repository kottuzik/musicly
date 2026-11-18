import { beforeEach, describe, expect, it, vi } from "vitest";

const abortSignal = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ limit: () => ({ abortSignal }) }) }),
  }),
}));

import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  beforeEach(() => {
    abortSignal.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("answers 200 when the database can be read", async () => {
    abortSignal.mockResolvedValue({ data: [], error: null });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("answers 503 without details when the database returns an error", async () => {
    abortSignal.mockResolvedValue({ data: null, error: { message: "PGRST002 secret detail" } });
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
  });

  it("answers 503 when the call throws (for example a timeout)", async () => {
    abortSignal.mockRejectedValue(new Error("timeout"));
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
  });
});
