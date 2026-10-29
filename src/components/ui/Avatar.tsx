import styles from "./Avatar.module.css";

// Initial-letter avatar; no personal photos are attached to real people.
export function Avatar({ name, size = "default" }: { name: string; size?: "default" | "large" }) {
  return (
    <span className={`${styles.avatar} ${size === "large" ? styles.large : ""}`} aria-hidden="true">
      {name.trim().charAt(0)}
    </span>
  );
}
