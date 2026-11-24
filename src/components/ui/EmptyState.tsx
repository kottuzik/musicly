import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import styles from "./EmptyState.module.css";

// Quiet placeholder for lists with nothing in them: a line icon, one plain sentence and an optional next step.
export function EmptyState({
  icon: Icon,
  children,
  action,
}: {
  icon: LucideIcon;
  children: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className={styles.empty}>
      <Icon className={styles.icon} size={20} strokeWidth={1.5} aria-hidden="true" />
      <p className={styles.text}>{children}</p>
      {action && (
        <Link href={action.href} className={styles.action}>
          {action.label}
        </Link>
      )}
    </div>
  );
}
