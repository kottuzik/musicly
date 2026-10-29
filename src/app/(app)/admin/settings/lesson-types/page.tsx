import type { Metadata } from "next";
import { ColorChip } from "@/components/ui/Badge";
import { ConfirmAction } from "@/components/ui/ConfirmAction";
import { PageHeader } from "@/components/ui/PageHeader";
import stack from "@/components/ui/Stack.module.css";
import table from "@/components/ui/Table.module.css";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { colorLabel } from "@/lib/lesson-types/colors";
import { createClient } from "@/lib/supabase/server";
import { SettingsTabs } from "../SettingsTabs";
import { deleteLessonType } from "./actions";
import { LessonTypeDialog } from "./LessonTypeDialog";

export const metadata: Metadata = { title: "תחומי לימוד" };

export default async function LessonTypesPage() {
  await requireRole(ADMIN_ROLES);
  const supabase = await createClient();
  const { data: lessonTypes } = await supabase
    .from("lesson_types")
    .select("id, name, default_duration_minutes, color, teacher_skills(count)")
    .order("name");

  return (
    <div className={stack.page}>
      <PageHeader title="הגדרות" />
      <SettingsTabs current="lesson-types" />
      <PageHeader
        level={2}
        title="תחומי לימוד"
        subtitle="התחומים שבית הספר מלמד, משך השיעור הרגיל והצבע בלוח השנה."
        actions={<LessonTypeDialog />}
      />
      <div className={table.wrapper}>
        {lessonTypes?.length ? (
          <table className={table.table}>
            <thead>
              <tr>
                <th scope="col">תחום</th>
                <th scope="col">משך ברירת מחדל</th>
                <th scope="col">צבע</th>
                <th scope="col">מורים</th>
                <th scope="col">
                  <span className="visually-hidden">פעולות</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lessonTypes.map((lt) => {
                const teacherCount = lt.teacher_skills[0]?.count ?? 0;
                return (
                  <tr key={lt.id}>
                    <td className={table.primaryCell}>
                      <ColorChip color={lt.color}>{lt.name}</ColorChip>
                    </td>
                    <td data-label="משך ברירת מחדל">{lt.default_duration_minutes} דקות</td>
                    <td data-label="צבע">{colorLabel(lt.color)}</td>
                    <td data-label="מורים">{teacherCount}</td>
                    <td>
                      <div className={table.actions}>
                        <LessonTypeDialog lessonType={lt} />
                        <ConfirmAction
                          action={deleteLessonType}
                          fields={{ id: lt.id }}
                          trigger="מחיקה"
                          triggerVariant="danger"
                          title={`מחיקת התחום „${lt.name}”`}
                          description={
                            teacherCount > 0
                              ? `לתחום משויכים ${teacherCount} מורים, ולכן לא ניתן למחוק אותו עד להסרת השיוך.`
                              : "התחום יימחק מהמערכת. לא ניתן לבטל פעולה זו."
                          }
                          confirmLabel="מחק"
                          confirmVariant="danger"
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className={table.empty}>עדיין לא הוגדרו תחומי לימוד. הוסיפו את התחום הראשון.</p>
        )}
      </div>
    </div>
  );
}
