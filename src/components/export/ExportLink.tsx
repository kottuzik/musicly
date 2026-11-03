import { Download } from "lucide-react";
import { buttonClassName, type ButtonVariant } from "@/components/ui/Button";

type Props = {
  kind: "students" | "teachers" | "schedule" | "report-teachers" | "report-subjects";
  params?: Record<string, string | undefined | null>;
  label?: string;
  variant?: ButtonVariant;
};

// A plain link (not next/link) so the browser downloads the file instead of navigating to it.
export function ExportLink({ kind, params = {}, label = "ייצוא ל־CSV", variant = "outline" }: Props) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const query = search.toString();
  return (
    <a href={`/export/${kind}${query ? `?${query}` : ""}`} download className={buttonClassName({ variant, size: "small" })}>
      <Download size={16} aria-hidden="true" />
      {label}
    </a>
  );
}
