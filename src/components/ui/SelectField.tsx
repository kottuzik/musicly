"use client";

import * as Select from "@radix-ui/react-select";
import { Check } from "lucide-react";
import { useId, useState } from "react";
import fieldStyles from "./Field.module.css";
import styles from "./SelectField.module.css";

export type SelectOption = { value: string; label: string };

type SelectFieldProps = {
  label: string;
  name: string;
  options: SelectOption[];
  defaultValue?: string;
  placeholder?: string;
  error?: string;
  hideLabel?: boolean;
  onValueChange?: (value: string) => void;
};

// Radix Select reserves "" for "no value", so options with an empty value use this stand-in.
const EMPTY = "__empty__";

// Dropdown whose list opens as a card below the field. The chosen value is submitted
// through a hidden input, so it works in both server-action and GET forms.
export function SelectField({ label, name, options, defaultValue = "", placeholder, error, hideLabel, onValueChange }: SelectFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const [value, setValue] = useState(defaultValue);

  return (
    <div className={fieldStyles.field}>
      <label htmlFor={id} className={hideLabel ? "visually-hidden" : fieldStyles.label}>
        {label}
      </label>
      <input type="hidden" name={name} value={value} />
      <Select.Root
        dir="rtl"
        value={value === "" && !options.some((o) => o.value === "") ? "" : value || EMPTY}
        onValueChange={(v) => {
          const next = v === EMPTY ? "" : v;
          setValue(next);
          onValueChange?.(next);
        }}
      >
        <Select.Trigger
          id={id}
          className={styles.trigger}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        >
          <Select.Value placeholder={placeholder} />
          <Select.Icon className={styles.icon}>
            <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
              <path d="M0 0h10L5 6z" fill="currentColor" />
            </svg>
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className={styles.content} position="popper" side="bottom" sideOffset={12} dir="rtl">
            <Select.Viewport className={styles.viewport}>
              {options.map((option) => (
                <Select.Item key={option.value || EMPTY} value={option.value || EMPTY} className={styles.item}>
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator className={styles.indicator}>
                    <Check size={16} aria-hidden="true" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
      {error && (
        <p id={errorId} className={fieldStyles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
