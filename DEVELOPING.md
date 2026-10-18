# Layerview 二次开发指南

> 写给未来的自己/开发者。本文件记录架构、扩展点、以及开发过程中踩过的坑。
> 产品定位与完整 PRD 见 E:/Tools/PRD.md。

## 1. 快速开始

\`\`\`bash
npm install          # 首次
npm run dev          # http://127.0.0.1:5173
npm run build        # tsc --noEmit && vite build(提交前必跑)
npx tsc --noEmit     # 只查类型
\`\`\`

- 端口被占用: \`Get-NetTCPConnection -LocalPort 5173 -State Listen\` 找到 PID 后 kill。
- dev server 是后台任务;改了 vite.config.ts 必须重启(代理配置只在启动时加载)。
- 修改代码后浏览器自动热更(除 vite.config.ts)。

## 2. 架构一览(数据流)

\`\`\`
内容包 JSON(ContentPack)
  → App.tsx(状态:packs / packId / selectedId / expandedIds / viewMode)
     ├─ LayerTree(树形卡片,展开/折叠)
     ├─ NetworkGraph(力导向网络 + 边箭头)
     ├─ SideNav(左侧导航)
     ├─ NodePanel(讲解面板)
     │    → llm/prompts(四段式/下钻/追问模板)
     │    → llm/client(流式 SSE 解析)
     │    → /api/llm/chat(vite.config.ts 本地代理)
     │    → DeepSeek / OpenAI 兼容 / Ollama / mock
     ├─ VizDrawer(底部数值调试台)
     │    → viz/VizRenderer(热力图/矩阵/直方图/折线/散点)
     └─ ExtractModal(文档解析)
          → pdf/extractPdf(pdfjs-dist,浏览器端)
          → llm/extract(分块 + json_object 抽取 + 修复重试)
          → validatePack 校验 → 加入 packs
\`\`\`

## 3. 关键文件

| 文件 | 职责 |
|---|---|
| src/types.ts | 核心数据模型 ContentPack/LayerNode/VizData(一切扩展从这里开始) |
| src/validate.ts | 内容包校验(导入/保存前必过) |
| src/data/*.json | 内置内容包(可直接手写新包) |
| src/data/packs.ts | 内置包注册 + DEV 自检 |
| src/llm/ | types/settings(存 localStorage)/prompts/client/mock/extract |
| src/pdf/extractPdf.ts | PDF 文本提取(阅读顺序重建 + 扫描件检测) |
| vite.config.ts | Vite 配置 + /api/llm/chat 流式代理 |
| scripts/*.py | Playwright 回归(系统 Python 3.13 有 playwright) |
| docs/research/ | M4 调研报告(DeepSeek 能力实测 + PDF 工具链选型) |

## 4. 最常见的 5 个扩展

### 4.1 加一个新内容包
写 JSON(src/data/xxx.json,结构见现有包)→ 在 packs.ts 注册;或页面右上角「导入」直接拖入。
内容包结构参考 PRD.md 第 5 节 + types.ts。

### 4.2 加一种新可视化
1. types.ts 的 VizKind 加新类型 + VizData 加分支;
2. viz/VizRenderer.tsx 的 renderViz 加 case + 新组件(原生 SVG,参考 Heatmap);
3. validate.ts 的 VIZ_KINDS 同步;
4. 内容包 JSON 里给节点挂 visualization 即可。

### 4.3 加/换 LLM provider
1. src/llm/types.ts 加 ProviderKind;
2. vite.config.ts 代理 switch 加分支(URL/认证/请求体);
3. SettingsModal 加 provider 选项。
mock provider 是所有回归测试的离线底座,别删。

### 4.4 加算法动画(PRD 模块 E)
内容包节点挂 visualization(新 kind:"animation")+ 新组件;或独立页面。
参考 VisuAlgo 的"伪代码逐行高亮 + 数据动画同步"。

### 4.5 后端化(如需 PDF 书签树保真)
现状:pdfjs-dist 纯浏览器提取,无后端。若要论文书签/标题保真:
FastAPI + PyMuPDF get_toc()(注意 AGPL)→ 前端 fetch。详见 docs/research/M4-document-hierarchy-extraction.md。

## 5. 踩过的坑(不要再踩)

1. **React StrictMode**:state updater 必须纯函数。流式拼文本时曾用 last.content += delta
   原地突变 → StrictMode 双调用导致文本交错重复。正确做法:返回新对象。
2. **D3 类型**:d3.tree() 的返回值才带确定 x/y;SVG 宽度必须是
   maxX - minX + 余量,漏算 translate(dx) 位移会导致右侧标签溢出画布(被几何校验抓出)。
3. **模板字符串转义**:生成含反引号/反斜杠的代码时,用字符串数组 + join("\n") 写,
   直接拼接模板字符串极易把 \n、\`\`\`、\/ 转义坏(本项目发生过 5+ 次)。
4. **Windows + Playwright**:截图覆盖已存在文件会报 OSError Invalid argument → 每次用
   时间戳文件名;SVG 文本要用 text_content() 不是 inner_text()。
5. **npm Invalid Version**:node_modules 元数据损坏时 → 删 node_modules + package-lock.json 重装。
6. **mock 分支判定顺序**:追问 > 抽取 > 讲解 > 下钻。追问提示词会内嵌历史对话,
   含"逐层下钻"字样,顺序错了会误判(修过一次)。
7. **DeepSeek 实测事实**(2026-10):本 Key 仅 deepseek-flash / deepseek-v4-pro 两个模型;
   json_object 可用但提示词需含"json"字样;不支持 OpenAI 式 json_schema。

## 6. 测试

\`\`\`bash
$env:PYTHONUTF8="1"            # PowerShell 必须,否则中文乱码
python scripts/m3_regression.py   # 数值可视化
python scripts/m4_e2e.py          # 文档解析(mock 离线)
python scripts/pdf_regression.py  # PDF(reportlab 生成的测试 PDF 在 shots/)
\`\`\`

- 真实 API 测试(需 Key,从环境变量读取,不入库):
  \`$env:DEEPSEEK_KEY="sk-..."; python scripts/pdf_real_api.py\`
- 测试 PDF 重新生成(Anaconda 有 reportlab):
  \`E:\Anaconda\python.exe scripts/gen_test_pdfs.py\`

## 7. 未来方向(按需自取)

- 暗色主题 / 键盘快捷键 / 节点收藏 / 讲解历史持久化
- 算法动画(4.4)
- 内容包在线编辑器(不用手改 JSON)
- FastAPI 后端 + PyMuPDF 书签树(4.5)
- TransformerLens 白盒可视化(PRD 模块 H,需 Python 后端)
- 遥感旗舰包(PRD 模块 G,用户决定暂不做,内容包 JSON 随时可写)
