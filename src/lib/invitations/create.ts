import "server-only";
import type { InviteState } from "@/components/invitations/CreateInviteButton";
import type { Database } from "@/types/database";
import { dbErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { createInvitationToken, registrationLink } from "./token";

type InvitationRole = Database["public"]["Enums"]["invitation_role"];

// Creates an invitation through the database (which checks the caller's permissions)
// and returns the link once. The raw token is never stored.
export async function createInvitation(params: {
  role: InvitationRole;
  teacherId?: string;
  fullName: string;
  email: string;
}): Promise<InviteState> {
  const supabase = await createClient();
  const { token, hash } = createInvitationToken();
  const { data: expiresAt, error } = await supabase.rpc("create_invitation", {
    p_role: params.role,
    p_teacher_id: (params.teacherId ?? null) as unknown as string,
    p_full_name: params.fullName,
    p_email: params.email,
    p_token_hash: hash,
  });
  if (error || !expiresAt) return { error: dbErrorMessage(error) };
  return {
    ok: true,
    invite: { link: registrationLink(token), email: params.email, fullName: params.fullName, expiresAt },
  };
}
