# M4 调研:文档 → 分层结构自动抽取

> 状态:subagent 调研未产出,由 Lead 基于**实测(DeepSeek API 直连)+ 检索一手来源**撰写。
> 日期:2026-10-18

## 0. 概述

M4 目标:把论文/文档自动解析为 Layerview 的 ContentPack(分层 JSON)。本次调研重点回答三个工程问题:① 所用 DeepSeek API 到底支持什么;② PDF 解析选什么;③ 层级抽取的实用策略。**核心结论:本账号可用的 DeepSeek 模型只有 deepseek-flash 与 deepseek-v4-pro,且都支持 json_object 强制 JSON 输出——这决定默认配置必须改。**

## 1. DeepSeek API 实测事实(最重要)

### 1.1 可用模型(实测,2026-10-18,用本 Key 调用 GET /models)

\`\`\`
deepseek-flash
deepseek-v4-pro
\`\`\`

- **没有** deepseek-chat / deepseek-reasoner(与公开文档不一致,本 Key 走的是新模型线或特殊网关)。
- 传 \`"model":"deepseek-chat"\` 时,响应 \`model\` 字段返回 \`deepseek-flash\`,说明存在透明映射(容错但不可靠,应显式用真实模型名)。

### 1.2 json_object 支持(实测)

- \`response_format: {type: "json_object"}\` 被接受,两个模型都返回**合法 JSON**,finish_reason=stop。
- 用法与 OpenAI 一致;官方有 JSON Mode 指南(https://api-docs.deepseek.com/guides/json_mode/,需在提示词中包含"json"字样)。
- deepseek-v4-pro 输出更接近要求(结构化、带缩进),flash 更快更省。
- **建议默认 \`deepseek-flash\`(快+省,抽取够用),\`deepseek-v4-pro\` 供重试/复杂文档。**

### 1.3 流式 + json_object

- 流式(SSE)与 json_object 可同时用(我们的代理已验证流式透传),但 json_object 下增量 delta 拼接后才是完整 JSON;前端"修复重试"逻辑仍应保留。

## 2. PDF → 文本/结构 解析工具链

| 工具 | 定位 | 输出 | 许可 | 备注 |
|---|---|---|---|---|
| **Docling**(IBM) | AI 驱动的文档转换 | Markdown/JSON,保布局与阅读顺序 | MIT | 有 arXiv 论文 2501.17887;生态活跃(docling-project) |
| **marker**(datalab-to) | PDF→Markdown+JSON,高精度 | MD+JSON | GPL-3.0(旧)/新 datalab 版需查 | 曾称"50页论文变海报"链路,精度好 |
| PyMuPDF(pymupdf) | 底层文本/布局提取 | 文本+坐标 | AGPL(商用需授权) | 最成熟稳定,Windows 支持好 |
| pdfplumber | 表格/文本提取 | 文本+表格 | MIT | 轻量,适合论文正文 |
| GROBID | 学术文献结构(TEI-XML) | 标题/作者/章节 | Apache-2.0 | 学术解析事实标准,但需 JVM |
| jsonrepair(josdejong) | 修复破损 JSON | 修复后 JSON | ISC | LLM 输出容错的业界常用件 |

**建议**:M4 先只做 .txt/.md;PDF 解析**下一阶段**接 PyMuPDF(纯 Python、Windows 免编译)提取文本,再喂现有抽取引擎——避免引入重型依赖。

## 3. LLM 层级抽取策略(实用)

1. **json_object 优先**:本 Key 实测可用,比"提示词+修复重试"可靠得多。保留修复重试作为兜底。
2. **分块**:6000 字符 + 300 重叠(已实现)。分块越大层级越连续;建议**优先按标题边界切**(markdown # 标题),而非纯段落。
3. **两阶段**:先大纲(标题树)→ 每节填充(细粒度),比单次全文抽取更稳;长文档(>1.5 万字符)推荐。
4. **论文结构**:IMRaD 或编号标题启发式(1. / 1.1)应写进提示词(已写);实测 DeepSeek 能自动归纳语义子节点(如"ABLH关键参数")。
5. **校验兜底**:validatePack + jsonrepair(可后接)+ 重试一次(已实现)。

## 4. 对 M4 设计的建议清单(按优先级)

1. **[P0] 改默认模型**:设置里默认 \`deepseek-flash\`,下拉提供 flash/v4-pro 两个选项(替代 deepseek-chat/reasoner)。**依据:实测模型列表。**
2. **[P0] 代理加 \`response_format:{type:"json_object"}\`**:仅抽取请求需要——可在代理按 messages 里是否含抽取提示词判断,或前端在请求体加 flag。
3. **[P1] 分块按标题边界切**:markdown 标题优先于 6000 字符硬切。
4. **[P1] 两阶段抽取**(先大纲后填充)留给 M4.1,当前单阶段已可用。
5. **[P2] PDF 支持**:PyMuPDF 提取文本 → 复用抽取引擎(后端 FastAPI 或前端 worker)。
6. **[P2] jsonrepair**:接在修复重试之后,作为第二层容错。

## 5. 参考

- DeepSeek JSON Mode 指南:https://api-docs.deepseek.com/guides/json_mode/
- Docling:https://github.com/docling-project/docling / arXiv:2501.17887
- marker:https://github.com/datalab-to/marker
- PyMuPDF:https://pypi.org/project/PyMuPDF/
- GROBID:https://github.com/kermitt2/grobid
- jsonrepair:https://github.com/josdejong/jsonrepair
