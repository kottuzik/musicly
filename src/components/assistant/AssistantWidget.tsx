"use client";

import { Maximize2, Minimize2, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { AssistantChat } from "./AssistantChat";
import styles from "./AssistantWidget.module.css";

// The AI assistant as a floating widget in the bottom corner of every admin page. It can grow to fill
// the screen. It stays mounted while the admin moves between pages, so the conversation (kept only in
// the browser's memory, never stored) is not lost when closing the panel or navigating.
export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (expanded) setExpanded(false);
      else setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, expanded]);

  function close() {
    setOpen(false);
    setExpanded(false);
  }

  return (
    <>
      {open && (
        <section
          id="assistant-panel"
          role="dialog"
          aria-modal={expanded}
          aria-label="עוזר AI"
          className={`${styles.panel} ${expanded ? styles.expanded : ""}`}
        >
          <header className={styles.header}>
            <span className={styles.title}>
              <Sparkles size={18} aria-hidden="true" /> עוזר AI
            </span>
            <span className={styles.controls}>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => setExpanded((v) => !v)}
                aria-label={expanded ? "הקטנת החלון" : "הרחבה למסך מלא"}
              >
                {expanded ? <Minimize2 size={18} aria-hidden="true" /> : <Maximize2 size={18} aria-hidden="true" />}
              </button>
              <button type="button" className={styles.iconButton} onClick={close} aria-label="סגירת העוזר">
                <X size={18} aria-hidden="true" />
              </button>
            </span>
          </header>
          <p className={`${styles.note} text-small text-secondary`}>העוזר לקריאה בלבד: הוא לא משנה שום דבר במערכת.</p>
          <div className={styles.body}>
            <AssistantChat />
          </div>
        </section>
      )}
      {!(open && expanded) && (
        <button
          type="button"
          className={styles.launcher}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="assistant-panel"
          aria-label={open ? "סגירת עוזר AI" : "פתיחת עוזר AI"}
        >
          {open ? <X size={24} aria-hidden="true" /> : <Sparkles size={24} aria-hidden="true" />}
        </button>
      )}
    </>
  );
}
