# M4 模块调研报告：文档 → 分层 JSON（ContentPack）自动抽取

> 调研日期：2026-10-18 ｜ 目标：为 Layerview（交互式分层文档学习平台）设计 M4 抽取模块
> 技术栈：TypeScript + React + Vite 前端 / Python + FastAPI 后端（可选）/ DeepSeek API（OpenAI 兼容）
> 本报告所有关键结论均为一手来源（官方 API 文档、官方仓库 README、论文原文/ACL Anthology、项目实测），每条结论后附来源。

---

## 0. 概述

M4 要做的事：**文档（PDF/Word/Markdown）→ 分层 JSON 树（ContentPack）**，供前端渲染"可交互分层结构"并由 LLM 逐层讲解。调研结论是这条链路应采用「**确定性结构解析（工具） + LLM 语义分层（模型）**」两段式：

1. **第一段（确定性）**：用 PDF 解析库拿到文本 + 字体/坐标 + 书签（TOC），得到块级结构线索。不花 LLM token，对学术论文（IMRaD、编号标题）非常可靠。
2. **第二段（语义）**：用 LLM 把块序列组织成层级树并输出 JSON。DeepSeek 官方支持 `json_object` 响应格式与 function calling strict 模式的 JSON Schema 校验（Beta），但**不支持** OpenAI 式的 `response_format={"type":"json_schema"}`，因此必须配「提示词骨架 + 校验/重试/修复」兜底。

---

## 1. LLM 结构化信息抽取 / 文档层级抽取的代表性论文

### 1.1 经典提示词方法论

**Chain-of-Thought Prompting（思维链）**
- **核心方法**：few-shot 示例中给出逐步推理链，让模型"先分解再作答"，大幅提升算术/常识/符号推理。是后来所有"逐步分解"提示策略的基础。
- **可借鉴**：M4 的逐层讲解可要求模型"先列层级判断依据，再输出 JSON"；层级抽取提示词带 2-3 个"如何判断标题层级"的示例。
- **局限性**：依赖精心设计的示例；推理链与最终答案耦合，难以直接复用。
- **来源**：Wei et al., NeurIPS 2022, arXiv:2201.11903 <https://arxiv.org/abs/2201.11903>

**Tree of Thoughts（思维树）**
- **核心方法**：把问题分解为树状搜索空间，每节点生成多候选、评估、回溯。"树状大纲生成"思想的最直接来源。
- **可借鉴**：M4 可"先广度生成候选标题层级，再自顶向下剪枝归并"；对难判断的层级（如 3.1.1 是否折叠）做多候选评分。
- **局限性**：多候选+回溯调用成本高，不适合长文档全文；适合作用在章节骨架级别。
- **来源**：Yao et al., NeurIPS 2023, arXiv:2305.10624 <https://arxiv.org/abs/2305.10624>；DOI 10.52202/075280-0517（Crossref 记录）

**ChatIE: Zero-Shot Information Extraction via Chatting with ChatGPT**
- **核心方法**：两轮对话——第一轮让模型确认实体/关系类型（Schema 对齐），第二轮按类型抽取，并带"自检"修正环节。多数据集零样本超越有监督小模型。
- **可借鉴**：与 M4 的"两阶段抽取"（先大纲后填充）一脉相承；其"先确认 schema 再抽取"模式可直接用：在提示词中先让模型复述 ContentPack 结构约定。
- **局限性**：面向实体关系而非长文档层级；依赖模型的指令遵循能力。
- **来源**：Wei, Cui, Ning et al., ACL 2023 Findings, arXiv:2302.10205 <https://arxiv.org/abs/2302.10205>

### 1.2 约束解码 / schema 引导生成

**Efficient Guided Generation for Large Language Models（outlines 理论基础）**
- **核心方法**：把 JSON Schema/正则编译为有限状态机（FSM），采样时屏蔽违反约束的 token（guided/constrained decoding）。是 outlines、llama.cpp grammar、vLLM guided decoding、XGrammar 的理论源头。
- **可借鉴**：理解"为什么约束解码能保证 100% 合法 JSON"——在采样层做掩码而非事后修复。M4 若未来自托管模型，可用 outlines/llama.cpp grammar 做硬约束；用 DeepSeek API 时只能用官方约束能力（见第 3 节）。
- **局限性**：需白盒访问模型（本地部署）；深层嵌套 schema 的 FSM 构造开销大。
- **来源**：Willard & Louf, arXiv:2307.09702 <https://arxiv.org/abs/2307.09702>

