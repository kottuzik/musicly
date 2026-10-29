import type { Metadata } from "next";
import { UserX } from "lucide-react";
import { SignOutButton } from "../SignOutButton";
import styles from "../Status.module.css";

export const metadata: Metadata = { title: "החשבון אינו זמין" };

export default function AccountUnavailablePage() {
  return (
    <div className={styles.box}>
      <span className={styles.icon} aria-hidden="true">
        <UserX size={32} strokeWidth={1.5} />
      </span>
      <h1 className="text-h2">החשבון אינו זמין</h1>
      <p className="text-body-lg text-secondary">
        החשבון שלך אינו פעיל או שעדיין לא הוגדר לו תפקיד במערכת. לבירור, פנו למנהל בית הספר.
      </p>
      <div className={styles.actions}>
        <SignOutButton variant="primary" />
      </div>
    </div>
  );
}
