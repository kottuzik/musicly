"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Bell, CalendarClock, CalendarDays, ClipboardCheck, GraduationCap, House, Music, Music2, Settings, UserRound, Users } from "lucide-react";
import type { NavIcon, NavItem } from "@/lib/nav/items";
import styles from "./AppShell.module.css";

const ICONS: Record<NavIcon, typeof House> = {
  home: House,
  calendar: CalendarDays,
  students: GraduationCap,
  teachers: Music,
  requests: ClipboardCheck,
  availability: CalendarClock,
  users: Users,
  settings: Settings,
  profile: UserRound,
  notifications: Bell,
  reports: BarChart3,
  teaching: Music2,
};

// Home links ("/admin", "/teacher") are active only on exact match, since other items live under them.
const EXACT = new Set(["/admin", "/teacher"]);

export function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className={styles.navList}>
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active =
          pathname === item.href || (!EXACT.has(item.href) && pathname.startsWith(`${item.href}/`));
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              className={styles.navLink}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
            >
              <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
              <span>{item.label}</span>
              <PendingMark />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// A small spinner on the link that was clicked, until the next page shows (or its loader does).
function PendingMark() {
  const { pending } = useLinkStatus();
  return pending ? <span className={styles.navPending} aria-hidden="true" /> : null;
}
