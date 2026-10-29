import type { Metadata } from "next";
import { Alert } from "@/components/ui/Alert";
import { ButtonLink } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/server";
import { AuthHeader } from "../AuthHeader";
import { ResetPasswordForm } from "./ResetPasswordForm";
import styles from "../AuthForm.module.css";

export const metadata: Metadata = { title: "סיסמה חדשה" };

export default async function ResetPasswordPage() {
  // The email link (/auth/confirm) creates a session before sending the user here.
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  return (
    <>
      <AuthHeader title="קביעת סיסמה חדשה" subtitle="בחרו סיסמה שתשמש אתכם להתחברות" />
      {data?.claims ? (
        <ResetPasswordForm />
      ) : (
        <div className={styles.form}>
          <Alert tone="warning">הקישור לאיפוס הסיסמה פג או אינו תקין. בקשו קישור חדש.</Alert>
          <ButtonLink href="/forgot-password" fullWidth>
            בקשת קישור חדש
          </ButtonLink>
        </div>
      )}
    </>
  );
}
