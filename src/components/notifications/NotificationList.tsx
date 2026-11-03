"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { DecisionDialog } from "@/components/availability/DecisionDialog";
import { ExceptionDecisionDialog } from "@/components/lessons/ExceptionDecisionDialog";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ChangeRequestActions } from "@/components/lessons/ChangeRequestActions";
import type { BookingOptions, LessonChangeRequest } from "@/lib/lessons/queries";
import { formatLessonDate, schoolTime } from "@/lib/lessons/time";
import {
  archiveAllNotifications,
  archiveNotifications,
  markAllNotificationsRead,
  markNotificationsRead,
  unarchiveNotifications,
} from "@/lib/notifications/actions";
import { describeNotification, type NotificationRow, type NotificationTab, type NotificationView } from "@/lib/notifications/labels";
import type { PendingRequest } from "@/lib/notifications/queries";
import styles from "./Notifications.module.css";

type Props = {
  rows: NotificationRow[];
  tab: NotificationTab;
  base: "/admin" | "/teacher";
  // Requests that still wait for an answer, by request id: only these show the answer buttons.
  pending: Record<string, PendingRequest>;
  // Admins: the pending change requests with their lesson, and what the new-time dialog needs.
  changeRequests?: Record<string, LessonChangeRequest>;
  options?: BookingOptions;
  // All notifications of this tab (all pages), for the "archive all" button.
  total: number;
};

// The answer buttons of a notification about a request, using the same dialogs as the requests screens.
function RequestActions({ n, view, request }: { n: NotificationRow; view: NotificationView; request: PendingRequest }) {
  const id = n.entity_id!;
  const summary = [view.title, view.detail].filter(Boolean).join(" — ");

  if (n.type === "availability_request_new") {
    return (
      <>
        <DecisionDialog request={{ id, version: request.version }} decision="approve" summary={summary} />
        <DecisionDialog request={{ id, version: request.version }} decision="reject" summary={summary} />
      </>
    );
  }
  if (n.type === "approval_request_new") {
    return (
      <>
        <ExceptionDecisionDialog request={{ id, version: request.version }} decision="approve" summary={summary} />
        <ExceptionDecisionDialog request={{ id, version: request.version }} decision="reject" summary={summary} />
      </>
    );
  }
  return null;
}

