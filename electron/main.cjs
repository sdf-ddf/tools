// Electron 主进程(CJS):内置静态文件服务 + LLM 流式代理
// 注意:根 package.json "type":"module" 只影响 src/ 前端;Electron main 用 .cjs 强制 CJS
const { app, BrowserWindow, shell, dialog } = require("electron");
const http = require("node:http");
const { readFile, stat } = require("node:fs/promises");
const path = require("node:path");

const PORT = 45173; // 固定端口,仅回环监听

// 单实例锁:防双开导致端口冲突
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// 静态根:打包后 electron/main.cjs 在 resources/app.asar/electron 下,dist 在 ../dist
const STATIC_ROOT = path.join(__dirname, "..", "dist");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c.toString("utf8")));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

/** LLM 流式代理:与 vite.config.ts 的 llmProxy 逻辑一致 */
async function handleLlmChat(req, res, body) {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "请求体不是合法 JSON" }));
    return;
  }
  const settings = parsed?.settings;
  const messages = parsed?.messages;
  const jsonObject = parsed?.jsonObject === true;
  if (!settings || !Array.isArray(messages)) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "请求体缺少 settings/messages" }));
    return;
  }
  let targetUrl;
  let authHeaders = {};
  switch (settings.provider) {
    case "deepseek":
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
  let upstream;
  try {
    upstream = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(
        settings.provider === "ollama"
          ? { model: settings.model, messages, stream: true }
          : {
              model: settings.model,
              messages,
              stream: true,
              temperature: 0.3,
              ...(jsonObject ? { response_format: { type: "json_object" } } : {}),
            }
      ),
    });
  } catch (e) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: "无法连接上游: " + (e?.message ?? e) }));
    return;
  }
  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => "");
    res.statusCode = 502;
    res.end(JSON.stringify({ error: "上游 " + upstream.status + ": " + errText.slice(0, 300) }));
    return;
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const reader = upstream.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  } finally {
    res.end();
  }
}

async function handleStatic(req, res, pathname) {
  let p = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  // 防目录穿越
  const rootNorm = path.normalize(STATIC_ROOT);
  const resolved = path.normalize(path.join(STATIC_ROOT, p));
  if (!resolved.startsWith(rootNorm)) {
    res.statusCode = 403;
    res.end("forbidden");
    return;
  }
  // SPA 兜底:找不到文件且无扩展名 → index.html
  let target = resolved;
  try {
    const st = await stat(target);
    if (st.isDirectory()) target = path.join(target, "index.html");
  } catch {
    if (!path.extname(p)) {
      target = path.join(STATIC_ROOT, "index.html");
    } else {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
  }
  try {
    const data = await readFile(target);
    const ext = path.extname(target).toLowerCase();
    res.statusCode = 200;
    res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream");
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end("not found");
  }
}

function startServer() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    try {
      if (url.pathname === "/api/llm/chat" && req.method === "POST") {
        const body = await readBody(req);
        await handleLlmChat(req, res, body);
      } else {
        await handleStatic(req, res, url.pathname);
      }
    } catch (e) {
      console.error("[layerview] handler error:", e);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end(String(e?.message ?? e));
      } else {
        res.end();
      }
    }
  });
  server.on("error", (err) => {
    console.error("[layerview] server error:", err);
    dialog.showErrorBox("Layerview 启动失败", "本地服务启动错误:\n" + (err?.message ?? err));
    app.quit();
  });
  server.listen(PORT, "127.0.0.1", () => {
    console.log("[layerview] local server on http://127.0.0.1:" + PORT);
  });
  return server;
}

let mainWindow = null;
let server = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: "Layerview · 分层透视镜",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadURL("http://127.0.0.1:" + PORT + "/");
  // 外部链接走系统浏览器
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  try {
    console.log("[layerview] app ready, packaged=" + app.isPackaged + " root=" + STATIC_ROOT);
    server = startServer();
    createWindow();
  } catch (e) {
    console.error("[layerview] startup error:", e);
    dialog.showErrorBox("Layerview 启动失败", String(e?.message ?? e));
    app.quit();
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("quit", () => {
  if (server) server.close();
});
