import { isAdminRole, type Role } from "@/lib/auth/roles";

export type NavIcon = "home" | "teachers" | "users" | "settings" | "profile";

export type NavItem = { href: string; label: string; icon: NavIcon };

// Only screens that already exist are listed; later milestones add their items here.
export function navItemsForRole(role: Role): NavItem[] {
  const profile: NavItem = { href: "/profile", label: "פרופיל", icon: "profile" };
  if (isAdminRole(role)) {
    return [
      { href: "/admin", label: "בית", icon: "home" },
      { href: "/admin/teachers", label: "מורים", icon: "teachers" },
      { href: "/admin/users", label: "משתמשים", icon: "users" },
      { href: "/admin/settings", label: "הגדרות", icon: "settings" },
      profile,
    ];
  }
  return [{ href: "/teacher", label: "בית", icon: "home" }, profile];
}
