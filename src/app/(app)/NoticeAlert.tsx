import { ClearNotice } from "@/components/ClearNotice";
import { Alert } from "@/components/ui/Alert";

const NOTICES: Record<string, string> = {
  "password-updated": "הסיסמה עודכנה בהצלחה.",
  deleted: "נמחק. אפשר לשחזר במשך 30 יום בלשונית ”נמחקו לאחרונה”.",
};

export function NoticeAlert({ notice }: { notice: string | string[] | undefined }) {
  const message = typeof notice === "string" ? NOTICES[notice] : undefined;
  if (!message) return null;
  return (
    <>
      <ClearNotice />
      <Alert tone="success">{message}</Alert>
    </>
  );
}
