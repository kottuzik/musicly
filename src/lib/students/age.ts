// Dates are plain "YYYY-MM-DD" strings (Postgres `date`), compared in the school's time zone.

export const ADULT_AGE = 18;

// Today's date at the school (Asia/Jerusalem), as YYYY-MM-DD.
export function schoolToday(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
}

// Full years between the birth date and `today`. Someone born on 29 Feb has their birthday on 1 Mar in other years.
export function ageOn(birthDate: string, today: string = schoolToday()): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return Math.max(age, 0);
}

export function isMinor(birthDate: string, today: string = schoolToday()): boolean {
  return ageOn(birthDate, today) < ADULT_AGE;
}

export function formatDay(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}
