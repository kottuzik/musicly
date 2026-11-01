import { TIME_OPTIONS, WEEKDAY_LABELS, shortTime, timeRange } from "@/lib/time/weekdays";
import { formatDay } from "@/lib/students/age";
import type { RequestKind } from "./labels";

export type Slot = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  valid_from: string;
  valid_to: string | null;
};

export type Hours = { day_of_week: number; open_time: string; close_time: string };

export type SlotState = "active" | "pending_removal" | "ending" | "outside_hours";

// Slots still relevant today or later: ended slots disappear from the weekly view.
export function currentSlots<T extends Slot>(slots: T[], today: string): T[] {
  return slots
    .filter((s) => s.valid_to === null || s.valid_to >= today)
    .sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time));
}

export function withinHours(slot: Pick<Slot, "day_of_week" | "start_time" | "end_time">, hours: Hours[]): boolean {
  const day = hours.find((h) => h.day_of_week === slot.day_of_week);
  return Boolean(day) && day!.open_time <= slot.start_time && day!.close_time >= slot.end_time;
}

// Quarter-hour times from opening to closing (inclusive), for time pickers limited to the school's hours.
export function timesWithin(day: Hours): string[] {
  return TIME_OPTIONS.filter((t) => t >= shortTime(day.open_time) && t <= shortTime(day.close_time));
}

// What a slot's badge says. A pending removal wins: it is what the teacher is waiting for.
export function slotStates(slot: Slot, hours: Hours[], pendingRemoval: boolean): SlotState[] {
  const states: SlotState[] = [];
  if (pendingRemoval) states.push("pending_removal");
  if (slot.valid_to) states.push("ending");
  if (!withinHours(slot, hours)) states.push("outside_hours");
  return states.length ? states : ["active"];
}

export type RequestDetails = {
  kind: RequestKind;
  day_of_week: number | null;
  start_date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
};

// One-line Hebrew description of what a request removes, for lists and dialogs.
export function describeRequest(r: RequestDetails): string {
  const hours = r.start_time && r.end_time ? timeRange(r.start_time, r.end_time) : null;
  const day = r.day_of_week === null ? "" : `יום ${WEEKDAY_LABELS[r.day_of_week]}`;
  if (r.kind === "remove_weekly") return `${day} ${hours} — החל מ־${formatDay(r.start_date)}`;
  if (r.kind === "remove_once") return `${day} ${hours} — בתאריך ${formatDay(r.start_date)} בלבד`;
  const end = r.end_date ?? r.start_date;
  const dates = end === r.start_date ? formatDay(r.start_date) : `${formatDay(r.start_date)} – ${formatDay(end)}`;
  return hours ? `${dates}, ${hours}` : `${dates} (ימים שלמים)`;
}
