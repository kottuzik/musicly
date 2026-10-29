import type { Database } from "@/types/database";

export type Role = Database["public"]["Enums"]["user_role"];
export type UserStatus = Database["public"]["Enums"]["user_status"];

export type Profile = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  status: UserStatus;
};

export const ADMIN_ROLES: readonly Role[] = ["super_admin", "admin"];
export const TEACHER_ROLES: readonly Role[] = ["teacher"];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "מנהל ראשי",
  admin: "מנהל",
  teacher: "מורה",
};

export function isAdminRole(role: Role): boolean {
  return ADMIN_ROLES.includes(role);
}

export function isSuperAdmin(role: Role): boolean {
  return role === "super_admin";
}

export function homePathForRole(role: Role): string {
  return isAdminRole(role) ? "/admin" : "/teacher";
}

// Inactive teachers may still sign in (read-only history, per PRD); inactive admins may not.
export function hasAppAccess(profile: Pick<Profile, "role" | "status">): boolean {
  return profile.status === "active" || profile.role === "teacher";
}

// Role-restricted areas. Paths outside these areas are open to any signed-in user.
const ROLE_AREAS: { prefix: string; roles: readonly Role[] }[] = [
  { prefix: "/admin", roles: ADMIN_ROLES },
  { prefix: "/teacher", roles: TEACHER_ROLES },
];

function matchesPrefix(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function canAccessPath(role: Role, path: string): boolean {
  const area = ROLE_AREAS.find((a) => matchesPrefix(path, a.prefix));
  return area ? area.roles.includes(role) : true;
}

// Paths reachable without a session. /reset-password checks the session itself
// so it can show a clear "link expired" message.
const PUBLIC_PREFIXES = ["/login", "/forgot-password", "/reset-password", "/register", "/auth"];
// Paths a signed-in user should not see (sent home instead).
const GUEST_ONLY_PREFIXES = ["/login", "/forgot-password", "/register"];

export function isPublicPath(path: string): boolean {
  return PUBLIC_PREFIXES.some((p) => matchesPrefix(path, p));
}

export function isGuestOnlyPath(path: string): boolean {
  return GUEST_ONLY_PREFIXES.some((p) => matchesPrefix(path, p));
}

// Accept only same-site relative paths, to prevent open redirects.
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}
