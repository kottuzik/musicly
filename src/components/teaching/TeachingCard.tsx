import Link from "next/link";
import { TeacherImpactNotice } from "@/components/impact/ImpactNotices";
import { Card } from "@/components/ui/Card";
import { ConfirmAction } from "@/components/ui/ConfirmAction";
import stack from "@/components/ui/Stack.module.css";
import { stopTeaching } from "@/lib/teaching/actions";
import { TeachingForm, type TeachingLessonType } from "./TeachingForm";

// On an admin's profile: "I also teach", the subjects, and stopping.
export function TeachingCard({
  profileId,
  teaching,
  teacherId,
  lessonTypes,
  selected,
}: {
  profileId: string;
  teaching: boolean;
  teacherId: string | null;
  lessonTypes: TeachingLessonType[];
  selected: string[];
}) {
  return (
    <Card>
      <h2 className={`text-h3 ${stack.sectionTitle}`}>אני גם מלמד/ת</h2>
      {teaching ? (
        <p className="text-secondary">
          ההוראה פעילה. את השיעורים והזמינות שלך אפשר לראות ב<Link href="/admin/my-teaching">מסך „ההוראה שלי”</Link>.
        </p>
      ) : (
        <p className="text-secondary">
          הפעלת הוראה מאפשרת לשבץ לך שיעורים כמו לכל מורה, מאותו חשבון ובלי לאבד הרשאות ניהול.
        </p>
      )}
      <TeachingForm
        profileId={profileId}
        lessonTypes={lessonTypes}
        selected={selected}
        submitLabel={teaching ? "שמירה" : "הפעלת הוראה"}
      />
      {teaching && teacherId && (
        <div className={stack.inlineActions}>
          <ConfirmAction
            action={stopTeaching}
            fields={{ id: profileId }}
            trigger="הפסקת הוראה"
            triggerVariant="ghost"
            title="הפסקת ההוראה"
            description="לא ניתן יהיה לשבץ לך שיעורים חדשים. חשבון הניהול שלך לא ישתנה."
            confirmLabel="הפסק הוראה"
            confirmVariant="danger"
          >
            <TeacherImpactNotice teacherId={teacherId} />
          </ConfirmAction>
        </div>
      )}
    </Card>
  );
}
