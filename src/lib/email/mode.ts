// Who may actually receive e-mail. Closed by default: unless the app is the Vercel Production
// deployment AND EMAIL_MODE is "live", only the addresses in EMAIL_TEST_RECIPIENTS get mail, so a
// Development or Preview run can never write to a real user.

export type EmailMode = "test" | "live";

export function emailMode(env: NodeJS.ProcessEnv = process.env): EmailMode {
  return env.EMAIL_MODE === "live" && env.VERCEL_ENV === "production" ? "live" : "test";
}

export function testRecipients(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.EMAIL_TEST_RECIPIENTS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function mayEmail(to: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (emailMode(env) === "live") return true;
  return testRecipients(env).includes(to.trim().toLowerCase());
}
