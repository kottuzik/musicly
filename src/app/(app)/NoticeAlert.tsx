import { Alert } from "@/components/ui/Alert";

const NOTICES: Record<string, string> = {
  "password-updated": "הסיסמה עודכנה בהצלחה.",
};

export function NoticeAlert({ notice }: { notice: string | string[] | undefined }) {
  const message = typeof notice === "string" ? NOTICES[notice] : undefined;
  return message ? <Alert tone="success">{message}</Alert> : null;
}
