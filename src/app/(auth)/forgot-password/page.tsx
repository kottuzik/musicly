import type { Metadata } from "next";
import { AuthHeader } from "../AuthHeader";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata: Metadata = { title: "שכחת סיסמה" };

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  const params = await searchParams;
  return (
    <>
      <AuthHeader title="שכחת סיסמה?" subtitle="נשלח אליך קישור לקביעת סיסמה חדשה" />
      <ForgotPasswordForm linkError={params.error === "link"} />
    </>
  );
}
