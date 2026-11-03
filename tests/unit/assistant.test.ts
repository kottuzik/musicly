import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AssistantError, openAiProvider, type Provider, type ProviderMessage, type ProviderResult } from "@/lib/assistant/provider";
import { runAssistant, MAX_TOOL_ROUNDS } from "@/lib/assistant/run";
import { isToolName, runTool, toolDefinitions } from "@/lib/assistant/tools";

// A stand-in for the signed-in admin's database client: answers the few calls the tools make.
const SECRETS = { phone: "0501112233", email: "secret@example.com", parent_phone: "0529998877", birth_date: "2010-05-05", note: "private note" };

function fakeSupabase(overrides: Record<string, unknown> = {}) {
  const rpcs: string[] = [];
  const client = {
    rpc: (name: string) => {
      rpcs.push(name);
      const table: Record<string, unknown> = {
        // A row with extra private columns, as if the database returned more than it should.
        ai_find_people: [{ id: "s1", name: "דנה לוי", status: "active", subjects: "פסנתר", ...SECRETS }],
        ai_find_available_teachers: [{ teacher_id: "t1", teacher_name: "יוסי", free_from: "09:45:00", free_to: "11:00:00", ...SECRETS }],
        ai_suggest_slots: [
          { slot_date: "2026-11-11", start_time: "10:45:00", end_time: "11:30:00", teacher_id: "t1", teacher_name: "יוסי", ...SECRETS },
        ],
        list_calendar_lessons: [
          {
            id: "l1", start_at: "2026-11-11T08:00:00Z", end_at: "2026-11-11T08:45:00Z", status: "scheduled", location: "school",
            student_name: "דנה לוי", teacher_name: "יוסי", lesson_type_name: "פסנתר", attendance_status: "held", ...SECRETS,
          },
        ],
        report_lessons_summary: [
          { group_id: null, group_name: "סה״כ", scheduled_total: 5, held: 3, student_absent: 1, teacher_absent: 0, unreported: 1, upcoming: 0, cancelled: 2, closed_day: 0 },
        ],
        ...overrides,
      };
      return Promise.resolve({ data: table[name] ?? [], error: null });
    },
    from: () => ({ select: () => Promise.resolve({ data: [{ id: "lt1", name: "פסנתר" }], error: null }) }),
  };
  return { client: client as never, rpcs };
}

describe("assistant tools", () => {
  it("offers exactly the five read tools, none that could write", () => {
    const names = toolDefinitions().map((t) => t.function.name);
    expect(names.sort()).toEqual(["find_available_teachers", "find_lessons", "find_people", "school_summary", "suggest_alternative_slots"]);
    expect(names.some((n) => /create|update|delete|cancel|book|set_|restore|write|insert/.test(n))).toBe(false);
    for (const tool of toolDefinitions()) {
      expect(tool.function.parameters).not.toHaveProperty("$schema");
      expect(tool.function.parameters.type).toBe("object");
    }
  });

  it("knows its own tool names only", () => {
    expect(isToolName("find_people")).toBe(true);
    expect(isToolName("delete_lesson")).toBe(false);
    expect(isToolName("constructor")).toBe(false);
  });

  it("never passes contact details, birth dates or notes on to the model", async () => {
    const { client } = fakeSupabase();
    const outputs = await Promise.all([
      runTool(client, "find_people", { kind: "student", query: "דנה" }),
      runTool(client, "find_available_teachers", { lesson_type: "פסנתר", date: "2026-11-11", from_time: "09:00", to_time: "11:00" }),
      runTool(client, "find_lessons", { from: "2026-11-11", to: "2026-11-12" }),
      runTool(client, "suggest_alternative_slots", { student_name: "דנה לוי", lesson_type: "פסנתר", from: "2026-11-11", to: "2026-11-12" }),
      runTool(client, "school_summary", { from: "2026-11-01", to: "2026-11-30" }),
    ]);
    const text = JSON.stringify(outputs);
    for (const secret of Object.values(SECRETS)) expect(text).not.toContain(secret);
    expect(text).toContain("דנה לוי");
  });

  it("returns suggested times built from the tool data", async () => {
    const { client } = fakeSupabase();
    const out = await runTool(client, "suggest_alternative_slots", { student_name: "דנה לוי", lesson_type: "פסנתר", from: "2026-11-11", to: "2026-11-12" });
    expect(out.slots).toEqual([
      { date: "2026-11-11", weekday: "רביעי", start: "10:45", end: "11:30", teacher: "יוסי", student: "דנה לוי", subject: "פסנתר" },
    ]);
  });

  it("answers bad input with an error message instead of throwing or calling the database", async () => {
    const { client, rpcs } = fakeSupabase();
    const bad = await runTool(client, "find_lessons", { from: "tomorrow", to: "2026-11-12" });
    expect(JSON.stringify(bad.result)).toContain("Invalid arguments");
    const longRange = await runTool(client, "find_lessons", { from: "2026-01-01", to: "2026-06-01" });
    expect(JSON.stringify(longRange.result)).toContain("Range");
    expect(rpcs).toEqual([]);
  });

  it("asks for clarification when a name is ambiguous", async () => {
    const { client } = fakeSupabase({
      ai_find_people: [
        { id: "a", name: "דנה לוי", status: "active", subjects: "" },
        { id: "b", name: "דנה כהן", status: "active", subjects: "" },
      ],
    });
    const out = await runTool(client, "suggest_alternative_slots", { student_name: "דנה", lesson_type: "פסנתר", from: "2026-11-11", to: "2026-11-12" });
    expect(JSON.stringify(out.result)).toContain("Several student");
  });
});

