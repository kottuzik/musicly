export type SendResult = { ok: true; id: string | null } | { ok: false; error: string };

export function emailConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
}

// Sends one message through the Resend API. The idempotency key is the outbox row id, so a retry
// after a timeout can never produce a second e-mail. The error text never includes the address.
export async function sendEmail(
  message: { to: string; subject: string; html: string; text: string; idempotencyKey: string },
  env: NodeJS.ProcessEnv = process.env,
): Promise<SendResult> {
  if (!emailConfigured(env)) return { ok: false, error: "not_configured" };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": message.idempotencyKey,
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return { ok: false, error: `resend_${response.status}` };
    const body = (await response.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, id: body?.id ?? null };
  } catch {
    return { ok: false, error: "network" };
  }
}
