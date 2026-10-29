import type { Metadata } from "next";
import { AuthHeader } from "../AuthHeader";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "התחברות" };

const NOTICES: Record<string, string> = {
  "signed-out": "התנתקת מהמערכת.",
  registered: "החשבון נוצר. התחברו עם האימייל והסיסמה שבחרתם.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const notice = typeof params.notice === "string" ? NOTICES[params.notice] : undefined;

  return (
    <>
      <AuthHeader title="ברוכים הבאים" subtitle="למערכת ניהול בית הספר למוזיקה" />
      <LoginForm next={next} notice={notice} />
    </>
  );
}