function scripted(results: Partial<ProviderResult>[]) {
  const seen: { messages: ProviderMessage[]; toolCount: number }[] = [];
  let i = 0;
  const provider: Provider = {
    async complete(messages, tools) {
      seen.push({ messages: structuredClone(messages), toolCount: tools.length });
      const r = results[Math.min(i++, results.length - 1)];
      return { content: null, toolCalls: [], tokensIn: 10, tokensOut: 5, ...r };
    },
  };
  return { provider, seen };
}

const call = (name: string, args: unknown, id = "c1") => ({ id, type: "function" as const, function: { name, arguments: JSON.stringify(args) } });
const signal = () => new AbortController().signal;

describe("runAssistant", () => {
  it("runs the requested tool, feeds the result back and returns the answer with the suggested times", async () => {
    const { client } = fakeSupabase();
    const { provider, seen } = scripted([
      { toolCalls: [call("suggest_alternative_slots", { student_name: "דנה לוי", lesson_type: "פסנתר", from: "2026-11-11", to: "2026-11-12" })] },
      { content: "יש מועד ביום רביעי בשעה 10:45." },
    ]);
    const result = await runAssistant({ provider, supabase: client, history: [{ role: "user", content: "מצא מועד" }], today: "2026-11-03", signal: signal() });
    expect(result.answer).toBe("יש מועד ביום רביעי בשעה 10:45.");
    expect(result.slots).toHaveLength(1);
    expect(result.tokensIn).toBe(20);
    const tool = seen[1].messages.find((m) => m.role === "tool");
    expect(tool && "content" in tool ? tool.content : "").toContain("10:45");
  });

  it("tells the model it is read-only and what today is", async () => {
    const { client } = fakeSupabase();
    const { provider, seen } = scripted([{ content: "בסדר" }]);
    await runAssistant({ provider, supabase: client, history: [{ role: "user", content: "שלום" }], today: "2026-11-03", signal: signal() });
    const system = seen[0].messages[0];
    expect(system.role).toBe("system");
    expect("content" in system && system.content).toContain("לקריאה בלבד");
    expect("content" in system && system.content).toContain("2026-11-03");
  });

  it("answers an unknown tool with an error and goes on", async () => {
    const { client, rpcs } = fakeSupabase();
    const { provider, seen } = scripted([{ toolCalls: [call("delete_all_lessons", {})] }, { content: "אין לי כלי כזה." }]);
    const result = await runAssistant({ provider, supabase: client, history: [{ role: "user", content: "מחק הכול" }], today: "2026-11-03", signal: signal() });
    expect(result.answer).toBe("אין לי כלי כזה.");
    expect(rpcs).toEqual([]);
    const tool = seen[1].messages.find((m) => m.role === "tool");
    expect(tool && "content" in tool && tool.content).toContain("Unknown tool");
  });

  it("stops calling tools after the round limit and forces an answer", async () => {
    const { client } = fakeSupabase();
    const loop = { toolCalls: [call("school_summary", { from: "2026-11-01", to: "2026-11-30" })] };
    const { provider, seen } = scripted([...Array(MAX_TOOL_ROUNDS).fill(loop), { content: "סיכום" }]);
    const result = await runAssistant({ provider, supabase: client, history: [{ role: "user", content: "?" }], today: "2026-11-03", signal: signal() });
    expect(result.answer).toBe("סיכום");
    expect(seen.at(-1)!.toolCount).toBe(0);
  });

  it("fails cleanly on an empty answer", async () => {
    const { client } = fakeSupabase();
    const { provider } = scripted([{ content: "  " }]);
    await expect(
      runAssistant({ provider, supabase: client, history: [{ role: "user", content: "?" }], today: "2026-11-03", signal: signal() }),
    ).rejects.toMatchObject({ key: "ai_bad_response" });
  });
});

