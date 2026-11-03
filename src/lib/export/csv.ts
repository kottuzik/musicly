// CSV for Excel: UTF-8 with a BOM (so Hebrew opens correctly), CRLF line ends, quoted cells.

export type CsvValue = string | number | null | undefined;

export type CsvColumn<Row> = {
  header: string;
  value: (row: Row) => CsvValue;
  // A phone number: kept as text so Excel does not drop a leading zero.
  phone?: boolean;
};

const PHONE = /^\+?[\d\s\-()]{3,20}$/;

// A cell that starts with one of these is read as a formula by spreadsheet programs.
const FORMULA_START = /^[=+\-@\t\r]/;

function quote(text: string): string {
  return `"${text.replace(/"/g, '""')}"`;
}

export function csvCell(value: CsvValue, phone = false): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") return String(value);
  const text = String(value);
  // Digits-only content is safe to write as a text formula; anything else falls through to the guard.
  if (phone && PHONE.test(text)) return quote(`="${text}"`);
  return quote(FORMULA_START.test(text) ? `'${text}` : text);
}

export function toCsv<Row>(columns: CsvColumn<Row>[], rows: Row[]): string {
  const lines = [columns.map((c) => quote(c.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => csvCell(c.value(row), c.phone)).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

// File names for the Content-Disposition header (percent-encoded UTF-8 for Hebrew).
export function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
