"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import type { NavItem } from "@/lib/nav/items";
import { Brand } from "./Brand";
import { NavLinks } from "./NavLinks";
import styles from "./AppShell.module.css";

export function MobileNav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={styles.iconButton} aria-label="פתיחת תפריט">
        <Menu size={22} strokeWidth={1.75} aria-hidden="true" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.drawerOverlay} />
        <Dialog.Content className={styles.drawer} dir="rtl" aria-describedby={undefined}>
          <div className={styles.drawerHeader}>
            <Brand />
            <Dialog.Close className={styles.iconButton} aria-label="סגירת תפריט">
              <X size={22} strokeWidth={1.75} aria-hidden="true" />
            </Dialog.Close>
          </div>
          <Dialog.Title className="visually-hidden">תפריט ניווט</Dialog.Title>
          <nav aria-label="ניווט ראשי">
            <NavLinks items={items} onNavigate={() => setOpen(false)} />
          </nav>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
