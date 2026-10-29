import type { ReactNode } from "react";
import styles from "./PageHeader.module.css";

type PageHeaderProps = { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; level?: 1 | 2 };

export function PageHeader({ title, subtitle, actions, level = 1 }: PageHeaderProps) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <div className={styles.header}>
      <div className={styles.text}>
        <Heading>{title}</Heading>
        {subtitle && <div className="text-body-lg text-secondary">{subtitle}</div>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
