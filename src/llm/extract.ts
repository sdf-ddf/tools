import type { ChatMessage, LLMSettings } from "./types";
import { streamChat } from "./client";
import { validatePack } from "../validate";
import { jsonrepair } from "jsonrepair";

const CHUNK_CHARS = 6000; // 分块阈值
const OVERLAP_CHARS = 300;
const MAX_SELF_REPAIR_ROUNDS = 2; // 校验反馈自修复最多轮数

/** 收集一次流式响应的完整文本 */
export async function collectText(
  settings: LLMSettings,
  messages: ChatMessage[],
  opts?: { jsonObject?: boolean }
): Promise<string> {
  let text = "";
  await streamChat(
    { settings, messages, jsonObject: opts?.jsonObject },
    { onDelta: (d) => (text += d) }
  );
  return text;
}

/** 抽取参数(M4.1):层级深度与每层节点上限 */
export interface ExtractOptions {
  maxDepth?: number; // 最大层级(默认 4)
  maxNodesPerLevel?: number; // 每层最多节点(默认 12)
  onProgress?: (info: { chunk: number; totalChunks: number; phase: string }) => void;
}

/**
 * 分块策略:短文档整块;长文档按标题行切节,节内超阈值再按段落切,块间保留重叠。
 */
export function chunkText(doc: string): string[] {
  if (doc.length <= CHUNK_CHARS) return [doc];
  const headingRe = /^(#{1,3}\s.+)$/gm;
  const cuts: number[] = [0];
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(doc)) !== null) {
    if (m.index > 0) cuts.push(m.index);
  }
  cuts.push(doc.length);
  const sections: string[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const sec = doc.slice(cuts[i], cuts[i + 1]).trim();
    if (sec) sections.push(sec);
  }
  const chunks: string[] = [];
  let cur = "";
  const pushCur = () => {
    if (cur.trim()) chunks.push(cur.trim());
    cur = "";
  };
  for (const sec of sections) {
    if (sec.length > CHUNK_CHARS) {
      pushCur();
      const paras = sec.split(/\n{2,}/);
      for (const p of paras) {
        if ((cur + p).length > CHUNK_CHARS && cur) {
          pushCur();
          cur = cur ? cur.slice(-OVERLAP_CHARS) + "\n\n" + p : p;
        } else {
          cur += (cur ? "\n\n" : "") + p;
        }
      }
      pushCur();
    } else if ((cur + sec).length > CHUNK_CHARS && cur) {
      pushCur();
      cur = sec;
    } else {
      cur += (cur ? "\n\n" : "") + sec;
    }
  }
  pushCur();
  return chunks.length > 0 ? chunks : [doc];
}

