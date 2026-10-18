import { DEFAULT_SETTINGS, type LLMSettings } from "./types";

const KEY = "layerview.llm.settings";

export function loadSettings(): LLMSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<LLMSettings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: LLMSettings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}
