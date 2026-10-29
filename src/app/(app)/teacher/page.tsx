import type { Metadata } from "next";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { requireRole } from "@/lib/auth/session";
import { TEACHER_ROLES } from "@/lib/auth/roles";
import { NoticeAlert } from "../NoticeAlert";
import styles from "../Home.module.css";

export const metadata: Metadata = { title: "הלוח שלי" };

export default async function TeacherHomePage({ searchParams }: PageProps<"/teacher">) {
  const profile = await requireRole(TEACHER_ROLES);
  const { notice } = await searchParams;
  const inactive = profile.status === "inactive";

  return (
    <div className={styles.page}>
      <NoticeAlert notice={notice} />
      <div className={styles.heading}>
        <h1>הלוח שלי</h1>
        <p className="text-body-lg text-secondary">שלום, {profile.full_name}</p>
      </div>
      {inactive && (
        <Alert tone="warning">החשבון שלך אינו פעיל. ניתן לצפות בהיסטוריית השיעורים בלבד.</Alert>
      )}
      <Card className={styles.welcome}>
        <h2 className="text-h3">{inactive ? "היסטוריית השיעורים שלך" : "ברוכים הבאים"}</h2>
        <p className="text-body-lg text-secondary">
          {inactive
            ? "היסטוריית השיעורים שלך תוצג כאן."
            : "כאן יוצגו השיעורים הקרובים, התלמידים שלך והבקשות שלך — כשיתווספו למערכת."}
        </p>
      </Card>
    </div>
  );
}
