"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmAction } from "@/components/ui/ConfirmAction";
import { TextareaField } from "@/components/ui/TextareaField";
import { decideLessonChangeRequest, getLessonDetails } from "@/lib/lessons/actions";
import type { BookingOptions, LessonChangeRequest, LessonDetails } from "@/lib/lessons/queries";
import { EditLessonDialog } from "./EditLessonDialog";

// An admin's answer to a teacher's request. Cancelling is approved here; a change is approved by
// choosing the new time in the lesson-change dialog, which then closes the request.
export function ChangeRequestActions({ request, options }: { request: LessonChangeRequest; options: BookingOptions }) {
  const [lesson, setLesson] = useState<LessonDetails | null>(null);
  const [open, setOpen] = useState(false);
  const fields = { id: request.id, version: String(request.version) };
  const summary = `${request.teacher_name}: ${request.student_name} — ${request.lesson_type_name}`;
  const note = <TextareaField label="הערה למורה (לא חובה)" name="note" maxLength={500} rows={2} />;

  async function chooseTime() {
    const details = await getLessonDetails(request.lesson_id);
    if (!details) return;
    setLesson(details);
    setOpen(true);
  }

  return (
    <>
      {request.kind === "cancel" ? (
        <ConfirmAction
          action={decideLessonChangeRequest}
          fields={{ ...fields, decision: "approve" }}
          trigger="אישור הביטול"
          triggerVariant="primary"
          title="אישור ביטול השיעור"
          description={`${summary}. השיעור יבוטל ויישמר ברשימת השיעורים המבוטלים.`}
          confirmLabel="אשר ביטול"
        >
          {note}
        </ConfirmAction>
      ) : (
        <Button size="small" onClick={() => void chooseTime()}>
          קביעת מועד חדש
        </Button>
      )}
      <ConfirmAction
        action={decideLessonChangeRequest}
        fields={{ ...fields, decision: "reject" }}
        trigger="דחייה"
        triggerVariant="danger"
        title="דחיית הבקשה"
        description={`${summary}. השיעור יישאר כפי שהוא.`}
        confirmLabel="דחה בקשה"
        confirmVariant="danger"
      >
        {note}
      </ConfirmAction>
      {lesson && (
        <EditLessonDialog
          lesson={lesson}
          options={options}
          open={open}
          onOpenChange={setOpen}
          onDone={() => undefined}
          changeRequestId={request.id}
          proposed={
            request.proposed_date && request.proposed_start_time
              ? { date: request.proposed_date, start: request.proposed_start_time.slice(0, 5) }
              : undefined
          }
        />
      )}
    </>
  );
}
