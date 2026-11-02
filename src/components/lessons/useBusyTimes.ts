"use client";

import { useEffect, useState } from "react";
import { getBusyTimes, type BusyRange } from "@/lib/lessons/actions";
import { addMinutes } from "@/lib/lessons/time";

type Args = { date: string; teacherId?: string; studentId?: string; excludeLessonId?: string };

// Start-time options for a time picker, with times that would overlap an existing lesson of the
// teacher or the student shown but disabled.
export function useTimeOptions(times: string[], duration: number, args: Args) {
  const [busy, setBusy] = useState<BusyRange[]>([]);
  const { date, teacherId, studentId, excludeLessonId } = args;

  useEffect(() => {
    let active = true;
    if (!date || (!teacherId && !studentId)) {
      // Nothing chosen yet: nothing is busy.
      void Promise.resolve().then(() => active && setBusy([]));
    } else {
      void getBusyTimes({ date, teacherId, studentId, excludeLessonId }).then((list) => active && setBusy(list));
    }
    return () => {
      active = false;
    };
  }, [date, teacherId, studentId, excludeLessonId]);

  return times.map((t) => {
    const end = addMinutes(t, Math.max(duration, 1));
    const clash = busy.find((b) => t < b.end && end > b.start);
    return clash
      ? { value: t, label: `${t} — ${clash.who === "teacher" ? "המורה תפוס" : "התלמיד תפוס"}`, disabled: true }
      : { value: t, label: t };
  });
}
