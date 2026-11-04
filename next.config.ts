import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const isDev = process.env.NODE_ENV !== "production";

// Where the browser may connect: this site, and Supabase (API and live updates).
function supabaseSources(): string[] {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return [url.origin, `wss://${url.host}`];
  } catch {
    return [];
  }
}

// Next.js needs inline scripts and styles, so those stay allowed; everything else is locked down.
// The browser never talks to the AI service (the server does), so it is not listed.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseSources().join(" ")}${isDev ? " ws://localhost:* http://localhost:*" : ""}`.trim(),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  turbopack: { root: fileURLToPath(new URL(".", import.meta.url)) },
  // E2E tests build into their own folder so they never overwrite a running dev server's files.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The app is private: ask search engines not to index any route.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, ...securityHeaders],
      },
    ];
  },
};

export default nextConfig;
