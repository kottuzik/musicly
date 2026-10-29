import "server-only";
import { hashInvitationToken } from "@/lib/invitations/token";
import { createAdminClient } from "@/lib/supabase/admin";

export type ValidInvitation = { email: string; fullName: string; role: "admin" | "teacher" };

// Looks up an open, unexpired invitation by its token (server only, secret key).
export async function findValidInvitation(token: string): Promise<ValidInvitation | null> {
  if (!token || token.length > 200) return null;
  const { data } = await createAdminClient()
    .from("invitations")
    .select("email, full_name, role, expires_at")
    .eq("token_hash", hashInvitationToken(token))
    .is("used_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return data ? { email: data.email, fullName: data.full_name, role: data.role } : null;
}