**SGLang: Efficient Execution of Structured Language Model Programs**
- **核心方法**：把结构化输出当"程序"执行，提供 constrained decoding 后端（FSM/grammar），并用 **RadixAttention 自动复用相同前缀的 KV 缓存**。
- **可借鉴**：M4 用 DeepSeek API 无法用 RadixAttention，但可等效利用 DeepSeek 官方**上下文缓存**（cache hit 输入价约为 miss 的 1/50）：把不变的 system prompt + schema 描述放消息最前，分块请求间命中缓存（见第 4 节）。
- **来源**：Zheng et al., NeurIPS 2024, arXiv:2312.07104 <https://arxiv.org/abs/2312.07104>

**StructuredRAG: JSON Response Formatting with Large Language Models**
- **核心方法**：Weaviate 团队系统评测 **f-String prompting**（JSON 模板填空）vs **Follow-the-Format (FF) prompting**（给完整期望输出示例）。24 组实验平均成功率仅 **82.55%**，任务间方差极大（0-100%），列表/复合对象最难。
- **可借鉴**：① 光靠提示词无法保证 JSON 合法，M4 必须有校验/重试/修复兜底；② FF（完整示例）整体优于模板填空，提示词应带完整 ContentPack 示例。
- **局限性**：评测模型为 Gemini 1.5 Pro 与 Llama 3 8B（量化版），对当今更强模型偏保守，但"方差大"的教训成立。
- **来源**：Shorten et al. (Weaviate), arXiv:2408.11061 <https://arxiv.org/abs/2408.11061>；代码 <https://github.com/weaviate/structured-rag>

### 1.3 文档层级抽取（与 M4 直接对应）

**PDF-to-Tree: Parsing PDF Text Blocks into a Tree**
- **核心方法**：把 PDF 文本块（可上千个）组织成树——transition-based parser（转移式贪心解析）+ 多模态特征编码解析状态。动机正是 **RAG 需要把长文档切成"节-小节"层级**来索引，与 M4 目标几乎一致。自建数据集准确率 **93.93%**，超基线 6.72%。
- **可借鉴**：① 用文本块的**位置+字体特征**（字号、粗体、缩进）编码后交模型判层级，远好于纯文本；② "状态转移"思想可简化为"编号块列表（含字体/坐标元数据）→ 树"提示词。
- **局限性**：需训练专用模型；面向英文 PDF，中文/大气遥感需自行适配。
- **来源**：Zhang et al., EMNLP 2024 Findings, pp.10704-10714, DOI 10.18653/v1/2024.findings-emnlp.628 <https://aclanthology.org/2024.findings-emnlp.628/>；代码 <https://github.com/yuezh000/PDF-to-Tree>

**DocHieNet: A Large and Diverse Dataset for Document Hierarchy Parsing**
- **核心方法**：发布大规模多类型文档层级解析（DHP）数据集，提出同时捕捉细粒度文本与粗粒度布局元素的框架，处理多页多级挑战。指出此前 DHP 受困"数据集小、类型单一、标注标准不一"。
- **可借鉴**：① 层级解析难点是多页、多级、跨类型不一致——M4 应先做"文档类型检测"（论文/教程/手册）；② "布局元素级 + 文本级双粒度"对应"解析库给块级特征 + LLM 给语义层级"。
- **局限性**：数据集/基准论文，方法需训练，不能零样本使用。
- **来源**：Xing et al., EMNLP 2024, pp.1129-1142, DOI 10.18653/v1/2024.emnlp-main.65 <https://aclanthology.org/2024.emnlp-main.65/>

**From Local to Global: A GraphRAG Approach to Query-Focused Summarization**
- **核心方法**：两阶段——Local 抽取实体关系并构建社区层级（Leiden 检测），Global 沿社区层级自底向上生成摘要。"**局部抽取 + 层级归并**"最有影响力的工程实现。
- **可借鉴**：M4 的"分块抽取 + 层级归并"照搬此骨架：每块独立抽取 → 按标题/编号线索归并成树 → 自底向上生成逐层讲解。教训：归并阶段必须保留块级来源指针。
- **来源**：Edge et al. (Microsoft Research), arXiv:2404.16130 <https://arxiv.org/abs/2404.16130>

