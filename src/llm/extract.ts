import type { ChatMessage, LLMSettings } from "./types";
import { streamChat } from "./client";

const CHUNK_CHARS = 6000; // 分块阈值(调研报告落地后可调)
const OVERLAP_CHARS = 300;

/** 收集一次流式响应的完整文本(可选 json_object 模式) */
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

/**
 * 分块策略(依据调研报告):
 * 1. 短文档(≤阈值)整篇一块;
 * 2. 长文档先按标题行(#/##/###)切节,节内超阈值再按段落切;
 * 3. 块间保留重叠,避免标题/上下文断裂。
 */
export function chunkText(doc: string): string[] {
  if (doc.length <= CHUNK_CHARS) return [doc];

  // 按标题行切分:每个标题开启一个新节
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

  // 节内按段落组装,超阈值才切
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
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return t.slice(start, end + 1);
}

/** 解析并校验 JSON 对象 */
export function tryParseObject(text: string): unknown | null {
  const candidate = extractJsonObject(text);
  if (!candidate) return null;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

export interface ExtractionResult {
  ok: boolean;
  packJson?: string;
  error?: string;
}

const SYSTEM_PROMPT = [
  "你是\"文档结构解析器\"。把用户提供的文档解析成 JSON 分层树,供可视化学习平台使用。",
  "",
  "输出必须是一个 JSON 对象(不要任何解释、不要 markdown 代码块围栏),结构:",
  "{",
  "  \"id\": \"短标识(英文+连字符)\",",
  "  \"title\": \"文档主题(≤12字)\",",
  "  \"theme\": \"领域标签\",",
  "  \"root\": {",
  "    \"id\": \"唯一短id\",",
  "    \"name\": \"节点名(≤16字)\",",
  "    \"type\": \"model | layer | concept | formula | step | data 之一\",",
  "    \"summary\": \"一句话说明(≤50字)\",",
  "    \"children\": [ ...同类节点,可嵌套 ]",
  "  }",
  "}",
  "",
  "规则:",
  "1. 依据标题、小节、编号、段落主题确定层级(如 IMRaD 结构、1. 1.1 编号)。",
  "2. 层级 2-4 层;叶子是具体概念/公式/步骤;type 按语义选:整体系统→model,大模块→layer,术语→concept,公式→formula,流程→step,数据/产品→data。",
  "3. id 全树唯一,用英文短串。",
  "4. 忠实原文:name 可用中文概括,但不要编造原文没有的内容。",
  "5. 只输出这一个 JSON 对象。",
].join("\n");

/** 单个文本块 → 子树 JSON */
export async function extractChunk(settings: LLMSettings, chunk: string): Promise<unknown> {
  const text = await collectText(
    settings,
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: "请解析以下文档片段为分层 JSON:\n\n" + chunk.slice(0, CHUNK_CHARS) },
    ],
    { jsonObject: true }
  );
  const parsed = tryParseObject(text);
  if (!parsed) {
    // 一次修复重试:把原回复与错误一起交回
    const retry = await collectText(
      settings,
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: "请解析以下文档片段为分层 JSON:\n\n" + chunk.slice(0, CHUNK_CHARS) },
        { role: "assistant", content: text.slice(0, 4000) },
        { role: "user", content: "上面的输出不是合法 JSON。请重新输出,只输出合法 JSON 对象。" },
      ],
      { jsonObject: true }
    );
    return tryParseObject(retry);
  }
  return parsed;
}

/**
 * 修复 LLM 抽取结果中重复/缺失的 id:
 * - 首次出现保留原 id;重复出现追加 -2、-3…
 * - 缺失或非字符串 id 用父 id + 序号生成
 * 递归处理整个 root 子树。
 */
export function dedupeIds(pack: unknown): void {
  const p = pack as { root?: { id?: unknown; children?: unknown[]; [k: string]: unknown } };
  const root = p?.root;
  if (!root || typeof root !== "object") return;
  const seen = new Set<string>();
  const ensure = (id: unknown, fallback: string): string => {
    let base = typeof id === "string" && id.trim() ? id.trim() : fallback;
    let candidate = base;
    let n = 2;
    while (seen.has(candidate)) {
      candidate = base + "-" + n;
      n++;
    }
    seen.add(candidate);
    return candidate;
  };
  const walk = (node: { id?: unknown; children?: unknown[]; [k: string]: unknown }, fallback: string) => {
    node.id = ensure(node.id, fallback);
    for (const child of node.children ?? []) {
      if (child && typeof child === "object") {
        walk(child as typeof node, String(node.id) + ".n");
      }
    }
  };
  walk(root, "root");
}

/** 文档全文 → ContentPack JSON 字符串(多块则合并) */
export async function extractDocument(settings: LLMSettings, doc: string): Promise<ExtractionResult> {
  const chunks = chunkText(doc);
  try {
    if (chunks.length === 1) {
      const parsed = await extractChunk(settings, chunks[0]);
      if (!parsed) return { ok: false, error: "抽取失败:LLM 输出无法解析为 JSON(已重试一次)" };
      dedupeIds(parsed);
      return { ok: true, packJson: JSON.stringify(parsed, null, 2) };
    }
    // 多块:逐块抽取子树,合并到一个合成根下
    const roots: unknown[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const parsed = await extractChunk(settings, chunks[i]);
      if (!parsed) return { ok: false, error: "第 " + (i + 1) + " 块抽取失败" };
      roots.push(parsed);
    }
    const merged = {
      id: "extracted",
      title: "解析结果",
      theme: "文档解析",
      root: {
        id: "x.root",
        name: "文档解析结果",
        type: "model" as const,
        summary: "由文档自动抽取生成的分层结构",
        children: roots.map((r) => (r as any).root ?? r),
      },
    };
    dedupeIds(merged);
    return { ok: true, packJson: JSON.stringify(merged, null, 2) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
