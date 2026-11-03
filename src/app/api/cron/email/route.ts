import { timingSafeEqual } from "node:crypto";
import { dispatchOutbox } from "@/lib/email/dispatch";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Called every minute by Supabase Cron (pg_net) when e-mail is waiting. Only the shared secret
// opens it; without CRON_SECRET configured nobody can.
export async function POST(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const result = await dispatchOutbox(createAdminClient());
  return Response.json(result);
}
