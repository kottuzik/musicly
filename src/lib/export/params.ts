import { z } from "zod";

// Query parameters of the export route, validated before anything is read.
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const uuid = z.string().uuid();
const optional = <T extends z.ZodType>(schema: T) => schema.optional().or(z.literal("").transform(() => undefined));

export const EXPORT_KINDS = ["students", "teachers", "schedule", "report-teachers", "report-subjects"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export const MAX_EXPORT_DAYS = 366;
export const MAX_EXPORT_ROWS = 20_000;

export const studentsParams = z.object({
  q: optional(z.string().max(100)),
  status: optional(z.enum(["active", "inactive"])),
  subject: optional(uuid),
  level: optional(z.enum(["beginner", "intermediate", "advanced"])),
  teacher: optional(uuid),
});

export const teachersParams = z.object({
  q: optional(z.string().max(100)),
  subject: optional(uuid),
  status: optional(z.enum(["active", "inactive", "unregistered"])),
});

export const scheduleParams = z.object({
  from: date,
  to: date,
  teacher: optional(uuid),
  student: optional(uuid),
  type: optional(uuid),
  cancelled: optional(z.enum(["0", "1"])),
});

export const reportParams = z.object({ from: date, to: date, teacher: optional(uuid) });

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