**DocETL: Agentic Query Rewriting and Evaluation for Complex Document Processing**
- **核心方法**：文档处理流水线的声明式 LLM 操作符（declare → map → reduce），带自动查询重写与逐步骤评估（LLM-as-judge）。
- **可借鉴**：M4 把"抽大纲 → 填充 → 归并树"声明为 map-reduce 流水线，每步配轻量校验操作符（结构合法性、层级一致性）。
- **来源**：Shankar et al., PVLDB Vol.18, p.3035 <https://www.vldb.org/pvldb/vol18/p3035-shankar.pdf>

---

## 2. PDF → 文本/结构解析的开源工具链（一手官方文档/仓库）

> 星数与许可证为 2026-10 经 GitHub API 抓取的实时值。

| 工具 | 定位 | 许可证 | 星标 | 标题层级 | Windows + Python 可用性 |
|---|---|---|---|---|---|
| **pdfplumber** | 底层字符/线/矩形/表格精细抽取 | **MIT** | ~10.8k | 不直接给层级；输出每字符字体/字号/坐标，可自行做标题启发式 | ✅ 纯 Python（pdfminer.six），`pip install pdfplumber`，官方测试 Python 3.10-3.14 |
| **PyMuPDF** | 高性能全能引擎（C 内核 MuPDF） | **AGPL-3.0**（商用需 Artifex 授权） | ~10.9k | **`Document.get_toc()` 直接取 PDF 书签树**；`get_text()` 支持 Markdown 输出；官方自述 "LLM-ready — JSON & native Markdown output for RAG" | ✅ 官方 wheel 覆盖 Windows，无强制外部依赖；OCR 需 tessdata |
| **pdf.js** | Mozilla 的 PDF viewer（浏览器端） | **Apache-2.0** | ~54k | 无文档逻辑层级；`getTextContent()` 只按渲染顺序给文本项 | ✅ 前端预览用；后端抽取不推荐 |
| **marker** | PDF→Markdown/JSON/chunks/HTML 高精度转换（Datalab 团队） | 代码 **Apache-2.0**，模型 **OpenRAIL-M** | ~40.5k | 输出 Markdown 含标题层级；`--use_llm` 可增强（兼容 OpenAI 端点，可接 DeepSeek）；olmocr-bench 综合 **76.0%**（原生数字 PDF 83.5%） | ⚠️ 需 PyTorch + vLLM（GPU/Docker）或 llama.cpp（CPU）；Windows CPU 理论可行但依赖重 |
| **unstructured** | 通用文档 ETL：partition 成元素再 chunk | **Apache-2.0** | ~15.6k | 部分：有 `Title` 元素类型；`chunk_by_title` 按标题边界分块（默认 `max_characters=500`） | ✅ fast 路径无重依赖；hi_res 需 ONNX 模型 |
| **GROBID** | 学术论文专用 ML 抽取引擎（Inria，2008 起） | **Apache-2.0** | ~5.2k | **最强**：header/参考文献（F1≈0.87-0.90）/**全文结构化（section titles、段落、图表、脚注）**，输出 TEI XML 树 | ⚠️ Java + Gradle + 模型；官方主推 Docker；Windows 原生安装麻烦 |
| **Docling**（补充推荐） | IBM 文档→gen AI 格式转换，内置层级分块 | **MIT** | ~69k | DoclingDocument 带标题层级；**HybridChunker** 先按层级切分再做 token 感知拆分/合并 | ✅ 纯 Python `pip install docling` |

### 关键结论（一手来源）

1. **pdfplumber 是"显微镜"，不给结构**。官方 README："Plumb a PDF for detailed information about each char, rectangle, line"、"Works best on machine-generated, rather than scanned, PDFs"。适合做标题启发式原料，不适合直接产出层级。来源：<https://github.com/jsvine/pdfplumber>
2. **PyMuPDF 是速度与结构线索的最优选择**。官方 README："The PDF engine behind over 50 million monthly downloads, powering AI pipelines worldwide… LLM-ready"；官方文档确认 `Document.get_toc()`（"extract the table of contents"）与 Markdown 输出。来源：<https://github.com/pymupdf/PyMuPDF>；<https://pymupdf.readthedocs.io/en/latest/document.html>；<https://pymupdf.readthedocs.io/en/latest/the-basics.html>。⚠️ **许可证红线**：官方 LICENSE 为 AGPL-3.0，闭源商用前需评估（Artifex 有商业授权线）。
3. **marker 高精度但重**。官方 README：支持 PDF/image/PPTX/DOCX/XLSX/HTML/EPUB，表格/公式/链接/代码块，可接 LLM 增强；性能来自第三方 olmocr-bench（1,403 PDF）。Windows 开发机依赖负担大。来源：<https://github.com/VikParuchuri/marker>（README 安装与性能章节）
4. **unstructured 提供"元素 + 标题分块"中等方案**。官方文档确认 `Title`/`NarrativeText`/`Table`/`PageBreak` 元素类型与 `chunk_by_title` 聚合逻辑（`max_characters` 默认 500，`new_after_n_chars`、`overlap` 可调）。来源：<https://docs.unstructured.io/concepts/document-elements.md>；<https://docs.unstructured.io/open-source/core-functionality/chunking.md>
5. **GROBID 是学术论文层级化金标准，部署重**。官方 README 列出全文结构化能力（section titles、段落、图表、脚注）与引用抽取 F1 数据；TEI XML 天然是树。大气遥感英文论文（IMRaD）可直接用其 section 标注当 M4 骨架。来源：<https://github.com/kermitt2/grobid>；<https://grobid.readthedocs.io/en/latest/>
6. **pdf.js 只做前端预览**。官方 README："a Portable Document Format (PDF) viewer that is built with HTML5"。来源：<https://github.com/mozilla/pdf.js>
7. **Docling 是高性价比选项**（MIT + 69k stars）。官方文档 HybridChunker 描述与 M4 需求几乎逐字对应："starts from the result of the hierarchical chunker… splits chunks only when needed（token 超限才拆）… merges chunks only when possible（同标题下小块合并，`merge_peers` 可关）"，另有 `repeat_table_header`。来源：<https://docling-project.github.io/docling/concepts/chunking/>

---

## 3. JSON Schema 约束生成：OpenAI / DeepSeek 现状与无约束实践

### 3.1 DeepSeek API 官方现状（以 api-docs.deepseek.com 为准，2026-10 抓取）

| 能力 | 支持情况 | 细节 |
|---|---|---|
| `response_format={"type":"json_object"}` | ✅ 官方支持（JSON Output） | 必须在 system/user 提示词含 **"json" 字样**并给出期望 JSON 示例；合理设 `max_tokens` 防截断；官方注明偶发返回空 content |
| `response_format={"type":"json_schema", ...}`（OpenAI 式） | ❌ **不支持** | API Reference 中 `response_format.type` 枚举仅 `[text, json_object]`，不要照 OpenAI 文档传 `json_schema` |
| Function Calling / Tool Calls | ✅ 支持（OpenAI 兼容） | 常规与 thinking 模式均可用 |
| Function Calling **strict mode（Beta）** | ✅ 支持 | 需 `base_url="https://api.deepseek.com/beta"` + 工具定义 `"strict": true`；服务端按 JSON Schema 校验；要求**所有属性 required + `additionalProperties:false`**；支持 object/string/number/integer/boolean/array/enum/anyOf；string 支持 `pattern`/`format`（email/hostname/ipv4/ipv6/uuid），**不支持 minLength/maxLength** |
| 上下文 / 最大输出 | 1M 上下文；最大输出 384K token | 默认 max_tokens：非思考 8K、思考 64K（reasoning_effort=max 时 128K） |
| 模型 | `deepseek-flash`、`deepseek-v4-pro` | 均标 ✅ Json Output 与 Tool Calls |
| 上下文缓存 | ✅ 支持 | Flash cache hit 输入 $0.003-0.006/1M token vs miss $0.15-0.3（约 50 倍差距）；输出 $0.6-1.2/1M；命中需严格相同前缀 |

来源：<https://api-docs.deepseek.com/guides/json_mode>；<https://api-docs.deepseek.com/api/create-chat-completion>（response_format 定义、max_tokens、context length）；<https://api-docs.deepseek.com/guides/tool_calls>（strict mode）；<https://api-docs.deepseek.com/quick_start/pricing>（模型表与价格）

### 3.2 本项目 API Key 实测（Lead 直连实测，2026-10-18，与官方文档交叉印证）

- **可用模型仅 `deepseek-flash` 与 `deepseek-v4-pro`**（GET /models 实测）；没有 `deepseek-chat`/`deepseek-reasoner`；传 `"model":"deepseek-chat"` 会被透明映射到 `deepseek-flash`（容错但应显式用真实模型名）。
- **`json_object` 两个模型均实测返回合法 JSON**（finish_reason=stop）；v4-pro 输出更规范，flash 更快更省——默认 flash、重试/复杂文档用 v4-pro。
- **流式（SSE）+ json_object 可同时用**，增量 delta 拼接后才是完整 JSON；前端修复重试逻辑仍应保留。
- 来源：本项目实测记录（原报告文件，2026-10-18）；与官方 json_mode 指南一致 <https://api-docs.deepseek.com/guides/json_mode>

### 3.3 OpenAI Structured Outputs（对照）

- OpenAI 2024-08-06 发布 Structured Outputs：模型输出可靠遵循开发者 JSON Schema，官方公告明确 "Under the hood — Constrained decoding"（schema 编译为采样层约束），官方宣称 gpt-4o-2024-08-06 在内部评测中 100% 遵循 schema。这是 DeepSeek `json_object`（只保证"是合法 JSON"，不保证符合你的 schema）与 OpenAI 方案的**关键差别**。
- 来源：<https://openai.com/index/introducing-structured-outputs-in-the-api/>

### 3.4 不用官方 schema 约束时的工程实践（M4 核心兜底）

1. **提示词骨架 + 完整示例（FF prompting）**：StructuredRAG 证明完整示例优于模板填空，但平均成功率仅 82.55%，必须配修复链。来源：arXiv:2408.11061
2. **JSON 修复库**：
   - Python：`json_repair`（`pip install json-repair`）——官方 README 定位"Repair malformed JSON from LLMs, APIs, logs"：补引号/逗号/括号、去多余散文、修截断、`None/True/False` 转换、支持 **schema-guided repair**。来源：<https://github.com/mangiucugna/json_repair>
   - JS/TS：`jsonrepair`（`npm install jsonrepair`）——同类修复 + 流式 API、剥离 json 代码围栏、修复截断 JSON、NDJSON 拼数组。来源：<https://github.com/josdejong/jsonrepair>
3. **校验-重试循环**：解析失败 → json_repair → JSON Schema 校验（jsonschema/ajv）→ 失败则把错误回喂重试（≤3 次，指数退避）→ 仍失败降级（该块标记 `unreliable: true`）。显式处理 DeepSeek JSON Output 偶发空 content（官方已警示）。
4. **DeepSeek strict mode 作为"近 schema"替代**：把 ContentPack 节点 schema 定义成 `strict: true` 的 function（如 `submit_content_pack`），以 tool call 形式输出，获得服务端 schema 校验。注意限制：全属性 required + additionalProperties:false + 无 minLength/maxLength，schema 设计需提前适配（层级深度用 enum）。

---

## 4. 层级抽取的实用策略（有出处的工程实践）

### 4.1 两阶段（先大纲后填充）与分块+归并

1. **两阶段范式**：第一阶段抽取标题树，第二阶段按标题边界逐节填充（LangChain 官方 how-to "How to structure documents" 的范式；其 MarkdownHeaderTextSplitter 按标题层级切分并携带各级标题元数据）。来源：<https://docs.langchain.com/oss/python/integrations/splitters/markdown_header_metadata_splitter>
2. **Docling HybridChunker 给出分块+归并的精确参数化实现**：层级切分 → token 感知拆分（超限才拆）→ 同标题小块合并。回答"分块大小怎么定"：**模型 token 预算为硬上限，标题边界为软边界**。来源：<https://docling-project.github.io/docling/concepts/chunking/>
3. **unstructured chunk_by_title 是轻量同款**：默认 500 字符块、按 Title 聚合、超限才硬切。来源：<https://docs.unstructured.io/open-source/core-functionality/chunking.md>
4. **GraphRAG "局部→全局"**：块级抽取 → 层级归并 → 自底向上总结；必须保留块级引用指针。来源：arXiv:2404.16130
5. **PDF-to-Tree 实证**：块级特征（字体/位置）+ 转移式判定可达 93.93% 结构准确率——大部分层级问题可用结构特征解决，LLM 只需处理语义残余。来源：DOI 10.18653/v1/2024.findings-emnlp.628

### 4.2 论文专属结构（IMRaD、标题编号启发式）

1. **GROBID 是 IMRaD 层级化事实标准**：full text structuring 直接输出 section 树（section titles、段落归属）。英文论文可先拿 TEI XML 骨架，DeepSeek 只做"骨架 → ContentPack + 中文讲解"。来源：<https://github.com/kermitt2/grobid>（README："Full text extraction and structuring… a model for the overall document segmentation and models for the structuring of the text body (paragraph, section titles, reference and footnote callouts, figures, tables…)"）
2. **PyMuPDF `get_toc()` 免费拿层级骨架**：多数论文 PDF 内嵌出版商生成的书签树（1/2/3 级标题），一步得到层级。无书签时回退字体启发式（span 字号聚类：基准字号以上的突变即标题候选）+ 编号正则 `^(d+(.d+)*)s` 定级。来源：<https://pymupdf.readthedocs.io/en/latest/document.html>
3. **编号标题正则启发式**是广泛使用的确定性补充（被上述各解析器以不同形式采用；本报告建议：先书签、再字体、再编号正则，三者置信度加权后交 LLM 终裁）。

### 4.3 长文档与成本控制

- DeepSeek 1M 上下文 + 384K 输出上限：**一篇大气遥感论文（典型 5-20K token）可整篇一次抽取**——整篇 → 直接输出完整 ContentPack 树，简单且层级一致。只有文档 >50K token（学位论文、大部头手册）才切换"分块抽取 + 归并"。
- 分块时把不变前缀（system prompt + schema 描述 + few-shot 示例）放最前以命中**上下文缓存**（输入价差约 50 倍）。来源：<https://api-docs.deepseek.com/quick_start/pricing>

---

## 5. 顺手确认：mammoth（"pdf.js 作者的新文档解析项目"）是否真的存在？

**结论：不存在。传闻不实，M4 不应基于它做任何设计。**

1. **pdf.js 作者 Andreas Gal 的 GitHub 公开仓库（20 个，经 GitHub API 核查）中没有任何名为 mammoth 的文档解析项目**。来源：<https://api.github.com/users/andreasgal/repos>
2. **真实存在且与文档相关的 "mammoth" 是 mwilliamson/mammoth.js**：.docx 转 HTML 的库（BSD-2-Clause，~6.3k stars；Python 绑定 python-mammoth ~1.1k stars），与 pdf.js 和 PDF 解析无关。来源：<https://github.com/mwilliamson/mammoth.js>；<https://github.com/mwilliamson/python-mammoth>
3. 其他 "mammoth" 均不相关：`mammoth-plus`（上述 mammoth.js 的社区 fork）、Mammoth Browser（Android 浏览器）、若干同名安全项目；域名 `mammoth.garden` 无法解析（DNS ENOTFOUND）。
4. 有"Google（Chrome 团队）秘密开发新渲染引擎代号 Mammoth"的传闻（指向 Bloomberg/The Information），但检索不到可核实的一手来源；即便存在也是浏览器渲染引擎，与"文档解析工具"不是一回事。

---

## 6. 对 M4 设计的建议清单（按优先级）

### P0 —— 立即可做且决定架构

1. **默认模型改为 `deepseek-flash`，下拉提供 flash / v4-pro 两个选项**（替代 deepseek-chat/reasoner）。依据：本项目 GET /models 实测（见 3.2）与官方定价页模型表。
2. **代理/后端加 `response_format={"type":"json_object"}`**（仅抽取请求）：按请求是否含抽取提示词判断，或前端请求体加 flag。**不要**传 OpenAI 式 `json_schema`（DeepSeek 不识别，枚举仅 text/json_object）。
3. **提示词骨架**（system prompt；英文骨架 + 中文内容指令皆可，满足官方"含 json 字样 + 示例"要求）：
```
You are a document hierarchy extractor. Output valid JSON only
(the word "json" appears here intentionally).
You will receive a document (or a chunk). Produce a ContentPack tree:
{ "title": ..., "nodes": [ { "id": "stable-slug", "heading": ...,
  "level": 1, "summary": "1-2 sentence gist", "children": [...],
  "contentHint": "verbatim snippet" } ] }
Rules: keep the original document hierarchy; level starts at 1;
for IMRaD papers merge into Introduction/Methods/Results/Discussion/
Conclusion; when unsure pick the deeper level and note it.
EXAMPLE INPUT: ... EXAMPLE JSON OUTPUT: <full example tree>
```
4. **兜底链路（必须有）**：`json.loads` 失败 → `json_repair` → JSON Schema 校验（jsonschema/ajv，可复用现有 validatePack）→ 失败回喂错误重试（≤3 次，指数退避；重试换 `deepseek-v4-pro`）→ 仍失败降级标记 `unreliable: true`。显式处理 JSON Output 偶发空 content。
5. **分层策略：整篇优先，分块兜底**。论文（<50K token）整篇一次抽取，`max_tokens` 设 8192-16384。更长文档才分块：**2000-4000 token/块（约 8000-16000 英文字符），沿标题边界切**（markdown `#`/`##` 边界或 GROBID section 边界，绝不硬切；现有 6000 字符+300 重叠硬切应改为标题优先），块间按 (a) 书签层级 (b) 编号正则 `^d+(.d+)*` (c) LLM 判定标题序列 三线索归并。

### P1 —— 提升质量

6. **主解析库用 PyMuPDF（FastAPI 后端）**：`doc.get_toc()` 拿书签骨架 + `page.get_text("blocks")`/span 字体信息做标题候选 + Markdown 输出。**先确认许可证策略**：AGPL-3.0 内部工具/开源可用；闭源商用则换 MIT 的 pdfplumber（放弃 get_toc，用字体启发式补）或买 Artifex 商业授权。
7. **论文类文档可前置 GROBID**（Docker 起服务）：英文论文先拿 TEI XML 骨架，DeepSeek 只做"骨架 → ContentPack + 中文讲解"。
8. **可选高精度转换层 marker / Docling**：marker（`--use_llm` 可接 DeepSeek，OpenAI 兼容端点）或 Docling（MIT，HybridChunker 直接给层级分块）；marker 在 Windows 依赖重，仅在 GPU 或可等 CPU 时用。
9. **前端 pdf.js 只做预览与定位**：渲染 + 按 ContentPack 节点页号/文本锚点高亮，不参与抽取。
10. **成本优化**：分块请求的 system prompt + few-shot 示例保持**严格一致前缀**以命中上下文缓存（命中价 $0.003-0.006/1M vs 未命中 $0.15-0.3/1M）；并行度按官方并发限额（flash 2500）控制。

### P2 —— 迭代期

11. **参考 PDF-to-Tree 的块特征编码**：把每块的 {字号, 粗体, x/y 坐标, 编号} 作为轻量元数据附在文本前再交 LLM，层级判定显著优于纯文本（论文实证 93.93% 来自这类特征）。来源：DOI 10.18653/v1/2024.findings-emnlp.628
12. **自建小评估集**：按 DocHieNet 思路建 20-30 篇中文/大气遥感层级 gold 集 + 自动指标（节点 F1、层级深度误差），每次改提示词跑一遍。来源：DOI 10.18653/v1/2024.emnlp-main.65

### 明确不做 / 注意

- ❌ 不要等 "mammoth"：该"pdf.js 作者新项目"不存在（见第 5 节）。
- ❌ 不要照 OpenAI 文档传 `json_schema` response_format 给 DeepSeek。
- ⚠️ AGPL（PyMuPDF）与 OpenRAIL-M（marker 模型）许可证在商业化前需法务确认。
- ⚠️ unstructured 的 PDF 标题检测是启发式，中文标题误判率高，不要当层级真值。
