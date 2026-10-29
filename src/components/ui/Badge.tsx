import type { CSSProperties, ReactNode } from "react";
import styles from "./Badge.module.css";

export type BadgeTone = "neutral" | "success" | "warning" | "error" | "info" | "primary";

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}

// Lesson type label with its calendar color as a dot (color is never the only cue: the name is shown).
export function ColorChip({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className={styles.chip} style={{ "--chip-color": color } as CSSProperties}>
      <span className={styles.dot} aria-hidden="true" />
      {children}
    </span>
  );
}
