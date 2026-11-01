"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState, type ComponentProps } from "react";
import { Field } from "./Field";
import styles from "./Field.module.css";

// Password input with a button that shows or hides what was typed (keyboard and screen-reader friendly).
export function PasswordField({ id, ...props }: Omit<ComponentProps<typeof Field>, "type" | "endAdornment">) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  return (
    <Field
      {...props}
      id={inputId}
      type={visible ? "text" : "password"}
      autoCapitalize="off"
      spellCheck={false}
      endAdornment={
        <button
          type="button"
          className={styles.adornmentButton}
          aria-label="הצגת הסיסמה"
          aria-pressed={visible}
          aria-controls={inputId}
          onClick={() => setVisible((v) => !v)}
        >
          <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
      }
    />
  );
}
