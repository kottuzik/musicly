import styles from "./PageLoader.module.css";

// Shown in the content area while the next page loads; the navigation stays in place.
export function PageLoader() {
  return (
    <div className={styles.loader} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden="true" />
      <span className={styles.text}>טוענים...</span>
    </div>
  );
}
