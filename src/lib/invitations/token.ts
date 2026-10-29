import { createHash, randomBytes } from "node:crypto";

export const INVITATION_DAYS = 7;

// 256-bit random token for the registration link; only its hash is stored.
export function createInvitationToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashInvitationToken(token) };
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function registrationLink(token: string, siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000") {
  return `${siteUrl.replace(/\/$/, "")}/register?token=${encodeURIComponent(token)}`;
}
