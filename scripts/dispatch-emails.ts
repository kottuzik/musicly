// Sends the e-mail waiting in the outbox of the Development project, once. Cloud Cron cannot reach
// localhost, so this is how outgoing e-mail is tried from a development machine. In test mode
// (the default) only addresses in EMAIL_TEST_RECIPIENTS receive anything. Nothing secret is printed.
import { createClient } from "@supabase/supabase-js";
import { dispatchOutbox } from "../src/lib/email/dispatch";
import { emailMode } from "../src/lib/email/mode";
import type { Database } from "../src/types/database";
import { requireEnv } from "./env";

const supabase = createClient<Database>(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SECRET_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const result = await dispatchOutbox(supabase);
  console.log(`Mode: ${emailMode()}`);
  console.log(result);
  if (result.note === "not_configured") {
    console.log("Add RESEND_API_KEY and EMAIL_FROM to .env to send.");
  }
}

void main();
