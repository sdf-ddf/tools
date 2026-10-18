import { useState } from "react";
import { DEFAULT_SETTINGS, type LLMSettings, type ProviderKind } from "../llm/types";

interface SettingsModalProps {
  current: LLMSettings;
  onSave: (s: LLMSettings) => void;
  onClose: () => void;
}

const PROVIDERS: { kind: ProviderKind; label: string }[] = [
  { kind: "deepseek", label: "DeepSeek(推荐)" },
  { kind: "openai", label: "OpenAI 兼容" },
  { kind: "ollama", label: "Ollama 本地" },
  { kind: "mock", label: "Mock 演示(无 Key)" },
];

export function SettingsModal({ current, onSave, onClose }: SettingsModalProps) {
  const [s, setS] = useState<LLMSettings>({ ...current });
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof LLMSettings>(key: K, value: LLMSettings[K]) {
    setS((prev) => ({ ...prev, [key]: value }));
  }

  const needsKey = s.provider === "deepseek" || s.provider === "openai";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>模型设置</h3>

        <label className="field">
          <span>服务提供方</span>
          <select value={s.provider} onChange={(e) => set("provider", e.target.value as ProviderKind)}>
            {PROVIDERS.map((p) => (
              <option key={p.kind} value={p.kind}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        {needsKey && (
          <label className="field">
            <span>API Key(仅存本机浏览器)</span>
            <input
              type="password"
              value={s.apiKey}
              placeholder="sk-…"
              onChange={(e) => set("apiKey", e.target.value)}
            />
          </label>
        )}

        {s.provider === "ollama" && (
          <label className="field">
            <span>Ollama 地址</span>
            <input value={s.ollamaUrl} onChange={(e) => set("ollamaUrl", e.target.value)} />
          </label>
        )}

        {needsKey && (
          <label className="field">
            <span>Base URL</span>
            <input value={s.baseUrl} onChange={(e) => set("baseUrl", e.target.value)} />
          </label>
        )}

        <label className="field">
          <span>模型</span>
          <input
            value={s.model}
            onChange={(e) => set("model", e.target.value)}
            placeholder={
              s.provider === "deepseek" ? "deepseek-chat / deepseek-reasoner" : "模型名"
            }
          />
        </label>

        <div className="modal-hint">
          API Key 只保存在浏览器 localStorage,经本地代理转发,不会上传到任何第三方服务器。
        </div>

        {err && <div className="modal-error">{err}</div>}

        <div className="modal-actions">
          <button
            className="action-btn primary"
            onClick={() => {
              if (needsKey && !s.apiKey.trim()) {
                setErr("请先填写 API Key,或切换为 Mock 演示模式");
                return;
              }
              onSave(s);
            }}
          >
            保存
          </button>
          <button
            className="action-btn"
            onClick={() => {
              setS({ ...DEFAULT_SETTINGS });
              setErr(null);
            }}
          >
            恢复默认
          </button>
          <button className="action-btn" onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
