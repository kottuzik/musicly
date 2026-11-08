import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./Alert.module.css";

type AlertTone = "info" | "success" | "warning" | "error";

const ICONS = { info: Info, success: CircleCheck, warning: TriangleAlert, error: CircleAlert };

export function Alert({ tone = "info", children }: { tone?: AlertTone; children: ReactNode }) {
  const Icon = ICONS[tone];
  // Errors are announced immediately; other messages politely.
  const role = tone === "error" ? "alert" : "status";
  return (
    // tabIndex -1 lets a form move focus to its error message after a failed submit (useFocusFirstError).
    <div className={`${styles.alert} ${styles[tone]}`} role={role} tabIndex={tone === "error" ? -1 : undefined}>
      <Icon className={styles.icon} size={18} strokeWidth={1.75} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
