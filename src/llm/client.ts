import type { ChatRequest, ChatStreamCallbacks } from "./types";
import { mockChatStream } from "./mock";

/**
 * 流式聊天客户端:
 * - mock provider 走本地定时器模拟流式
 * - 其余 provider 统一 POST 到本地 Vite 代理 /api/llm/chat
 *   (代理按 settings 转发到 DeepSeek/OpenAI 兼容/Ollama,API Key 不出本机)
 */
export async function streamChat(req: ChatRequest, cb: ChatStreamCallbacks): Promise<void> {
  if (req.settings.provider === "mock") {
    await mockChatStream(req, cb.onDelta);
    return;
  }

  const resp = await fetch("/api/llm/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      settings: req.settings,
      messages: req.messages,
      jsonObject: req.jsonObject ?? false,
    }),
  });

  if (!resp.ok || !resp.body) {
    let detail = "";
    try {
      detail = (await resp.json()).error ?? "";
    } catch {
      detail = await resp.text();
    }
    throw new Error(detail || `HTTP ${resp.status}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // 按 SSE 行边界处理:一行一个 data: {...}
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const json = JSON.parse(payload) as {
          choices?: { delta?: { content?: string } }[];
          error?: { message?: string };
        };
        if (json.error) throw new Error(json.error.message ?? "上游错误");
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) cb.onDelta(delta);
      } catch (e) {
        if (e instanceof SyntaxError) continue; // 忽略非 JSON 行(如注释)
        throw e;
      }
    }
  }
}
