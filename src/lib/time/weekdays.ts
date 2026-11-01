// Weekdays use JavaScript/Postgres numbering: 0 = Sunday … 6 = Saturday.
// Times are local school wall-clock times ("HH:MM"), dates are "YYYY-MM-DD" (Asia/Jerusalem).

export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export const WEEKDAY_LABELS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"] as const;

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Postgres returns "HH:MM:SS"; the UI shows and submits "HH:MM".
export function shortTime(time: string): string {
  return time.slice(0, 5);
}

export function isQuarterHour(time: string): boolean {
  const match = TIME.exec(time);
  return Boolean(match) && Number(match![2]) % 15 === 0;
}

// Options for time pickers: every 15 minutes between 06:00 and 23:45.
export const TIME_OPTIONS: string[] = Array.from({ length: (24 - 6) * 4 }, (_, i) => {
  const minutes = 6 * 60 + i * 15;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

// Weekday of a calendar date (the date itself carries no time zone).
export function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function timeRange(start: string, end: string): string {
  return `${shortTime(start)}–${shortTime(end)}`;
}
