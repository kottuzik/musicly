import { addDays, dayOfWeek } from "@/lib/time/weekdays";

// Israeli holidays and rest days, computed from the Hebrew calendar built into Intl (ADR-11).
// They are only suggestions: nothing becomes a closure day until an admin picks it (PRD §4.6).

export type Holiday = {
  key: string; // stable per Hebrew year, e.g. "yom-kippur-5787"
  name: string;
  startDate: string;
  endDate: string;
  isRestDay: boolean; // an official day of rest (יום שבתון)
};

type HebrewDate = { day: number; month: string; year: number };

const hebrewParts = new Intl.DateTimeFormat("en-u-ca-hebrew", {
  timeZone: "UTC",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function toHebrewDate(date: string): HebrewDate {
  const parts = hebrewParts.formatToParts(new Date(`${date}T00:00:00Z`));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return { day: Number(get("day")), month: get("month"), year: Number(get("year")) };
}

const hebrewLabel = new Intl.DateTimeFormat("he-IL-u-ca-hebrew", { timeZone: "UTC", day: "numeric", month: "long" });

// e.g. "י׳ בתשרי"
export function formatHebrewDate(date: string): string {
  return hebrewLabel.format(new Date(`${date}T00:00:00Z`));
}

type Rule = { slug: string; name: string; month: string; day: number; length?: number; isRestDay?: boolean };

// Fixed-date holidays (Hebrew month and day). Purim and the moving days are handled below.
const RULES: Rule[] = [
  { slug: "erev-rosh-hashana", name: "ערב ראש השנה", month: "Elul", day: 29 },
  { slug: "rosh-hashana", name: "ראש השנה", month: "Tishri", day: 1, length: 2, isRestDay: true },
  { slug: "erev-yom-kippur", name: "ערב יום כיפור", month: "Tishri", day: 9 },
  { slug: "yom-kippur", name: "יום כיפור", month: "Tishri", day: 10, isRestDay: true },
  { slug: "erev-sukkot", name: "ערב סוכות", month: "Tishri", day: 14 },
  { slug: "sukkot", name: "סוכות", month: "Tishri", day: 15, isRestDay: true },
  { slug: "chol-hamoed-sukkot", name: "חול המועד סוכות", month: "Tishri", day: 16, length: 6 },
  { slug: "simchat-torah", name: "שמחת תורה", month: "Tishri", day: 22, isRestDay: true },
  { slug: "hanukkah", name: "חנוכה", month: "Kislev", day: 25, length: 8 },
  { slug: "erev-pesach", name: "ערב פסח", month: "Nisan", day: 14 },
  { slug: "pesach", name: "פסח", month: "Nisan", day: 15, isRestDay: true },
  { slug: "chol-hamoed-pesach", name: "חול המועד פסח", month: "Nisan", day: 16, length: 5 },
  { slug: "shvii-shel-pesach", name: "שביעי של פסח", month: "Nisan", day: 21, isRestDay: true },
  { slug: "lag-baomer", name: "ל״ג בעומר", month: "Iyar", day: 18 },
  { slug: "erev-shavuot", name: "ערב שבועות", month: "Sivan", day: 5 },
  { slug: "shavuot", name: "שבועות", month: "Sivan", day: 6, isRestDay: true },
];

// All holidays starting between `from` and `to` (inclusive), sorted by date.
export function israeliHolidays(from: string, to: string): Holiday[] {
  // Index every date around the range by its Hebrew date ("Tishri 10 5787" → date).
  const byHebrew = new Map<string, string>();
  for (let d = addDays(from, -10); d <= addDays(to, 10); d = addDays(d, 1)) {
    const h = toHebrewDate(d);
    byHebrew.set(`${h.month} ${h.day} ${h.year}`, d);
  }
  const find = (month: string, day: number, year: number) => byHebrew.get(`${month} ${day} ${year}`);
  const years = new Set([toHebrewDate(addDays(from, -10)).year, toHebrewDate(addDays(to, 10)).year]);

  const result: Holiday[] = [];
  const push = (slug: string, name: string, start: string | undefined, length = 1, isRestDay = false, year = 0) => {
    if (!start) return;
    result.push({ key: `${slug}-${year}`, name, startDate: start, endDate: addDays(start, length - 1), isRestDay });
  };

  for (const year of years) {
    for (const rule of RULES) {
      push(rule.slug, rule.name, find(rule.month, rule.day, year), rule.length, rule.isRestDay, year);
    }

    // Purim is in Adar II in a leap year.
    push("purim", "פורים", find("Adar II", 14, year) ?? find("Adar", 14, year), 1, false, year);

    // Independence Day (5 Iyar) moves away from Shabbat and its eve, and from Monday;
    // Memorial Day is the day before it.
    const iyar5 = find("Iyar", 5, year);
    if (iyar5) {
      const shift = { 5: -1, 6: -2, 1: 1 }[dayOfWeek(iyar5)] ?? 0;
      const atzmaut = addDays(iyar5, shift);
      push("yom-hazikaron", "יום הזיכרון", addDays(atzmaut, -1), 1, false, year);
      push("yom-haatzmaut", "יום העצמאות", atzmaut, 1, true, year);
    }

    // Tisha B'Av on Shabbat is postponed to Sunday.
    const av9 = find("Av", 9, year);
    if (av9) push("tisha-bav", "תשעה באב", dayOfWeek(av9) === 6 ? addDays(av9, 1) : av9, 1, false, year);
  }

  return result
    .filter((h) => h.startDate >= from && h.startDate <= to)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate));
}

export function findHoliday(key: string, from: string, to: string): Holiday | undefined {
  return israeliHolidays(from, to).find((h) => h.key === key);
}
