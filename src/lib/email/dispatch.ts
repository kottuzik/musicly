import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { mayEmail } from "./mode";
import { emailConfigured, sendEmail } from "./send";
import { buildEmail } from "./templates";

export type DispatchResult = { claimed: number; sent: number; skipped: number; failed: number; note?: string };

const BATCH = 20;
const MAX_BATCHES = 3;

// Sends the e-mail that is waiting in the outbox. `supabase` must be the secret-key (service role)
// client: claiming and completing messages is allowed to it alone. Safe to run twice at once.
export async function dispatchOutbox(
  supabase: SupabaseClient<Database>,
  siteUrl: string = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
): Promise<DispatchResult> {
  const result: DispatchResult = { claimed: 0, sent: 0, skipped: 0, failed: 0 };
  // Without a sender configured nothing is claimed, so messages simply wait instead of failing.
  if (!emailConfigured()) return { ...result, note: "not_configured" };

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const { data: rows, error } = await supabase.rpc("claim_email_outbox", { p_limit: BATCH });
    if (error || !rows || rows.length === 0) break;
    result.claimed += rows.length;

    for (const row of rows) {
      if (!mayEmail(row.to_email)) {
        await supabase.rpc("complete_email_outbox", { p_id: row.id, p_result: "skipped", p_provider_id: "", p_error: "" });
        result.skipped++;
        continue;
      }
      const { subject, html, text } = buildEmail({ kind: row.kind, payload: row.payload }, siteUrl);
      const sent = await sendEmail({ to: row.to_email, subject, html, text, idempotencyKey: row.id });
      if (sent.ok) {
        await supabase.rpc("complete_email_outbox", { p_id: row.id, p_result: "sent", p_provider_id: sent.id ?? "", p_error: "" });
        result.sent++;
      } else {
        await supabase.rpc("complete_email_outbox", { p_id: row.id, p_result: "error", p_provider_id: "", p_error: sent.error });
        result.failed++;
      }
    }
    if (rows.length < BATCH) break;
  }
  return result;
}
