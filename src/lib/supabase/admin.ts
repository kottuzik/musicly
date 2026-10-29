import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Secret-key client that bypasses RLS. Use only for registration from an invitation
// (creating the auth user and accepting the invitation); everything else uses the user's session.
export function createAdminClient() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
