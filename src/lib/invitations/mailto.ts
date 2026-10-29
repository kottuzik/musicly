// Prefilled email the admin sends from their own mail app (no automatic sending yet).
export function invitationMailto({
  email,
  fullName,
  link,
  expiresAt,
}: {
  email: string;
  fullName: string;
  link: string;
  expiresAt: string;
}): string {
  const expires = new Date(expiresAt).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" });
  const subject = "הזמנה להצטרף למערכת בית הספר למוזיקה";
  const body = [
    `שלום ${fullName},`,
    "",
    "הוזמנת להצטרף למערכת הניהול של בית הספר למוזיקה.",
    "להשלמת ההרשמה ולבחירת סיסמה, יש לפתוח את הקישור:",
    link,
    "",
    `הקישור אישי ותקף עד ${expires}.`,
  ].join("\n");
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
