import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "outline" | "danger" | "ghost";

type CommonProps = {
  variant?: ButtonVariant;
  size?: "default" | "small";
  fullWidth?: boolean;
  loading?: boolean;
  children: ReactNode;
};

export function buttonClassName({
  variant = "primary",
  size = "default",
  fullWidth = false,
}: Pick<CommonProps, "variant" | "size" | "fullWidth">) {
  return [styles.button, styles[variant], size === "small" && styles.small, fullWidth && styles.full]
    .filter(Boolean)
    .join(" ");
}

export function Button({
  variant,
  size,
  fullWidth,
  loading = false,
  children,
  disabled,
  type = "button",
  className,
  ...rest
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[buttonClassName({ variant, size, fullWidth }), className].filter(Boolean).join(" ")}
      {...rest}
    >
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant,
  size,
  fullWidth,
  children,
}: Omit<CommonProps, "loading"> & { href: string }) {
  return (
    <Link href={href} className={buttonClassName({ variant, size, fullWidth })}>
      {children}
    </Link>
  );
}
