"use client";

import { CalendarPlus } from "lucide-react";
import { createContext, useContext, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import type { BookingOptions } from "@/lib/lessons/queries";
import { BookLessonForm } from "./BookLessonDialog";

const OpenBooking = createContext<
  ((student: { id: string; name: string }) => void) | null
>(null);

// One shared "new lesson" dialog for a whole student list, so the booking data is sent to the page once
// and not once per row.
export function StudentBookingProvider({
  options,
  children,
}: {
  options: BookingOptions;
  children: ReactNode;
}) {
  const [student, setStudent] = useState<{ id: string; name: string } | null>(
    null,
  );
  // Remount the form on every opening so no earlier input is kept.
  const [formKey, setFormKey] = useState(0);
  return (
    <OpenBooking.Provider
      value={(s) => {
        setFormKey((k) => k + 1);
        setStudent(s);
      }}
    >
      {children}
      <Dialog
        open={student !== null}
        onOpenChange={(open) => !open && setStudent(null)}
        title="שיעור חדש"
      >
        {student && (
          <BookLessonForm
            key={formKey}
            options={options}
            fixedStudentId={student.id}
            onClose={() => setStudent(null)}
          />
        )}
      </Dialog>
    </OpenBooking.Provider>
  );
}

export function BookForStudentButton({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const open = useContext(OpenBooking);
  if (!open) return null;
  return (
    <Button
      variant="secondary"
      size="small"
      onClick={() => open({ id, name })}
      aria-label={`קביעת שיעור עבור ${name}`}
    >
      <CalendarPlus size={16} aria-hidden="true" />
      קביעת שיעור
    </Button>
  );
}
