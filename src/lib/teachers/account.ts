import type { BadgeTone } from "@/components/ui/Badge";

export type OpenInvitation = { id: string; teacher_id: string | null; email: string; expires_at: string };

export type AccountState =
  | { kind: "registered" }
  | { kind: "invited"; invitationId: string; expiresAt: string }
  | { kind: "expired"; invitationId: string; expiresAt: string }
  | { kind: "none" };

// Registration state of a staff member, from their profile link and open invitation.
export function accountState(
  registered: boolean,
  invitation: Pick<OpenInvitation, "id" | "expires_at"> | undefined,
  now = new Date(),
): AccountState {
  if (registered) return { kind: "registered" };
  if (!invitation) return { kind: "none" };
  const expired = new Date(invitation.expires_at) <= now;
  return { kind: expired ? "expired" : "invited", invitationId: invitation.id, expiresAt: invitation.expires_at };
}

export const ACCOUNT_LABELS: Record<AccountState["kind"], { label: string; tone: BadgeTone }> = {
  registered: { label: "רשום במערכת", tone: "success" },
  invited: { label: "ממתין להרשמה", tone: "info" },
  expired: { label: "הקישור פג", tone: "warning" },
  none: { label: "טרם נשלח קישור", tone: "neutral" },
};

export const STATUS_LABELS = {
  active: { label: "פעיל", tone: "success" as BadgeTone },
  inactive: { label: "לא פעיל", tone: "neutral" as BadgeTone },
};

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" });
}
