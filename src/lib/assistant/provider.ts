import "server-only";

// The AI service, behind a small interface so tests can replace it. The only implementation talks to
// OpenAI's Chat Completions API from the server; the key never reaches the browser.

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

export type ProviderMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolDefinition = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type ProviderResult = {
  content: string | null;
  toolCalls: ToolCall[];
  tokensIn: number;
  tokensOut: number;
};

export type Provider = {
  complete(messages: ProviderMessage[], tools: ToolDefinition[], signal: AbortSignal): Promise<ProviderResult>;
};

export type AssistantErrorKey = "ai_unavailable" | "ai_timeout" | "ai_rate_limited" | "ai_bad_response";

export class AssistantError extends Error {
  constructor(
    public key: AssistantErrorKey,
    public minutes?: number,
  ) {
    super(key);
  }
}

type Env = Record<string, string | undefined>;

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

export function assistantConfigured(env: Env = process.env): boolean {
  return Boolean(env.OPENAI_API_KEY?.trim());
}

export function openAiProvider(env: Env = process.env): Provider | null {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  const baseUrl = (env.OPENAI_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, "");
  const model = env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;

  async function request(body: unknown, signal: AbortSignal): Promise<Response> {
    try {
      return await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === "AbortError")) throw new AssistantError("ai_timeout");
      throw new AssistantError("ai_unavailable");
    }
  }

  return {
    async complete(messages, tools, signal) {
      const body = {
        model,
        messages,
        ...(tools.length ? { tools, tool_choice: "auto" } : {}),
        max_completion_tokens: 1500,
      };
      let response = await request(body, signal);
      // One retry for a server-side hiccup; never for a limit or a bad key (that would only cost more).
      if (response.status >= 500) response = await request(body, signal);
      if (response.status === 429) throw new AssistantError("ai_unavailable");
      if (!response.ok) throw new AssistantError("ai_unavailable");

      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new AssistantError("ai_bad_response");
      }
      const choice = (data as { choices?: { message?: { content?: unknown; tool_calls?: unknown } }[] })?.choices?.[0]?.message;
      if (!choice) throw new AssistantError("ai_bad_response");
      const usage = (data as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
      const rawCalls = Array.isArray(choice.tool_calls) ? choice.tool_calls : [];
      const toolCalls = rawCalls.flatMap((c): ToolCall[] => {
        const call = c as { id?: unknown; type?: unknown; function?: { name?: unknown; arguments?: unknown } };
        if (call.type !== "function" || typeof call.id !== "string") return [];
        if (typeof call.function?.name !== "string" || typeof call.function.arguments !== "string") return [];
        return [{ id: call.id, type: "function", function: { name: call.function.name, arguments: call.function.arguments } }];
      });
      return {
        content: typeof choice.content === "string" ? choice.content : null,
        toolCalls,
        tokensIn: usage?.prompt_tokens ?? 0,
        tokensOut: usage?.completion_tokens ?? 0,
      };
    },
  };
}
