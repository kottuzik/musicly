import { describeNotification, type NotificationRow } from "@/lib/notifications/labels";

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type OutboxMessage = { kind: string; payload: unknown };

// A Hebrew, right-to-left e-mail with the minimum: what happened, when, and a link to the system.
// No student names: the notification payload never holds one (ARCHITECTURE §6.2).
export function buildEmail(message: OutboxMessage, siteUrl: string) {
  const view = describeNotification(
    { type: message.kind, payload: message.payload, subject_name: null, entity_id: null } as unknown as NotificationRow,
    "/admin",
  );
  const link = `${siteUrl.replace(/\/$/, "")}/notifications`;
  const subject = view.title;
  const text = [view.title, view.detail, "", `לפתיחת ההתראות במערכת: ${link}`].filter((l) => l !== undefined).join("\n");
  const html = `<!doctype html>
<html lang="he" dir="rtl">
<body style="margin:0;padding:24px;background:#F8FAFC;font-family:Heebo,Arial,sans-serif;color:#1F2937;">
  <div dir="rtl" style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #ABB2BF;border-radius:12px;padding:24px;text-align:right;">
    <h1 style="margin:0 0 12px;font-size:20px;line-height:28px;">${escape(view.title)}</h1>
    ${view.detail ? `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#6B7280;">${escape(view.detail)}</p>` : ""}
    <p style="margin:0;"><a href="${escape(link)}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#6B46C1;color:#FFFFFF;text-decoration:none;font-weight:600;">פתיחת ההתראות</a></p>
  </div>
</body>
</html>`;
  return { subject, html, text };
}
