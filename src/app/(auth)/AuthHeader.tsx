import Image from "next/image";
import logo from "@assets/logo-music.webp";
import styles from "./AuthForm.module.css";

export function AuthHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className={styles.header}>
      <Image src={logo} alt="לוגו בית הספר למוזיקה" className={styles.logo} priority />
      <h1 className="text-h2">{title}</h1>
      {subtitle && <p className="text-body-lg text-secondary">{subtitle}</p>}
    </header>
  );
}
