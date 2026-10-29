import { isAdminRole, type Role, type UserStatus } from "@/lib/auth/roles";

export type NavIcon = "home" | "students" | "teachers" | "users" | "settings" | "profile";

export type NavItem = { href: string; label: string; icon: NavIcon };

// Only screens that already exist are listed; later milestones add their items here.
export function navItemsForRole(role: Role, status: UserStatus = "active"): NavItem[] {
  const profile: NavItem = { href: "/profile", label: "פרופיל", icon: "profile" };
  if (isAdminRole(role)) {
    return [
      { href: "/admin", label: "בית", icon: "home" },
      { href: "/admin/students", label: "תלמידים", icon: "students" },
      { href: "/admin/teachers", label: "מורים", icon: "teachers" },
      { href: "/admin/users", label: "משתמשים", icon: "users" },
      { href: "/admin/settings", label: "הגדרות", icon: "settings" },
      profile,
    ];
  }
  // An inactive teacher may only view their lesson history.
  if (status === "inactive") return [{ href: "/teacher", label: "בית", icon: "home" }, profile];
  return [
    { href: "/teacher", label: "בית", icon: "home" },
    { href: "/teacher/students", label: "התלמידים שלי", icon: "students" },
    profile,
  ];
}
