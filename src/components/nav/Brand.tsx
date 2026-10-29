import Image from "next/image";
import logo from "@assets/logo-music.webp";
import styles from "./AppShell.module.css";

export function Brand() {
  return (
    <div className={styles.brand}>
      <Image src={logo} alt="" className={styles.brandLogo} />
      <span>בית הספר למוזיקה</span>
    </div>
  );
}
