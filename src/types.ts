// 通用分层数据模型:一切内容(模型、算法、论文、遥感流程)的统一抽象
// 见 PRD.md 第 5 节

export type NodeType = "model" | "layer" | "concept" | "formula" | "step" | "data";

export type VizKind = "heatmap" | "matrix" | "histogram" | "line" | "scatter";

/** 可视化绑定:节点 → 数值展示 */
export interface VisualizationBinding {
  kind: VizKind;
  /** 面板展示标题 */
  title?: string;
  /** 内联数据(小数据直接放这里) */
  data?: VizData;
  /** 大数组走 dataRef,指向 pack.datasets */
  dataRef?: string;
}

export type VizData =
  | {
      kind: "heatmap" | "matrix";
      /** 行标签(可选) */
      rows?: string[];
      /** 列标签(可选) */
      cols?: string[];
      /** 二维数值矩阵 */
      values: number[][];
      /** 色标(蓝-白-红) */
      scale?: "blueRed";
    }
  | {
      kind: "histogram";
      /** 预分箱:每箱中心值 + 计数(避免大数组内联) */
      centers: number[];
      counts: number[];
      xLabel?: string;
    }
  | {
      kind: "line";
      x: number[];
      y: number[];
      xLabel?: string;
      yLabel?: string;
    }
  | {
      kind: "scatter";
      points: [number, number][];
      xLabel?: string;
      yLabel?: string;
    };

/** 内容包级数据集(被 dataRef 引用) */
export type DatasetMap = Record<string, VizData>;

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
  /** formula 类型节点的 LaTeX 表达式(论文精读模式) */
  formula?: string;
  /** formula 类型节点的符号表(LLM 生成:符号/含义/单位/典型量级) */
  symbols?: SymbolEntry[];
  /** 算法节点的伪代码骨架(论文精读模式) */
  pseudoCode?: string;
}

/** 公式符号条目(逐符号讲解用) */
export interface SymbolEntry {
  symbol: string; // LaTeX 符号,如 "\tau"
  name: string; // 中文名,如 "大气透过率"
  meaning: string; // 物理含义
  unit?: string; // 单位
  typical?: string; // 典型数量级(该领域内)
}

export interface ContentPack {
  id: string;
  title: string;
  /** 全局主题,注入 LLM 上下文(M2 使用) */
  theme: string;
  root: LayerNode;
  /** 跨层关系(数据流/依赖),网络图模式使用 */
  edges?: Edge[];
  /** 数据集(dataRef 指向这里) */
  datasets?: DatasetMap;
}
