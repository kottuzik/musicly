import { getImageProps } from "next/image";
import bgDesktop from "@assets/mazlul-bg-desktop@2x.png";
import bgTablet from "@assets/mazlul-bg-tablet@2x.png";
import bgMobile from "@assets/mazlul-bg-mobile@3x.png";
import styles from "./PageBackground.module.css";

// Decorative full-screen background with a different artwork per screen shape (art direction).
// Landscape screens get the wide artwork, so short laptop windows don't show a cropped portrait image.
export function PageBackground() {
  const common = { alt: "", sizes: "100vw", quality: 80, priority: true } as const;
  const { props: { srcSet: desktop } } = getImageProps({ ...common, src: bgDesktop });
  const { props: { srcSet: tablet } } = getImageProps({ ...common, src: bgTablet });
  const { props: { srcSet: mobile, ...rest } } = getImageProps({ ...common, src: bgMobile });

  return (
    <picture className={styles.picture}>
      <source media="(min-width: 768px) and (orientation: landscape)" srcSet={desktop} />
      <source media="(min-width: 768px)" srcSet={tablet} />
      <source srcSet={mobile} />
      {/* eslint-disable-next-line jsx-a11y/alt-text -- alt="" comes from `rest` (decorative image) */}
      <img {...rest} className={styles.background} aria-hidden="true" />
    </picture>
  );
}
