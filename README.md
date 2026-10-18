# Layerview · 分层透视镜

把复杂系统(大模型、算法、论文、遥感反演流程)拆成可点击的分层结构,由大模型逐层讲解,并用动画与数值图直观呈现。

当前进度:**PDF 解析** —— 论文 PDF 可直接解析。

- M0 脚手架:D3 分层树(展开/折叠、点选、面包屑)
- M1 静态教学:内容包 JSON 化 + 导入/导出 + 卡片节点 + 网络图 + 搜索
- M2 LLM 讲解:点选四段式讲解 / 讲到最底层 / 追问链,流式输出,支持 DeepSeek / OpenAI 兼容 / Ollama / Mock
- M3 数值可视化:底部「数值调试台」,热力图/矩阵/直方图/折线/散点,点选节点即切换
- M4 文档解析:上传/粘贴文档(.txt/.md)→ LLM 自动抽取分层 JSON → 预览编辑 → 存为内容包(DeepSeek json_object 实测可用)
- PDF 直接解析:pdfjs-dist 浏览器端提取文本(阅读顺序重建)→ 预览确认 → 复用 M4 抽取引擎;扫描件明确报错

## 运行

```bash
npm install
npm run dev      # http://127.0.0.1:5173
npm run build    # 类型检查 + 产物构建
```

## 配置大模型(右上角「模型」按钮)

| Provider | 说明 |
|---|---|
| DeepSeek | 填 API Key(只存浏览器 localStorage),模型 deepseek-flash(推荐)/ deepseek-v4-pro(实测本账号可用模型) |
| OpenAI 兼容 | 任意 OpenAI 兼容服务,填 Key + baseUrl + 模型名 |
| Ollama | 本地模型,填 Ollama 地址(默认 http://127.0.0.1:11434) |
| Mock | 无需 Key,离线演示流式讲解(回归测试用) |

请求经 Vite 本地代理 `/api/llm/chat` 转发(见 vite.config.ts),API Key 不出本机。

## 目录

- `src/types.ts` —— 通用分层数据模型(ContentPack / LayerNode / Edge)
- `src/data/` —— 内容包(Transformer 架构、卫星遥感数据分级)
- `src/components/` —— D3 分层树、左侧导航、讲解面板、数值调试台(`viz/` 可视化组件库)

## 路线图(见 PRD.md)

M0 ✅ → M1 ✅ → M2 ✅ → M3 ✅ → M4 ✅ → PDF 解析 ✅(M5 遥感旗舰包按用户决定不做)