// The notification center list. Rows can be marked read and archived (or brought back from the
// archive); there is no way to delete one.
export function NotificationList({ rows, tab, base, pending: pendingRequests, changeRequests, options, total }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function run(action: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else {
        setSelected(new Set());
        router.refresh();
      }
    });
  }

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }
  const chosen = rows.filter((r) => selected.has(r.id)).map((r) => r.id);

  const hasUnread = rows.some((r) => !r.read_at);

  // When a request that was waiting gets an answer (here or elsewhere), offer to archive its notification.
  const pendingKey = Object.keys(pendingRequests).sort().join(",");
  const previouslyPending = useRef<Set<string>>(new Set(Object.keys(pendingRequests)));
  const [offer, setOffer] = useState<string[]>([]);
  useEffect(() => {
    const now = new Set(pendingKey ? pendingKey.split(",") : []);
    const answered = tab === "archive" ? [] : rows.filter((r) => r.entity_id && previouslyPending.current.has(r.entity_id) && !now.has(r.entity_id)).map((r) => r.id);
    previouslyPending.current = now;
    if (answered.length) setOffer((prev) => [...new Set([...prev, ...answered])]);
  }, [pendingKey, rows, tab]);
  const offered = rows.filter((r) => offer.includes(r.id) && !r.archived_at).map((r) => r.id);

  return (
    <div>
      {error && <Alert tone="error">{error}</Alert>}
      {offered.length > 0 && (
        <Alert tone="info">
          <div className={styles.toolbar}>
            <span>{offered.length === 1 ? "הבקשה טופלה. להעביר את ההתראה שלה לארכיון?" : `${offered.length} בקשות טופלו. להעביר את ההתראות שלהן לארכיון?`}</span>
            <span className={styles.toolbarActions}>
              <Button size="small" disabled={pending} onClick={() => run(async () => { const r = await archiveNotifications(offered); if (!r.error) setOffer([]); return r; })}>
                העברה לארכיון
              </Button>
              <Button variant="outline" size="small" disabled={pending} onClick={() => setOffer([])}>
                לא עכשיו
              </Button>
            </span>
          </div>
        </Alert>
      )}
      <div className={styles.toolbar}>
        <label className={styles.selectAll}>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
          />
          בחירת כל ההתראות בעמוד
        </label>
        <div className={styles.toolbarActions}>
          {chosen.length > 0 &&
            (tab === "archive" ? (
              <Button size="small" disabled={pending} onClick={() => run(() => unarchiveNotifications(chosen))}>
                החזרה מהארכיון ({chosen.length})
              </Button>
            ) : (
              <Button size="small" disabled={pending} onClick={() => run(() => archiveNotifications(chosen))}>
                העברת הנבחרות לארכיון ({chosen.length})
              </Button>
            ))}
          {tab !== "archive" && hasUnread && (
            <Button variant="outline" size="small" disabled={pending} onClick={() => run(() => markAllNotificationsRead())}>
              סימון הכול כנקרא
            </Button>
          )}
          {tab !== "archive" && (
            <Button variant="outline" size="small" disabled={pending} onClick={() => run(() => archiveAllNotifications(tab))}>
              העברת הכול לארכיון ({total})
            </Button>
          )}
        </div>
      </div>
      <ul className={styles.list}>
        {rows.map((n) => {
          const view = describeNotification(n, base);
          const unread = !n.read_at;
          return (
            <li key={n.id} className={`${styles.item} ${unread ? styles.unread : ""}`}>
              <input
                type="checkbox"
                className={styles.check}
                checked={selected.has(n.id)}
                onChange={() => toggle(n.id)}
                aria-label={`בחירה: ${view.title}`}
              />
              <span className={styles.dot} aria-hidden="true" />
              <div className={styles.body}>
                {unread && (
                  <span className={styles.badge} aria-hidden="true">
                    חדשה
                  </span>
                )}
                {view.href ? (
                  <Link
                    href={view.href}
                    className={styles.title}
                    onClick={() => {
                      if (unread) void markNotificationsRead([n.id]);
                    }}
                  >
                    {unread && <span className="visually-hidden">לא נקראה: </span>}
                    {view.title}
                  </Link>
                ) : (
                  <span className={styles.title}>
                    {unread && <span className="visually-hidden">לא נקראה: </span>}
                    {view.title}
                  </span>
                )}
                {view.detail && <span className="text-secondary">{view.detail}</span>}
                <span className="text-small text-secondary">
                  {formatLessonDate(n.created_at)} <bdi dir="ltr">{schoolTime(n.created_at)}</bdi>
                </span>
              </div>
              <div className={styles.actions}>
                {n.type === "change_request_new" && n.entity_id && changeRequests?.[n.entity_id] && options && tab !== "archive" && (
                  <ChangeRequestActions request={changeRequests[n.entity_id]} options={options} />
                )}
                {n.entity_id && pendingRequests[n.entity_id] && tab !== "archive" && (
                  <RequestActions n={n} view={view} request={pendingRequests[n.entity_id]} />
                )}
                {unread && tab !== "archive" && (
                  <Button variant="ghost" size="small" disabled={pending} onClick={() => run(() => markNotificationsRead([n.id]))}>
                    סימון כנקרא
                  </Button>
                )}
                {tab === "archive" ? (
                  <Button variant="outline" size="small" disabled={pending} onClick={() => run(() => unarchiveNotifications([n.id]))}>
                    החזרה מהארכיון
                  </Button>
                ) : (
                  <Button variant="outline" size="small" disabled={pending} onClick={() => run(() => archiveNotifications([n.id]))}>
                    העברה לארכיון
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
