import type { LayerNode } from "../types";

export interface NodeContext {
  node: LayerNode;
  path: LayerNode[];
  packTitle: string;
  packTheme: string;
}

function pathLabel(ctx: NodeContext): string {
  return ctx.path.map((p) => p.name).join(" → ");
}

/** 点选讲解:四段式模板(是什么/为什么/数值含义/与上下层关系) */
export function explainPrompt(ctx: NodeContext): string {
  const node = ctx.node;
  const kids = (node.children ?? []).map((c) => c.name).join("、") || "无";
  const parent = ctx.path.length > 1 ? ctx.path[ctx.path.length - 2].name : "无(根节点)";
  return `你是"Layerview 分层透视镜"的讲解助手,面向大气遥感与算法方向的研究生。请用中文讲解下面这个"分层结构"中的节点。

【主题】${ctx.packTitle}(${ctx.packTheme})
【节点路径】${pathLabel(ctx)}
【节点名称】${node.name}
【节点类型】${node.type}
【节点简介】${node.summary ?? "无"}
【父节点】${parent}
【子节点】${kids}

请严格按以下四段输出(每段用小标题):
1. **是什么**:这个节点的角色与职责,一句大白话定义。
2. **为什么**:它为什么存在?解决什么问题?缺了它会怎样?
3. **数值/机制含义**:如果涉及数学量(维度、公式、阈值),讲清它们的含义;不涉及则讲机制。
4. **与上下层的关系**:数据/信息如何从父节点流入、又如何交给子节点。

要求:每段 1-3 句,总长 250 字以内,用通俗语言,适当类比。`;
}

/** 逐层下钻:一次生成该节点及其全部后代的分层讲解 */
export function drilldownPrompt(ctx: NodeContext): string {
  const flatten = (n: LayerNode, indent = ""): string => {
    const kids = (n.children ?? []).map((c) => flatten(c, indent + "  ")).join("\n");
    return `${indent}- ${n.name}(${n.type}):${n.summary ?? ""}${kids ? "\n" + kids : ""}`;
  };
  return `你是"Layerview 分层透视镜"的讲解助手,面向大气遥感与算法方向的研究生。

请对下面这棵树做"逐层下钻"讲解:从最上层讲到底层叶子,每层都比上一层更深入。先给出一句总览,然后按层级顺序逐节点讲解(每个节点 1-2 句,重点讲它做了什么、为什么在这一层、与上一层的关系)。

【主题】${ctx.packTitle}(${ctx.packTheme})
【起点】${ctx.node.name}

结构树:
${flatten(ctx.node)}

要求:
- 用 Markdown,每层用"第 N 层"标题组织;
- 由浅入深,叶子节点可点到具体数值/公式;
`;
}

/** 追问:携带当前节点上下文 */
export function followupPrompt(
  ctx: NodeContext,
  history: { role: string; content: string }[],
  question: string
): string {
  const node = ctx.node;
  return `你是"Layerview 分层透视镜"的讲解助手。当前焦点节点:「${node.name}」(${node.type}),位于「${ctx.packTitle}」主题下。

节点简介:${node.summary ?? "无"}

此前对话:
  ${history.map((m) => `${m.role}: ${m.content}`).join("\n")}

用户追问:${question}

请结合该节点上下文与对话历史,直接、简洁地回答(200 字内)。`;
}

/** 生成伪代码:针对当前节点(算法/方法)输出 Python/numpy 骨架 */
export function pseudocodePrompt(ctx: NodeContext): string {
  const node = ctx.node;
  const formula = node.formula ?? "";
  const parent = ctx.path.length > 1 ? ctx.path[ctx.path.length - 2].name : "";
  return [
    "你是一位大气遥感数值算法专家。请为下面的方法/公式生成可运行的 Python(numpy)伪代码骨架。",
    "",
    "节点名称:" + node.name,
    "所在章节:" + (parent || "无"),
    "节点简介:" + (node.summary ?? "无"),
    formula ? "核心公式(LaTeX):" + formula : "",
    "",
    "要求:",
    "1. 输出 Markdown 代码块(python),包含:函数签名、输入/输出数组形状注释、核心计算步骤、必要的数值注意事项(如收敛判据)。",
    "2. 不要求完整可运行,但结构要正确、步骤要完整,让研究生能照着填实现。",
    "3. 代码后附 2-3 条「实现要点」说明关键数值细节。",
  ]
    .filter(Boolean)
    .join("\n");
}

/** 复现清单:数据/参数/实现步骤 */
export function reproductionPrompt(ctx: NodeContext): string {
  const node = ctx.node;
  const packTitle = ctx.packTitle;
  return [
    "你是一位大气遥感领域的研究者。请为复现下面这篇论文的方法给出结构化清单。",
    "",
    "论文主题:" + packTitle,
    "当前方法节点:" + node.name,
    "节点简介:" + (node.summary ?? "无"),
    "",
    "请按以下结构输出(Markdown):",
    "## 需要的数据",
    "- (列出:数据类型、来源、公开获取途径)",
    "",
    "## 需要的参数",
    "- (列出:关键参数及典型取值)",
    "",
    "## 实现步骤",
    "1. (按顺序的复现步骤,每步一句话)",
    "",
    "## 验证方式",
    "- (如何判断实现正确:对照论文结果/合成数据自检)",
  ].join("\n");
}

