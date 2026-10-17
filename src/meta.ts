import type { NodeType } from "./types";

export const TYPE_LABELS: Record<NodeType, string> = {
  model: "模型/系统",
  layer: "层级模块",
  concept: "概念",
  formula: "公式",
  step: "处理步骤",
  data: "数据产品",
};

export const TYPE_COLORS: Record<NodeType, string> = {
  model: "#6366f1",
  layer: "#0ea5e9",
  concept: "#14b8a6",
  formula: "#f59e0b",
  step: "#10b981",
  data: "#ec4899",
};
