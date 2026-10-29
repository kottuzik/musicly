import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "בית הספר למוזיקה", template: "%s · בית הספר למוזיקה" },
  description: "מערכת ניהול בית הספר למוזיקה",
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  themeColor: "#6b46c1",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: browser extensions add attributes to <html> before React loads.
    <html lang="he" dir="rtl" className={heebo.variable} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
