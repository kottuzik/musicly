import Image from "next/image";
import heroImage from "@assets/hero-image.png";
import { PageBackground } from "@/components/PageBackground";
import styles from "./AuthLayout.module.css";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className={styles.page}>
      <PageBackground />
      <div className={styles.shell}>
        <div className={styles.content}>{children}</div>
        <div className={styles.imagePanel}>
          <Image src={heroImage} alt="" fill sizes="480px" priority style={{ objectFit: "cover" }} />
        </div>
      </div>
    </main>
  );
}
