import type { BadgeTone } from "@/components/ui/Badge";
import type { Database } from "@/types/database";

export type RequestKind = Database["public"]["Enums"]["availability_request_kind"];
export type RequestStatus = Database["public"]["Enums"]["request_status"];
export type ClosureSource = Database["public"]["Enums"]["closure_source"];

export const REQUEST_KIND_LABELS: Record<RequestKind, string> = {
  remove_weekly: "הסרה קבועה",
  remove_once: "הסרה חד־פעמית",
  absence: "היעדרות",
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: "ממתינה", tone: "warning" },
  approved: { label: "אושרה", tone: "success" },
  rejected: { label: "נדחתה", tone: "error" },
  cancelled: { label: "בוטלה", tone: "neutral" },
};

export const CLOSURE_SOURCE_LABELS: Record<ClosureSource, string> = {
  holiday: "חג",
  custom: "מיוחד",
};
