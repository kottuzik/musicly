"use client";

import { TriangleAlert } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/Button";
import AuthLayout from "./(auth)/layout";
import styles from "./(status)/Status.module.css";

// Last-resort screen for unexpected errors. It never shows technical details to the user.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <AuthLayout params={Promise.resolve({})}>
      <div className={styles.box} role="alert">
        <span className={styles.icon} aria-hidden="true">
          <TriangleAlert size={32} strokeWidth={1.5} />
        </span>
        <h1 className="text-h2">משהו השתבש</h1>
        <p className="text-body-lg text-secondary">לא הצלחנו להשלים את הפעולה. אפשר לנסות שוב, ואם זה חוזר — לפנות למנהל המערכת.</p>
        <div className={styles.actions}>
          <Button onClick={reset} fullWidth>
            ניסיון חוזר
          </Button>
          <ButtonLink href="/" variant="outline" fullWidth>
            חזרה לדף הבית
          </ButtonLink>
        </div>
      </div>
    </AuthLayout>
  );
}
