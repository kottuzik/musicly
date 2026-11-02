"use client";

import { useEffect, useState } from "react";
import { getStudentStatusImpact, type StudentStatusImpact } from "@/app/(app)/admin/students/actions";
import { getTeacherStatusImpact, type TeacherStatusImpact } from "@/app/(app)/admin/teachers/actions";
import { Alert } from "@/components/ui/Alert";

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : `${n} ${many}`;
}

// Warning shown inside the "make inactive" dialog: what deactivating a student will cancel.
export function StudentImpactNotice({ studentId }: { studentId: string }) {
  const [impact, setImpact] = useState<StudentStatusImpact | null>(null);
  useEffect(() => {
    let active = true;
    void getStudentStatusImpact(studentId).then((v) => active && setImpact(v));
    return () => {
      active = false;
    };
  }, [studentId]);
  if (!impact || (!impact.lessons && !impact.series && !impact.requests)) return null;

  const parts = [
    impact.lessons && `יבוטלו ${plural(impact.lessons, "שיעור עתידי אחד", "שיעורים עתידיים")}`,
    impact.series && `יסתיימו ${plural(impact.series, "סדרה שבועית אחת", "סדרות שבועיות")}`,
    impact.requests && `ייסגרו ${plural(impact.requests, "בקשת שיבוץ אחת", "בקשות שיבוץ")}`,
  ].filter(Boolean);
  return <Alert tone="warning">{parts.join(", ")}. בחזרה לפעילות שום דבר מזה לא חוזר אוטומטית — יידרש שיבוץ חדש.</Alert>;
}

// Warning inside the teacher's "make inactive" dialog: upcoming lessons stay and are flagged.
export function TeacherImpactNotice({ teacherId }: { teacherId: string }) {
  const [impact, setImpact] = useState<TeacherStatusImpact | null>(null);
  useEffect(() => {
    let active = true;
    void getTeacherStatusImpact(teacherId).then((v) => active && setImpact(v));
    return () => {
      active = false;
    };
  }, [teacherId]);
  if (!impact || (!impact.lessons && !impact.requests)) return null;

  return (
    <Alert tone="warning">
      {impact.lessons > 0 &&
        `${plural(impact.lessons, "שיעור עתידי אחד נשאר", "שיעורים עתידיים נשארים")} אצל המורה ו${impact.lessons === 1 ? "יסומן" : "יסומנו"} ”דורש טיפול” — החליפו מורה או בטלו אותם בלוח השנה. `}
      {impact.requests > 0 && `${plural(impact.requests, "בקשה פתוחה אחת תיסגר", "בקשות פתוחות ייסגרו")}.`}
    </Alert>
  );
}
