import type { Metadata } from "next";
import { SearchX } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import AuthLayout from "./(auth)/layout";
import styles from "./(status)/Status.module.css";

export const metadata: Metadata = { title: "הדף לא נמצא" };

// Shown for any unknown address; reuses the calm full-screen look of the other status pages.
export default function NotFound() {
  return (
    <AuthLayout params={Promise.resolve({})}>
      <div className={styles.box}>
        <span className={styles.icon} aria-hidden="true">
          <SearchX size={32} strokeWidth={1.5} />
        </span>
        <h1 className="text-h2">הדף שחיפשת לא נמצא</h1>
        <p className="text-body-lg text-secondary">ייתכן שהכתובת שגויה או שהדף הוסר.</p>
        <div className={styles.actions}>
          <ButtonLink href="/" fullWidth>
            חזרה לדף הבית
          </ButtonLink>
        </div>
      </div>
    </AuthLayout>
  );
}
