import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { SignOutButton } from "../SignOutButton";
import styles from "../Status.module.css";

export const metadata: Metadata = { title: "אין הרשאה" };

export default function ForbiddenPage() {
  return (
    <div className={styles.box}>
      <span className={styles.icon} aria-hidden="true">
        <ShieldAlert size={32} strokeWidth={1.5} />
      </span>
      <h1 className="text-h2">אין לך הרשאה לצפות בדף זה</h1>
      <p className="text-body-lg text-secondary">הדף שביקשת אינו זמין לתפקיד שלך במערכת.</p>
      <div className={styles.actions}>
        <ButtonLink href="/" fullWidth>
          חזרה לדף הבית
        </ButtonLink>
        <SignOutButton />
      </div>
    </div>
  );
}
