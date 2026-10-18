import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { ContentPack, LayerNode } from "../types";
import { TYPE_COLORS, TYPE_LABELS } from "../meta";
import { loadSettings } from "../llm/settings";
import { streamChat } from "../llm/client";
import { explainPrompt, drilldownPrompt, followupPrompt, type NodeContext } from "../llm/prompts";
import type { ChatMessage } from "../llm/types";

interface ChatItem {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

interface NodePanelProps {
  pack: ContentPack;
  node: LayerNode | null;
  path: LayerNode[];
  onJump: (id: string) => void;
}

export function NodePanel({ pack, node, path, onJump }: NodePanelProps) {
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // 切换节点时清空对话与错误
  useEffect(() => {
    setChat([]);
    setError(null);
  }, [node?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  if (!node) {
    return (
      <div className="panel-empty">
        <p>在左侧或画布中选择一个节点,这里会显示它的详细讲解。</p>
      </div>
    );
  }

  const ctx: NodeContext = { node, path, packTitle: pack.title, packTheme: pack.theme };
  const kids = node.children ?? [];

  function runStream(msgs: ChatMessage[], initial: ChatItem) {
    const settings = loadSettings();
    setChat((prev) => [...prev, initial]);
    setBusy(true);
    setError(null);
    // 流式更新最后一条 assistant 消息(纯函数更新,兼容 StrictMode 双调用)
    const update = (delta: string) => {
      setChat((prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== "assistant") return prev;
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...last,
          content: last.content + delta,
          streaming: true,
        };
        return updated;
      });
    };
    streamChat({ settings, messages: msgs }, { onDelta: update })
      .then(() => {
        setChat((prev) => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "assistant") return prev;
          const next = [...prev];
          next[next.length - 1] = { ...last, streaming: false };
          return next;
        });
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setChat((prev) => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "assistant") return prev;
          if (!last.content) {
            return prev.slice(0, -1); // 空回复则移除占位
          }
          const next = [...prev];
          next[next.length - 1] = { ...last, streaming: false };
          return next;
        });
      })
      .finally(() => setBusy(false));
  }

  function handleExplain() {
    const settings = loadSettings();
    const userMsg = explainPrompt(ctx);
    const sys = settings.provider === "mock"
      ? "你是讲解助手"
      : "你是 Layerview 分层透视镜的讲解助手。";
    runStream(
      [{ role: "system", content: sys }, { role: "user", content: userMsg }],
      { role: "assistant", content: "", streaming: true }
    );
  }

  function handleDrilldown() {
    const userMsg = drilldownPrompt(ctx);
    runStream(
      [
        { role: "system", content: "你是 Layerview 分层透视镜的讲解助手。" },
        { role: "user", content: userMsg },
      ],
      { role: "assistant", content: "", streaming: true }
    );
  }

  function handleAsk() {
    const q = question.trim();
    if (!q || busy) return;
    const history: { role: string; content: string }[] = [];
    for (const item of chat.slice(-6)) {
      history.push({ role: item.role, content: item.content });
    }
    const settings = loadSettings();
    const userMsg = followupPrompt(ctx, history, q);
    const sys = settings.provider === "mock"
      ? "你是讲解助手"
      : "你是 Layerview 分层透视镜的讲解助手。";
    setQuestion("");
    runStream(
      [{ role: "system", content: sys }, { role: "user", content: userMsg }],
      { role: "assistant", content: "", streaming: true }
    );
  }

  return (
    <>
      <h2>{node.name}</h2>
      <div>
        <span className="type-chip" style={{ background: TYPE_COLORS[node.type] }}>
          {TYPE_LABELS[node.type]}
        </span>
        <span className="depth">第 {Math.max(0, path.length - 1)} 层</span>
      </div>

      <div className="panel-actions">
        <button className="action-btn primary" onClick={handleExplain} disabled={busy}>
          {busy ? "生成中…" : "点选讲解"}
        </button>
        <button className="action-btn" onClick={handleDrilldown} disabled={busy}>
          讲到最底层
        </button>
      </div>

      {error && <div className="llm-error">{error}</div>}

      {kids.length > 0 && (
        <>
          <div className="section-title">子层({kids.length})· 点击跳转</div>
          <div className="kids">
            {kids.map((k) => (
              <button key={k.id} className="kid-chip" onClick={() => onJump(k.id)}>
                {k.name}
              </button>
            ))}
          </div>
        </>
      )}

      {path.length > 1 && (
        <>
          <div className="section-title">上层节点</div>
          <div className="kids">
            {path.slice(0, -1).map((p) => (
              <button key={p.id} className="kid-chip" onClick={() => onJump(p.id)}>
                ↑ {p.name}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="section-title">讲解区</div>
      {chat.length === 0 ? (
        <div className="chat-empty">
          <p>点击「点选讲解」让大模型用四段式(是什么/为什么/数值含义/上下层关系)讲解本节点;</p>
          <p>「讲到最底层」将逐层下钻到叶子;</p>
          <p>下方输入框可连续追问,保留上下文。</p>
        </div>
      ) : (
        <div className="chat-list">
          {chat.map((item, i) => (
            <div key={i} className={"chat-item " + item.role}>
              <div className="chat-role">{item.role === "assistant" ? "讲解" : "你"}</div>
              <div className="chat-content">
                <ReactMarkdown>{item.content}</ReactMarkdown>
                {item.streaming && <span className="cursor-blink">▍</span>}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      <div className="ask-bar">
        <input
          type="text"
          placeholder="追问这个节点…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAsk()}
        />
        <button onClick={handleAsk} disabled={busy || !question.trim()}>
          发送
        </button>
      </div>
    </>
  );
}
