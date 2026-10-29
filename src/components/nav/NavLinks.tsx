"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap, House, Settings, UserRound, Users } from "lucide-react";
import type { NavIcon, NavItem } from "@/lib/nav/items";
import styles from "./AppShell.module.css";

const ICONS: Record<NavIcon, typeof House> = {
  home: House,
  teachers: GraduationCap,
  users: Users,
  settings: Settings,
  profile: UserRound,
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
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
