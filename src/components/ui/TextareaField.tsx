"use client";

import { useId, useState, type TextareaHTMLAttributes } from "react";
import styles from "./Field.module.css";

type TextareaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
  maxLength: number;
};

// Multi-line field with a live character counter. Works controlled (value + onChange) or uncontrolled.
export function TextareaField({ label, error, id, maxLength, defaultValue, value, onChange, ...props }: TextareaFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const counterId = `${inputId}-counter`;
  const [ownLength, setLength] = useState(String(defaultValue ?? "").length);
  const length = value === undefined ? ownLength : String(value).length;

  return (
    <div className={styles.field}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
      </label>
      <textarea
        id={inputId}
        rows={4}
        maxLength={maxLength}
        value={value}
        defaultValue={value === undefined ? defaultValue : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={[error && errorId, counterId].filter(Boolean).join(" ")}
        onChange={(e) => {
          setLength(e.target.value.length);
          onChange?.(e);
        }}
        {...props}
      />
      <p id={counterId} className={styles.hint}>
        {length.toLocaleString("he-IL")} / {maxLength.toLocaleString("he-IL")} תווים
      </p>
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
