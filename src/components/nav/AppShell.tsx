import Link from "next/link";
import { LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { ROLE_LABELS, type Profile } from "@/lib/auth/roles";
import { navItemsForRole } from "@/lib/nav/items";
import { PageBackground } from "@/components/PageBackground";
import { Brand } from "./Brand";
import { MobileNav } from "./MobileNav";
import { NavLinks } from "./NavLinks";
import styles from "./AppShell.module.css";

export function AppShell({ profile, children }: { profile: Profile; children: ReactNode }) {
  const items = navItemsForRole(profile.role);
  return (
    <>
      <PageBackground />
      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <Brand />
          <nav aria-label="ניווט ראשי">
            <NavLinks items={items} />
          </nav>
        </aside>
        <div className={styles.main}>
          <header className={styles.header}>
            <div className={styles.headerStart}>
              <MobileNav items={items} />
            </div>
            <div className={styles.user}>
              <Link href="/profile" className={styles.profileLink} aria-label={`הפרופיל שלי: ${profile.full_name}`}>
                <span className={styles.userText}>
                  <span className={styles.userName}>{profile.full_name}</span>
                  <span className="text-small text-secondary">{ROLE_LABELS[profile.role]}</span>
                </span>
                <span className={styles.avatar} aria-hidden="true">
                  {profile.full_name.trim().charAt(0)}
                </span>
              </Link>
              <form action="/auth/signout" method="post">
                <button type="submit" className={styles.logout}>
                  <LogOut size={18} strokeWidth={1.75} aria-hidden="true" />
                  <span>יציאה</span>
                </button>
              </form>
            </div>
          </header>
          <main id="main" className={styles.content}>
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