/** 从 LLM 回复里尽力提取 JSON:去 markdown 围栏、截取首个 { 到末个 } */
export function extractJsonObject(text: string): string | null {
  let t = text.trim();
  t = t.replace(/^\x60\x60\x60(?:json)?\s*/i, "").replace(/\s*\x60\x60\x60$/, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return t.slice(start, end + 1);
}

/** 解析 LLM 文本为对象:先截取,再 JSON.parse,失败则 jsonrepair 修复再试 */
export function tryParseObject(text: string): unknown | null {
  const candidate = extractJsonObject(text);
  if (!candidate) return null;
  try {
    return JSON.parse(candidate);
  } catch {
    try {
      return JSON.parse(jsonrepair(candidate));
    } catch {
      return null;
    }
  }
}

/** 修复重复/缺失 id:首次出现保留,重复追加 -2、-3…;缺失用父 id + 序号 */
export function dedupeIds(pack: unknown): void {
  const p = pack as { root?: { id?: unknown; children?: unknown[]; [k: string]: unknown } };
  const root = p?.root;
  if (!root || typeof root !== "object") return;
  const seen = new Set<string>();
  const ensure = (id: unknown, fallback: string): string => {
    const base = typeof id === "string" && id.trim() ? id.trim() : fallback;
    let candidate = base;
    let n = 2;
    while (seen.has(candidate)) {
      candidate = base + "-" + n;
      n++;
    }
    seen.add(candidate);
    return candidate;
  };
  const walk = (
    node: { id?: unknown; children?: unknown[]; [k: string]: unknown },
    fallback: string
  ) => {
    node.id = ensure(node.id, fallback);
    for (const child of node.children ?? []) {
      if (child && typeof child === "object") walk(child as typeof node, String(node.id) + ".n");
    }
  };
  walk(root, "root");
}

/** 自动修复器:补类型/字段,过滤坏边(尽力把内容包修到可通过校验) */
function autoRepairPack(pack: unknown): void {
  const p = pack as Record<string, unknown>;
  if (!p || typeof p !== "object") return;
  if (typeof p.id !== "string" || !p.id) p.id = "extracted";
  if (typeof p.title !== "string" || !p.title) p.title = "解析结果";
  if (typeof p.theme !== "string" || !p.theme) p.theme = "文档解析";
  const root = p.root as Record<string, unknown> | undefined;
  if (!root || typeof root !== "object") {
    p.root = { id: "root", name: "文档解析结果", type: "model", summary: "自动抽取" };
    return;
  }
  const VALID_TYPES = ["model", "layer", "concept", "formula", "step", "data"];
  const fixNode = (n: Record<string, unknown>) => {
    if (typeof n.id !== "string" || !n.id) n.id = "n-" + Math.random().toString(36).slice(2, 8);
    if (typeof n.name !== "string" || !n.name) n.name = String(n.id);
    if (!VALID_TYPES.includes(String(n.type))) n.type = "concept";
    if (typeof n.summary !== "string") n.summary = "";
    if (Array.isArray(n.children)) {
      n.children = n.children.filter((c) => c && typeof c === "object");
      for (const c of n.children as Record<string, unknown>[]) fixNode(c);
    } else {
      delete n.children;
    }
  };
  fixNode(root);
  if (p.edges !== undefined) {
    if (!Array.isArray(p.edges)) {
      delete p.edges;
    } else {
      const ids = new Set<string>();
      const collect = (n: Record<string, unknown>) => {
        if (typeof n.id === "string") ids.add(n.id);
        (n.children as Record<string, unknown>[] | undefined)?.forEach(collect);
      };
      collect(root);
      p.edges = (p.edges as Record<string, unknown>[]).filter(
        (e) =>
          e &&
          typeof e.from === "string" &&
          typeof e.to === "string" &&
          ids.has(e.from) &&
          ids.has(e.to)
      );
    }
  }
  dedupeIds(pack);
}

/** 裁剪层级:超过 maxDepth 的子树折叠为叶子(summary 合并) */
function trimDepth(root: unknown, maxDepth: number): void {
  const walk = (n: Record<string, unknown>, depth: number) => {
    const kids = n.children as Record<string, unknown>[] | undefined;
    if (!kids || kids.length === 0) return;
    if (depth >= maxDepth) {
      const names = kids
        .map((k) => String(k.name ?? ""))
        .filter(Boolean)
        .join("、");
      if (names)
        n.summary =
          (typeof n.summary === "string" && n.summary ? n.summary + " " : "") + "涵盖:" + names;
      delete n.children;
      return;
    }
    for (const c of kids) walk(c, depth + 1);
  };
  walk(root as Record<string, unknown>, 1);
}

/** 裁剪每层节点数:超出 maxNodesPerLevel 的合并为"其他 N 项" */
function trimNodesPerLevel(root: unknown, maxNodes: number): void {
  const walk = (n: Record<string, unknown>) => {
    const kids = n.children as Record<string, unknown>[] | undefined;
    if (kids && kids.length > maxNodes) {
      const keep = kids.slice(0, maxNodes);
      const rest = kids.slice(maxNodes);
      const restNames = rest
        .map((k) => String(k.name ?? ""))
        .filter(Boolean)
        .join("、");
      keep.push({
        id: String(n.id) + ".more",
        name: "其他 " + rest.length + " 项",
        type: "concept",
        summary: restNames ? "包含:" + restNames.slice(0, 80) : "更多内容",
      });
      n.children = keep;
    }
    (n.children as Record<string, unknown>[] | undefined)?.forEach(walk);
  };
  walk(root as Record<string, unknown>);
}

const EXAMPLE_JSON = JSON.stringify(
  {
    id: "lidar-abll",
    title: "激光雷达反演边界层",
    theme: "大气遥感",
    root: {
      id: "lidar-abll.root",
      name: "激光雷达反演边界层",
      type: "model",
      summary: "一句话说明",
      children: [
        {
          id: "lidar-abll.method",
          name: "方法",
          type: "layer",
          summary: "小波协方差变换反演",
          children: [
            {
              id: "lidar-abll.method.wct",
              name: "小波协方差变换 WCT",
              type: "step",
              summary: "协方差最大处对应边界层顶",
            },
          ],
        },
      ],
    },
  },
  null,
  2
);

/** Follow-the-Format 提示词:完整示例(StructuredRAG 结论:完整示例优于模板填空) */
const SYSTEM_PROMPT = [
  '你是"文档结构解析器"。把用户提供的文档解析成 JSON 分层树,供可视化学习平台使用。',
  "",
  "只输出一个 JSON 对象(不要任何解释、不要 markdown 围栏)。字段名与嵌套方式必须与下面示例完全一致。",
  "",
  "示例(格式标准):",
  EXAMPLE_JSON,
  "",
  "规则:",
  "1. 依据标题、小节、编号、段落主题确定层级(如 IMRaD、1./1.1 编号)。",
  "2. 层级 2-4 层;叶子是具体概念/公式/步骤。type 按语义:整体系统→model,大模块→layer,术语→concept,公式→formula,流程→step,数据/产品→data。",
  "3. id 全树唯一,用英文短串,不要用中文/空格。",
  "4. 忠实原文:name 可用中文概括,但不要编造原文没有的内容。",
  "5. 每个节点的 summary 是一句完整的话,不超过 50 字。",
].join("\n");

/** 抽取一个文本块 → 子树 JSON。带校验反馈自修复循环。 */
export async function extractChunk(
  settings: LLMSettings,
  chunk: string,
  opts?: { onRepair?: (round: number, errors: string[]) => void }
): Promise<unknown> {
  const userMsg = "请解析以下文档片段为分层 JSON:\n\n" + chunk.slice(0, CHUNK_CHARS);
  const text = await collectText(
    settings,
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMsg },
    ],
    { jsonObject: true }
  );
  let parsed = tryParseObject(text);
  if (!parsed) {
    const retry = await collectText(
      settings,
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMsg },
        { role: "assistant", content: text.slice(0, 4000) },
        { role: "user", content: "上面的输出不是合法 JSON。请重新输出,只输出合法 JSON 对象。" },
      ],
      { jsonObject: true }
    );
    parsed = tryParseObject(retry);
    if (!parsed) return null;
  }

  // 校验反馈自修复循环:把 validatePack 的错误回传给模型修复
  for (let round = 1; round <= MAX_SELF_REPAIR_ROUNDS; round++) {
    const check = validatePack(parsed);
    if (check.ok) break;
    const errSummary = check.errors.slice(0, 6).join("; ");
    opts?.onRepair?.(round, check.errors);
    const fixMsg =
      "你刚才输出的 JSON 有这些问题:" +
      errSummary +
      "。请修复这些问题后重新输出完整 JSON(仍然只输出一个 JSON 对象,格式与示例一致)。";
    const fixed = await collectText(
      settings,
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMsg },
        { role: "assistant", content: JSON.stringify(parsed).slice(0, 6000) },
        { role: "user", content: fixMsg },
      ],
      { jsonObject: true }
    );
    const fixedParsed = tryParseObject(fixed);
    if (fixedParsed) parsed = fixedParsed;
  }
  return parsed;
}

