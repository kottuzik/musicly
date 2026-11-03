import { isAdminRole, type Role, type UserStatus } from "@/lib/auth/roles";

export type NavIcon =
  | "home"
  | "calendar"
  | "students"
  | "teachers"
  | "requests"
  | "availability"
  | "users"
  | "settings"
  | "profile"
  | "notifications";

export type NavItem = { href: string; label: string; icon: NavIcon };

// Only screens that already exist are listed; later milestones add their items here.
export function navItemsForRole(role: Role, status: UserStatus = "active"): NavItem[] {
  const profile: NavItem = { href: "/profile", label: "פרופיל", icon: "profile" };
  const notifications: NavItem = { href: "/notifications", label: "התראות", icon: "notifications" };
  if (isAdminRole(role)) {
    return [
      { href: "/admin", label: "בית", icon: "home" },
      { href: "/admin/calendar", label: "לוח שנה", icon: "calendar" },
      { href: "/admin/students", label: "תלמידים", icon: "students" },
      { href: "/admin/teachers", label: "מורים", icon: "teachers" },
      { href: "/admin/requests", label: "בקשות", icon: "requests" },
      notifications,
      { href: "/admin/users", label: "משתמשים", icon: "users" },
      { href: "/admin/settings", label: "הגדרות", icon: "settings" },
      profile,
    ];
  }
  // An inactive teacher may only view their lesson history.
  if (status === "inactive") return [{ href: "/teacher", label: "בית", icon: "home" }, profile];
  return [
    { href: "/teacher", label: "בית", icon: "home" },
    { href: "/teacher/calendar", label: "לוח שנה", icon: "calendar" },
    { href: "/teacher/requests", label: "בקשות", icon: "requests" },
    notifications,
    { href: "/teacher/students", label: "התלמידים שלי", icon: "students" },
    { href: "/teacher/availability", label: "הזמינות שלי", icon: "availability" },
    profile,
  ];
}
