"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TeachingForm, type TeachingLessonType } from "./TeachingForm";

// The super admin turns teaching on for another admin.
export function TeachingDialog({
  profileId,
  name,
  lessonTypes,
}: {
  profileId: string;
  name: string;
  lessonTypes: TeachingLessonType[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="small" onClick={() => setOpen(true)}>
        הפעלת הוראה
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title={`הפעלת הוראה: ${name}`}>
        <p className="text-secondary">המנהל יוכל לקבל שיעורים כמו כל מורה, בלי לאבד את הרשאות הניהול.</p>
        <TeachingForm profileId={profileId} lessonTypes={lessonTypes} selected={[]} submitLabel="הפעלת הוראה" onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}
