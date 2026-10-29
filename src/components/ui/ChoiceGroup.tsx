import type { CSSProperties } from "react";
import styles from "./ChoiceGroup.module.css";

type Option = { value: string; label: string; color?: string };

type ChoiceGroupProps = {
  legend: string;
  name: string;
  options: Option[];
  type: "checkbox" | "radio";
  defaultValue?: string[];
  error?: string;
  variant?: "list" | "swatches";
};

// Accessible checkbox/radio group in a fieldset. "swatches" shows color circles with visible names.
export function ChoiceGroup({ legend, name, options, type, defaultValue = [], error, variant = "list" }: ChoiceGroupProps) {
  const errorId = `${name}-error`;
  return (
    <fieldset
      className={styles.fieldset}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
    >
      <legend className={styles.legend}>{legend}</legend>
      <div className={variant === "swatches" ? styles.swatches : styles.options}>
        {options.map((option) => (
          <label
            key={option.value}
            className={variant === "swatches" ? styles.swatch : styles.option}
            style={option.color ? ({ "--swatch-color": option.color } as CSSProperties) : undefined}
          >
            <input type={type} name={name} value={option.value} defaultChecked={defaultValue.includes(option.value)} />
            {variant === "swatches" && <span className={styles.circle} aria-hidden="true" />}
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </fieldset>
  );
}