describe("openAiProvider", () => {
  const env = { OPENAI_API_KEY: "sk-test", OPENAI_BASE_URL: "http://fake.local/v1", OPENAI_MODEL: "m" };
  const original = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = original;
  });

  const respond = (status: number, body: unknown) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  const ask = () => openAiProvider(env)!.complete([{ role: "user", content: "x" }], [], new AbortController().signal);

  it("is off without a key", () => {
    expect(openAiProvider({})).toBeNull();
    expect(openAiProvider({ OPENAI_API_KEY: "  " })).toBeNull();
  });

  it("reads the answer, tool calls and token counts", async () => {
    globalThis.fetch = vi.fn(async () =>
      respond(200, {
        choices: [{ message: { content: "שלום", tool_calls: [{ id: "c", type: "function", function: { name: "find_people", arguments: "{}" } }] } }],
        usage: { prompt_tokens: 7, completion_tokens: 3 },
      }),
    ) as never;
    const r = await ask();
    expect(r).toMatchObject({ content: "שלום", tokensIn: 7, tokensOut: 3 });
    expect(r.toolCalls[0].function.name).toBe("find_people");
  });

  it("sends the key only in the Authorization header", async () => {
    const fetchMock = vi.fn(async () => respond(200, { choices: [{ message: { content: "ok" } }] }));
    globalThis.fetch = fetchMock as never;
    await ask();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://fake.local/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk-test");
    expect(String(init.body)).not.toContain("sk-test");
  });

  it.each([401, 429, 400])("maps HTTP %i to 'unavailable' without retrying", async (status) => {
    const fetchMock = vi.fn(async () => respond(status, { error: { message: "details we must not show" } }));
    globalThis.fetch = fetchMock as never;
    await expect(ask()).rejects.toMatchObject({ key: "ai_unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a server error once, then gives up", async () => {
    const fetchMock = vi.fn(async () => respond(503, "down"));
    globalThis.fetch = fetchMock as never;
    await expect(ask()).rejects.toMatchObject({ key: "ai_unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("recovers when the retry succeeds", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(respond(500, "x")).mockResolvedValueOnce(respond(200, { choices: [{ message: { content: "בסדר" } }] }));
    globalThis.fetch = fetchMock as never;
    expect((await ask()).content).toBe("בסדר");
  });

  it("rejects broken JSON and empty choices as a bad response", async () => {
    globalThis.fetch = vi.fn(async () => respond(200, "not json")) as never;
    await expect(ask()).rejects.toMatchObject({ key: "ai_bad_response" });
    globalThis.fetch = vi.fn(async () => respond(200, { choices: [] })) as never;
    await expect(ask()).rejects.toMatchObject({ key: "ai_bad_response" });
  });

  it("maps a network failure to 'unavailable' and an abort to 'timeout'", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as never;
    await expect(ask()).rejects.toBeInstanceOf(AssistantError);
    await expect(ask()).rejects.toMatchObject({ key: "ai_unavailable" });

    const controller = new AbortController();
    globalThis.fetch = vi.fn(async () => {
      controller.abort();
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    }) as never;
    await expect(openAiProvider(env)!.complete([], [], controller.signal)).rejects.toMatchObject({ key: "ai_timeout" });
  });

  it("drops malformed tool calls", async () => {
    globalThis.fetch = vi.fn(async () =>
      respond(200, { choices: [{ message: { content: "x", tool_calls: [{ id: 5 }, { id: "a", type: "function", function: { name: "n" } }] } }] }),
    ) as never;
    expect((await ask()).toolCalls).toEqual([]);
  });
});
