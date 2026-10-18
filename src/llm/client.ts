import type { ChatRequest, ChatStreamCallbacks } from "./types";
import { mockChatStream } from "./mock";

const REQUEST_TIMEOUT_MS = 120_000; // LLM 请求总超时(含流式期间)

/**
 * 流式聊天客户端:
 * - mock provider 走本地定时器模拟流式
 * - 其余 provider 统一 POST 到本地 Vite 代理 /api/llm/chat
 * - 支持外部取消(AbortSignal)与 120s 总超时
 */
export async function streamChat(req: ChatRequest, cb: ChatStreamCallbacks): Promise<void> {
  if (req.settings.provider === "mock") {
    await mockChatStream(req, cb.onDelta);
    return;
  }

  // 组合外部 signal 与内部超时
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error("请求超时(120 秒),请检查网络或稍后重试")),
    REQUEST_TIMEOUT_MS
  );
  const onExternalAbort = () => controller.abort(new Error("已取消"));
  cb.signal?.addEventListener("abort", onExternalAbort);

  try {
    const resp = await fetch("/api/llm/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        settings: req.settings,
        messages: req.messages,
        jsonObject: req.jsonObject ?? false,
      }),
      signal: controller.signal,
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
      if (controller.signal.aborted) throw controller.signal.reason ?? new Error("已取消");
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
          if (e instanceof SyntaxError) continue; // 忽略非 JSON 行
          throw e;
        }
      }
    }
  } finally {
    clearTimeout(timer);
    cb.signal?.removeEventListener("abort", onExternalAbort);
  }
}
