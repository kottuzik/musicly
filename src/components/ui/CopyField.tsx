"use client";

import { Check, Copy } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "./Button";
import styles from "./CopyField.module.css";

export function CopyField({ label, value }: { label: string; value: string }) {
  const id = useId();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard API unavailable: select the text so the user can copy it manually.
      (document.getElementById(id) as HTMLInputElement | null)?.select();
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={styles.wrapper}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <div className={styles.row}>
        <input id={id} value={value} readOnly dir="ltr" onFocus={(e) => e.currentTarget.select()} />
        <Button variant="secondary" onClick={copy}>
          {copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
          {copied ? "הועתק" : "העתק קישור"}
        </Button>
      </div>
      <span className="visually-hidden" role="status">
        {copied ? "הקישור הועתק" : ""}
      </span>
    </div>
  );
}
