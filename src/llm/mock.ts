import type { ChatRequest } from "./types";

/** 模拟流式输出:用于无网络/无 Key 时的演示与回归测试(发完全部 chunk 后 resolve) */
export function mockChatStream(req: ChatRequest, onDelta: (d: string) => void): Promise<void> {
  const lastUser = [...req.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  // 注意顺序:追问提示词会内嵌历史对话(可能含"逐层下钻"字样),因此追问优先判定
  const isFollowup = lastUser.includes("用户追问:");
  const isExtract = !isFollowup && lastUser.includes("请解析以下文档片段为分层 JSON");
  const isExplain = !isFollowup && !isExtract && lastUser.includes("四段");
  const isDrill = !isFollowup && !isExtract && lastUser.includes("逐层下钻");
  const nodeNameMatch = lastUser.match(/【节点名称】([^\n]+)/);
  const nodeName = nodeNameMatch ? nodeNameMatch[1] : "当前节点";
  // 追问模式下取真实问题(提示词里「用户追问:」之后的内容)
  const followupMatch = lastUser.match(/用户追问:([^\n]+)/);
  const realQuestion = followupMatch ? followupMatch[1] : lastUser.slice(-60);

  let text: string;
  if (isExtract) {
    text = mockExtract(lastUser);
  } else if (isFollowup) {
    text = "这是 mock 模式的追问回复。你问的是:\"" + realQuestion + "\"。接入真实 API 后,我会结合「" + nodeName + "」的上下文回答。(mock)";
  } else if (isExplain) {
    text = [
      "1. **是什么**:" + nodeName + " 是本分层结构中的一个关键模块,负责承上启下的信息变换。(mock 演示)",
      "",
      "2. **为什么**:没有它,信息就无法从上层流入下一层,整体流程会断链;它把上层输出整理成下层可用的形式。(mock 演示)",
      "",
      "3. **数值/机制含义**:从机制上看,它做了一次确定性的变换——输入维度保持结构化,输出可直接被下一级消费。(mock 演示)",
      "",
      "4. **与上下层的关系**:数据自父节点流入,经本节点加工后交给子节点;它同时约束了上下两层的接口。(mock 演示)",
    ].join("\n");
  } else if (isDrill) {
    text = [
      "**总览**:这是一次逐层下钻演示(mock)。真实接入 DeepSeek 后将按层递进讲解。",
      "",
      "## 第 1 层",
      nodeName + ":本层是下钻的起点,定义了整体目标。(mock)",
      "",
      "## 第 2 层",
      "子模块:承接上层输出,细化处理逻辑。(mock)",
    ].join("\n");
  } else {
    text = "这是 mock 模式的追问回复。你问的是:\"" + realQuestion + "\"。接入真实 API 后,我会结合「" + nodeName + "」的上下文回答。(mock)";
  }

  const chunks = text.match(/[\s\S]{1,12}/g) ?? [text];
  let i = 0;
  return new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      if (i < chunks.length) {
        onDelta(chunks[i]);
        i++;
      } else {
        clearInterval(timer);
        resolve();
      }
    }, 30);
  });
}

/** mock 抽取器:解析 markdown 标题(#/##/###)生成合法 pack JSON(用于 M4 离线端到端测试) */
function mockExtract(prompt: string): string {
  const marker = "请解析以下文档片段为分层 JSON:";
  const idx = prompt.indexOf(marker);
  const doc = (idx >= 0 ? prompt.slice(idx + marker.length) : prompt).trim();
  interface MockNode {
    id: string;
    name: string;
    type: string;
    summary: string;
    children?: MockNode[];
  }
  const root: MockNode = { id: "m.root", name: "文档解析结果", type: "model", summary: "mock 抽取", children: [] };
  let idSeq = 0;
  let h1: MockNode | null = null;
  let h2: MockNode | null = null;
  let firstText = "";
  for (const raw of doc.split(/\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const h1m = line.match(/^#\s+(.+)$/);
    const h2m = line.match(/^##\s+(.+)$/);
    const h3m = line.match(/^###\s+(.+)$/);
    if (h1m) {
      h1 = { id: "m.h1." + idSeq++, name: h1m[1].slice(0, 16), type: "layer", summary: "章节", children: [] };
      h2 = null;
      root.children!.push(h1);
    } else if (h2m && h1) {
      h2 = { id: "m.h2." + idSeq++, name: h2m[1].slice(0, 16), type: "concept", summary: "小节", children: [] };
      h1.children!.push(h2);
    } else if (h3m) {
      const h3: MockNode = { id: "m.h3." + idSeq++, name: h3m[1].slice(0, 16), type: "step", summary: "要点" };
      (h2 ? h2.children! : root.children!).push(h3);
    } else if (!firstText) {
      firstText = line;
    }
  }
  if (root.children!.length === 0) {
    root.children!.push({ id: "m.leaf.0", name: "正文内容", type: "concept", summary: (firstText || doc).slice(0, 50) });
  } else if (firstText && root.children![0]) {
    root.children![0].summary = firstText.slice(0, 50);
  }
  return JSON.stringify({ id: "mock-extracted", title: "mock 解析结果", theme: "mock", root });
}
