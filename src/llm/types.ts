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
  model: "deepseek-chat",
  ollamaUrl: "http://127.0.0.1:11434",
};

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  settings: LLMSettings;
  messages: ChatMessage[];
}

export interface ChatResult {
  ok: boolean;
  text: string;
  error?: string;
}

export interface ChatStreamCallbacks {
  onDelta: (delta: string) => void;
}
