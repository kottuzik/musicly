import Link from "next/link";
import styles from "./Tabs.module.css";

// URL-based tabs: each tab is a link, so the selected tab survives reloads and is shareable.
export function Tabs({ label, items, current }: { label: string; items: { href: string; label: string; key: string }[]; current: string }) {
  return (
    <nav aria-label={label} className={styles.tabs}>
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={styles.tab}
          aria-current={item.key === current ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
