import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import styles from "./Field.module.css";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
  // Rendered inside the input's end edge (e.g. the show-password button).
  endAdornment?: ReactNode;
};

export function Field({ label, error, hint, id, endAdornment, ...inputProps }: FieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const describedBy = [error && errorId, hint && hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={styles.field}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
      </label>
      {endAdornment ? (
        <div className={styles.withAdornment}>
          <input id={inputId} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...inputProps} />
          {endAdornment}
        </div>
      ) : (
        <input id={inputId} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...inputProps} />
      )}
      {hint && !error && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
