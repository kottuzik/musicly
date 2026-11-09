"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import table from "@/components/ui/Table.module.css";
import styles from "./StudentRow.module.css";

// A table row that opens to show more details underneath (accordion). The name cell and the other
// cells come from the server page; only the open/closed state lives here.
export function StudentRow({
  name,
  label,
  cells,
  details,
  columns,
}: {
  name: ReactNode;
  label: string;
  cells: ReactNode;
  details: ReactNode;
  columns: number;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <>
      <tr className={open ? styles.open : undefined}>
        <td>
          <div className={table.primaryCell}>
            <button
              type="button"
              className={styles.toggle}
              aria-expanded={open}
              aria-controls={panelId}
              aria-label={`${open ? "סגירת" : "הצגת"} פרטי ${label}`}
              onClick={() => setOpen((o) => !o)}
            >
              <ChevronDown size={18} aria-hidden="true" className={styles.chevron} />
            </button>
            {name}
          </div>
        </td>
        {cells}
      </tr>
      <tr id={panelId} hidden={!open} className={styles.panelRow}>
        <td colSpan={columns} className={styles.panelCell}>
          {open && details}
        </td>
      </tr>
    </>
  );
}
