import type { Metadata } from "next";
import { Card } from "@/components/ui/Card";
import { requireRole } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { NoticeAlert } from "../NoticeAlert";
import styles from "../Home.module.css";

export const metadata: Metadata = { title: "סקירה כללית" };

export default async function AdminHomePage({ searchParams }: PageProps<"/admin">) {
  const profile = await requireRole(ADMIN_ROLES);
  const { notice } = await searchParams;

  return (
    <div className={styles.page}>
      <NoticeAlert notice={notice} />
      <div className={styles.heading}>
        <h1>סקירה כללית</h1>
        <p className="text-body-lg text-secondary">שלום, {profile.full_name}</p>
      </div>
      <Card className={styles.welcome}>
        <h2 className="text-h3">ברוכים הבאים למערכת ניהול בית הספר</h2>
        <p className="text-body-lg text-secondary">
          כאן יוצגו נתוני בית הספר — תלמידים, מורים, שיעורים ובקשות — כשיתווספו למערכת.
        </p>
      </Card>
    </div>
  );
}
