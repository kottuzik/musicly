import { CalendarPlus } from "lucide-react";
import { buttonClassName } from "@/components/ui/Button";

// A plain link (not next/link) so the browser downloads the .ics file and opens it in the device calendar.
export function AddToCalendarLink({ lessonId }: { lessonId: string }) {
  return (
    <a href={`/export/lesson/${lessonId}`} download className={buttonClassName({ variant: "outline", size: "small" })}>
      <CalendarPlus size={16} aria-hidden="true" />
      הוספה ללוח השנה
    </a>
  );
}
