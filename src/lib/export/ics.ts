// A one-event iCalendar (.ics) file for a single lesson. Pure functions, no I/O.
// Times are written in UTC, so every device shows them in its own local time.

import type { LessonDetails } from "@/lib/lessons/queries";
import { LOCATION_LABELS } from "@/lib/lessons/labels";

const MAX_LINE_BYTES = 75;
const encoder = new TextEncoder();

// Control characters (including line breaks) could add fields to the file, so they become spaces.
function clean(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").trim();
}

// TEXT values: backslash, semicolon and comma are escaped.
export function escapeText(text: string): string {
  return clean(text).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

// "2026-11-07T14:30:00.000Z" -> "20261107T143000Z"
export function icsUtc(instant: Date | string): string {
  return new Date(instant).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// Lines longer than 75 bytes are folded: CRLF plus one space. Never splits a multi-byte character.
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= MAX_LINE_BYTES) return line;
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  // The first line may use 75 bytes; later lines lose one byte to the leading space.
  let limit = MAX_LINE_BYTES;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
      limit = MAX_LINE_BYTES - 1;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

type IcsLesson = Pick<
  LessonDetails,
  "id" | "version" | "start_at" | "end_at" | "student_name" | "teacher_name" | "lesson_type_name" | "location"
>;

export function lessonToIcs(lesson: IcsLesson, now: Date = new Date()): string {
  const place = LOCATION_LABELS[lesson.location];
  const description = [
    `תחום: ${lesson.lesson_type_name}`,
    `תלמיד: ${lesson.student_name}`,
    `מורה: ${lesson.teacher_name}`,
    `מיקום: ${place}`,
  ].join("\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Musicly//Lesson//HE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:lesson-${lesson.id}@musicly`,
    // A newer version of the same lesson updates the event on devices that already have it.
    `SEQUENCE:${lesson.version}`,
    `DTSTAMP:${icsUtc(now)}`,
    `DTSTART:${icsUtc(lesson.start_at)}`,
    `DTEND:${icsUtc(lesson.end_at)}`,
    `SUMMARY:${escapeText(`${lesson.lesson_type_name} — ${lesson.student_name}`)}`,
    // Line breaks inside DESCRIPTION are the literal two characters \n.
    `DESCRIPTION:${description
      .split("\n")
      .map(escapeText)
      .join("\\n")}`,
    `LOCATION:${escapeText(place)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
