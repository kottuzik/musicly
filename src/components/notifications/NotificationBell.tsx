import { Bell } from "lucide-react";
import Link from "next/link";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";
import styles from "./Notifications.module.css";

// Header bell with the number of waiting notifications. The count is read on the server; Realtime
// on the notifications table refreshes the layout when one arrives or is read.
export function NotificationBell({ unread }: { unread: number }) {
  const label = unread > 0 ? `התראות: ${unread} שלא נקראו` : "התראות";
  return (
    <>
      <LiveRefresh tables={["notifications"]} />
      <Link href="/notifications" className={styles.bell} aria-label={label}>
        <Bell size={20} strokeWidth={1.75} aria-hidden="true" />
        {unread > 0 && (
          <span className={styles.bellCount} aria-hidden="true">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Link>
    </>
  );
}
