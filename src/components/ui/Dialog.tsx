"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import styles from "./Dialog.module.css";

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
};

export function Dialog({ open, onOpenChange, title, description, children }: DialogProps) {
  // Dialogs are controlled and render no Radix Trigger, so Radix has nothing to return focus to
  // on close and focus falls to <body>. Remember the element that had focus when the dialog
  // opened and restore it on close (WCAG 2.4.3). A layout effect runs before Radix moves focus
  // into the dialog, so activeElement is still the opener here.
  const returnFocusRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
      returnFocusRef.current = document.activeElement;
    }
  }, [open]);

  function handleCloseAutoFocus(event: Event) {
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    // If the opener is gone (e.g. its row was deleted), keep Radix's default behaviour.
    if (target?.isConnected) {
      event.preventDefault();
      target.focus();
    }
  }

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={styles.overlay} />
        <RadixDialog.Content
          className={styles.content}
          dir="rtl"
          onCloseAutoFocus={handleCloseAutoFocus}
          {...(description ? {} : { "aria-describedby": undefined })}
        >
          <div className={styles.header}>
            <RadixDialog.Title className="text-h3">{title}</RadixDialog.Title>
            <RadixDialog.Close className={styles.close} aria-label="סגירה">
              <X size={20} strokeWidth={1.75} aria-hidden="true" />
            </RadixDialog.Close>
          </div>
          {description && (
            <RadixDialog.Description className={`text-body-lg text-secondary ${styles.description}`}>
              {description}
            </RadixDialog.Description>
          )}
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export function DialogActions({ children }: { children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>;
}
