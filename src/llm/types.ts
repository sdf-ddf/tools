export type ProviderKind = "deepseek" | "ollama" | "openai" | "mock";

export interface LLMSettings {
  provider: ProviderKind;
  /** DeepSeek/OpenAI 兼容:API Key(仅存 localStorage) */
  apiKey: string;
  /** OpenAI 兼容服务的 baseUrl(默认 https://api.deepseek.com) */
  baseUrl: string;
  model: string;
  /** Ollama 本地服务地址 */
  ollamaUrl: string;
}

export const DEFAULT_SETTINGS: LLMSettings = {
  provider: "deepseek",
  apiKey: "",
  baseUrl: "https://api.deepseek.com",
  // 实测(2026-10-18)本账号可用模型:deepseek-flash / deepseek-v4-pro
  model: "deepseek-flash",
  ollamaUrl: "http://127.0.0.1:11434",
};

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  settings: LLMSettings;
  messages: ChatMessage[];
  /** 请求 json_object 输出模式(抽取场景用) */
  jsonObject?: boolean;
}

export interface ChatResult {
  ok: boolean;
  text: string;
  error?: string;
}

export interface ChatStreamCallbacks {
  onDelta: (delta: string) => void;
  /** 外部取消信号(AbortSignal 触发时中止流) */
  signal?: AbortSignal;
}
