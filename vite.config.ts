import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * 本地流式代理:/api/llm/chat
 * 浏览器 → 本代理 → provider(DeepSeek / OpenAI 兼容 / Ollama)
 * 原因:浏览器直连 provider 会被 CORS 拦截;API Key 只存浏览器 localStorage,经本机代理转发。
 */
function llmProxy(): Plugin {
  return {
    name: "layerview-llm-proxy",
    configureServer(server) {
      server.middlewares.use("/api/llm/chat", async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("method not allowed");
          return;
        }
        const body = await readBody(req);
        let parsed: any;
        try {
          parsed = JSON.parse(body);
        } catch {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "请求体不是合法 JSON" }));
          return;
        }

        const settings = parsed?.settings;
        const messages = parsed?.messages;
        if (!settings || !Array.isArray(messages)) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "请求体缺少 settings/messages" }));
          return;
        }
        let targetUrl: string;
        let authHeaders: Record<string, string> = {};

        switch (settings.provider) {
          case "deepseek":
            targetUrl = settings.baseUrl.replace(/\/+$/, "") + "/chat/completions";
            authHeaders = { Authorization: "Bearer " + settings.apiKey };
            break;
          case "openai":
            targetUrl = settings.baseUrl.replace(/\/+$/, "") + "/chat/completions";
            authHeaders = { Authorization: "Bearer " + settings.apiKey };
            break;
          case "ollama":
            targetUrl = settings.ollamaUrl.replace(/\/+$/, "") + "/api/chat";
            break;
          default:
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "未知 provider" }));
            return;
        }

        if (settings.provider !== "ollama" && !settings.apiKey) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "未配置 API Key(请在右上角「模型」设置中填写)" }));
          return;
        }

        const upstream = await fetch(targetUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders,
          },
          body: JSON.stringify(
            settings.provider === "ollama"
              ? { model: settings.model, messages, stream: true }
              : { model: settings.model, messages, stream: true, temperature: 0.3 }
          ),
        });

        if (!upstream.ok || !upstream.body) {
          const errText = await upstream.text().catch(() => "");
          res.statusCode = 502;
          res.end(JSON.stringify({ error: "上游 " + upstream.status + ": " + errText.slice(0, 300) }));
          return;
        }

        // 透传 SSE 流
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        const reader = (upstream.body as any).getReader();
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(Buffer.from(value));
          }
        } finally {
          res.end();
        }
      });
    },
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => {
      data += chunk.toString("utf8");
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export default defineConfig({
  plugins: [react(), llmProxy()],
  server: { port: 5173, strictPort: true, host: "127.0.0.1" },
});
