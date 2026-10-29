import { isAdminRole, type Role } from "@/lib/auth/roles";

export type NavIcon = "home";

export type NavItem = { href: string; label: string; icon: NavIcon };

// Only screens that already exist are listed; later milestones add their items here.
export function navItemsForRole(role: Role): NavItem[] {
  if (isAdminRole(role)) {
    return [{ href: "/admin", label: "בית", icon: "home" }];
  }
  return [{ href: "/teacher", label: "בית", icon: "home" }];
}
