"use client";

import { useState } from "react";
import { ChoiceGroup } from "@/components/ui/ChoiceGroup";

// A form is reset after every server action, which would clear plain radios after an error. The
// choice therefore lives in state and travels in a hidden input, so it survives a refused attempt.
function useChoice() {
  const [value, setValue] = useState<string[]>([]);
  return { value, setValue, selected: value[0] ?? "" };
}

// Fields inside the restore dialog: the status the person comes back with and, for a teacher who
// comes back active, what happens to the weekly availability. No option is preselected.
export function RestoreFields({ withAvailability }: { withAvailability: boolean }) {
  const status = useChoice();
  return (
    <>
      <ChoiceGroup
        legend="הסטטוס אחרי השחזור"
        name="statusChoice"
        type="radio"
        value={status.value}
        onChange={status.setValue}
        options={[
          { value: "active", label: "פעיל" },
          { value: "inactive", label: "לא פעיל" },
        ]}
      />
      <input type="hidden" name="status" value={status.selected} />
      {withAvailability && status.selected === "active" && <AvailabilityModeField />}
    </>
  );
}

// The choice every reactivation of a teacher needs (PRD §4.4); nothing is chosen for the user.
export function AvailabilityModeField() {
  const mode = useChoice();
  return (
    <>
      <ChoiceGroup
        legend="מה לעשות עם הזמינות השבועית של המורה"
        name="availabilityModeChoice"
        type="radio"
        value={mode.value}
        onChange={mode.setValue}
        options={[
          { value: "restore", label: "לשחזר את הזמינות הקודמת (רק מה שמתאים לשעות הפעילות הנוכחיות)" },
          { value: "fresh", label: "לבקש מהמורה להגדיר זמינות חדשה" },
        ]}
      />
      <input type="hidden" name="availabilityMode" value={mode.selected} />
    </>
  );
}
