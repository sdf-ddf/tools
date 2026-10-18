// 通用分层数据模型:一切内容(模型、算法、论文、遥感流程)的统一抽象
// 见 PRD.md 第 5 节

export type NodeType = "model" | "layer" | "concept" | "formula" | "step" | "data";

export interface VisualizationBinding {
  kind: "heatmap" | "matrix" | "histogram" | "tree" | "scatter" | "animation";
  dataRef: string; // 指向资源文件或内联数据
}

export interface Edge {
  from: string;
  to: string;
  label?: string; // 如 "前向传播"、"依赖"、"引用"
}

export interface LayerNode {
  id: string;
  name: string;
  type: NodeType;
  /** 静态简介:无 LLM 时的兜底讲解 */
  summary?: string;
  children?: LayerNode[];
  /** 跨层关系(数据流/依赖),M0 暂不渲染 */
  edges?: Edge[];
  visualization?: VisualizationBinding;
  /** 该节点专属的讲解提示词补充(M2 使用) */
  llmContext?: string;
}

export interface ContentPack {
  id: string;
  title: string;
  /** 全局主题,注入 LLM 上下文(M2 使用) */
  theme: string;
  root: LayerNode;
  /** 跨层关系(数据流/依赖),网络图模式使用 */
  edges?: Edge[];
}
