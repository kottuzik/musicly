"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./Dialog.module.css";

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
};

export function Dialog({ open, onOpenChange, title, description, children }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={styles.overlay} />
        <RadixDialog.Content
          className={styles.content}
          dir="rtl"
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
