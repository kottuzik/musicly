import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/Alert";
import { dbErrorMessage } from "@/lib/errors";
import { AuthHeader } from "../AuthHeader";
import styles from "../AuthForm.module.css";
import { findValidInvitation } from "./invitation";
import { RegisterForm } from "./RegisterForm";

export const metadata: Metadata = { title: "הצטרפות למערכת" };

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const { token } = await searchParams;
  const tokenValue = typeof token === "string" ? token : "";
  const invitation = await findValidInvitation(tokenValue);

  return (
    <>
      <AuthHeader title="הצטרפות למערכת" subtitle="בחרו סיסמה כדי להשלים את ההרשמה" />
      {invitation ? (
        <RegisterForm token={tokenValue} email={invitation.email} fullName={invitation.fullName} />
      ) : (
        <>
          <Alert tone="error">{dbErrorMessage({ message: "invitation_invalid" })}</Alert>
          <p className={styles.footer}>
            <Link href="/login" className={styles.link}>
              מעבר למסך ההתחברות
            </Link>
          </p>
        </>
      )}
    </>
  );
}
