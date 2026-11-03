import { z } from "zod";
import { ADMIN_ROLES, hasAppAccess } from "@/lib/auth/roles";
import { getCurrentProfile } from "@/lib/auth/session";
import { ASSISTANT_ERRORS, rateLimitMessage } from "@/lib/assistant/messages";
import { AssistantError, openAiProvider } from "@/lib/assistant/provider";
import { runAssistant, TIMEOUT_MS } from "@/lib/assistant/run";
import { schoolToday } from "@/lib/students/age";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(1000) }))
    .min(1)
    .max(10),
});

const json = (data: unknown, status: number) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });

function limit(name: string, fallback: number) {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// The admin assistant. The role is read from the database; a teacher never reaches the AI service.
// Nothing about the conversation is stored or logged - only that a request happened, and its size.
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ error: "forbidden" }, 403);

  const { userId, profile } = await getCurrentProfile();
  if (!userId) return json({ error: "unauthorized" }, 401);
  if (!profile || !hasAppAccess(profile) || profile.status !== "active" || !ADMIN_ROLES.includes(profile.role)) {
    return json({ error: "forbidden" }, 403);
  }

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.messages.at(-1)?.role !== "user") {
    return json({ error: "invalid_input", message: ASSISTANT_ERRORS.invalid_input }, 422);
  }

  const provider = openAiProvider();
  if (!provider) return json({ error: "ai_not_configured", message: ASSISTANT_ERRORS.ai_not_configured }, 503);

  const supabase = await createClient();
  const { data: usageId, error: reserveError } = await supabase.rpc("ai_reserve_request", {
    p_hourly: limit("AI_HOURLY_LIMIT", 20),
    p_daily: limit("AI_DAILY_LIMIT", 300),
  });
  if (reserveError || !usageId) {
    if (reserveError?.message === "ai_rate_limited") {
      const minutes = Number.parseInt(reserveError.details ?? "", 10);
      return json({ error: "ai_rate_limited", message: rateLimitMessage(minutes) }, 429);
    }
    return json({ error: "ai_unavailable", message: ASSISTANT_ERRORS.ai_unavailable }, 503);
  }

  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), TIMEOUT_MS);
  let outcome = "ok";
  let tokensIn = 0;
  let tokensOut = 0;
  try {
    const result = await runAssistant({
      provider,
      supabase,
      history: parsed.data.messages,
      today: schoolToday(),
      signal: timeout.signal,
    });
    tokensIn = result.tokensIn;
    tokensOut = result.tokensOut;
    return json({ answer: result.answer, slots: result.slots }, 200);
  } catch (error) {
    const key = error instanceof AssistantError ? error.key : timeout.signal.aborted ? "ai_timeout" : "ai_unavailable";
    outcome = key;
    return json({ error: key, message: ASSISTANT_ERRORS[key] }, key === "ai_timeout" ? 504 : 503);
  } finally {
    clearTimeout(timer);
    await supabase.rpc("ai_record_usage", {
      p_id: usageId,
      p_tokens_in: tokensIn,
      p_tokens_out: tokensOut,
      p_outcome: outcome,
    });
  }
}
