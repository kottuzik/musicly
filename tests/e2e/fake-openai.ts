import { createServer, type Server } from "node:http";

// A stand-in for OpenAI used by the e2e suite (the app is started with OPENAI_BASE_URL pointing here),
// so tests never reach the real service or cost anything.
export const FAKE_OPENAI_PORT = 4010;

type Message = { role: string; content?: string | null };

export function startFakeOpenAi(): Promise<Server> {
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const body = JSON.parse(raw || "{}") as { messages?: Message[] };
      const messages = body.messages ?? [];
      const question = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
      const send = (status: number, payload: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(payload));
      };
      const usage = { prompt_tokens: 11, completion_tokens: 5 };

      if (question.includes("שגיאה")) return send(500, { error: { message: "boom" } });
      if (question.includes("ריקה")) return send(200, { choices: [{ message: { content: "" } }], usage });
      if (!messages.some((m) => m.role === "tool")) {
        return send(200, {
          choices: [
            {
              message: {
                content: null,
                tool_calls: [{ id: "call_1", type: "function", function: { name: "find_people", arguments: JSON.stringify({ kind: "teacher", query: "" }) } }],
              },
            },
          ],
          usage,
        });
      }
      return send(200, { choices: [{ message: { content: "תשובת בדיקה מהעוזר" } }], usage });
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(FAKE_OPENAI_PORT, "127.0.0.1", () => resolve(server));
  });
}
