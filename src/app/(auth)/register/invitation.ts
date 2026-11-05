import "server-only";
import { hashInvitationToken } from "@/lib/invitations/token";
import { createAdminClient } from "@/lib/supabase/admin";

export type ValidInvitation = { email: string; fullName: string; role: "admin" | "teacher" };

// Looks up an open, unexpired invitation by its token (server only, secret key).
export async function findValidInvitation(token: string): Promise<ValidInvitation | null> {
  if (!token || token.length > 200) return null;
  const { data, error } = await createAdminClient()
    .from("invitations")
    .select("email, full_name, role, expires_at")
    .eq("token_hash", hashInvitationToken(token))
    .is("used_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  // A failed lookup is a technical fault, not an expired link: log it (never the token) and show the
  // general error page rather than telling the person their link is no longer valid.
  if (error) {
    console.error("Registration: invitation lookup failed", error.code, error.message);
    throw new Error("Invitation lookup failed");
  }
  return data ? { email: data.email, fullName: data.full_name, role: data.role } : null;
}
