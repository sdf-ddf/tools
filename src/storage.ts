// 应用状态持久化:用户导入的内容包、当前选择、视图模式存 localStorage,重启恢复
import type { ContentPack } from "./types";

const KEY = "layerview.state.v1";

export interface PersistedState {
  customPacks: ContentPack[]; // 用户导入/解析生成的内容包
  packId: string;
  selectedId: string;
  viewMode: "tree" | "network";
  expandedIds: string[];
}

export function loadState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    if (!Array.isArray(parsed.customPacks)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveState(s: PersistedState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // 存储满等异常静默忽略(不阻塞主流程)
  }
}