/** 文档全文 → ContentPack JSON 字符串(多块按标题层级归并) */
export async function extractDocument(
  settings: LLMSettings,
  doc: string,
  opts?: ExtractOptions
): Promise<ExtractionResult> {
  const chunks = chunkText(doc);
  const maxDepth = opts?.maxDepth ?? 4;
  const maxNodes = opts?.maxNodesPerLevel ?? 12;
  try {
    if (chunks.length === 1) {
      opts?.onProgress?.({ chunk: 1, totalChunks: 1, phase: "抽取" });
      const parsed = await extractChunk(settings, chunks[0]);
      if (!parsed)
        return { ok: false, error: "抽取失败:LLM 输出无法解析为 JSON(已重试+jsonrepair)" };
      finalizePack(parsed, maxDepth, maxNodes);
      return { ok: true, packJson: JSON.stringify(parsed, null, 2) };
    }

    const parts: { title: string; level: number; node: unknown }[] = [];
    for (let i = 0; i < chunks.length; i++) {
      opts?.onProgress?.({
        chunk: i + 1,
        totalChunks: chunks.length,
        phase: "抽取块 " + (i + 1) + "/" + chunks.length,
      });
      const parsed = await extractChunk(settings, chunks[i]);
      if (!parsed) return { ok: false, error: "第 " + (i + 1) + " 块抽取失败" };
      const firstLine = chunks[i].split("\n")[0]?.trim() ?? "";
      const h = firstLine.match(/^(#{1,3})\s+(.+)$/);
      const level = h ? h[1].length : 1;
      const title = h ? h[2].slice(0, 16) : "第 " + (i + 1) + " 部分";
      parts.push({ title, level, node: parsed });
    }

    opts?.onProgress?.({ chunk: chunks.length, totalChunks: chunks.length, phase: "归并层级" });
    const merged = buildHierarchy(parts);
    finalizePack(merged, maxDepth, maxNodes);
    return { ok: true, packJson: JSON.stringify(merged, null, 2) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 抽取结果统一收尾:裁剪层级/节点数 → 自动修复 → id 去重 */
function finalizePack(pack: unknown, maxDepth: number, maxNodes: number) {
  const p = pack as Record<string, unknown>;
  if (p.root && typeof p.root === "object") {
    trimDepth(p.root, maxDepth);
    trimNodesPerLevel(p.root, maxNodes);
  }
  autoRepairPack(pack);
}

/** 按标题层级把多个块归并为嵌套树(栈式:level 决定挂到哪个父) */
function buildHierarchy(parts: { title: string; level: number; node: unknown }[]): unknown {
  const wrap = (part: { title: string; node: unknown }): Record<string, unknown> => {
    const inner = part.node as Record<string, unknown>;
    const innerRoot = (inner.root ?? inner) as Record<string, unknown>;
    return {
      id:
        "sec." +
        part.title
          .replace(/[^a-zA-Z0-9-]+/g, "-")
          .slice(0, 24)
          .toLowerCase(),
      name: part.title,
      type: "layer",
      summary: typeof innerRoot?.summary === "string" ? innerRoot.summary.slice(0, 50) : "",
      children: Array.isArray(innerRoot?.children) ? innerRoot.children : [],
    };
  };

  const root: Record<string, unknown> = {
    id: "x.root",
    name: "文档解析结果",
    type: "model",
    summary: "由文档自动抽取生成的分层结构",
    children: [],
  };

  const stack: { level: number; node: Record<string, unknown> }[] = [{ level: 0, node: root }];
  let idSeq = 0;
  for (const part of parts) {
    const node = wrap(part);
    if (!node.id) node.id = "sec." + idSeq++;
    while (stack.length > 1 && stack[stack.length - 1].level >= part.level) stack.pop();
    const parent = stack[stack.length - 1].node;
    ((parent.children ??= []) as unknown[]).push(node);
    stack.push({ level: part.level, node });
  }

  return { id: "extracted", title: "解析结果", theme: "文档解析", root };
}

export interface ExtractionResult {
  ok: boolean;
  packJson?: string;
  error?: string;
}
