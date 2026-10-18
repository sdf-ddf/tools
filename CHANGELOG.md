# Changelog

本项目遵循语义化版本(SemVer)。

## [1.0.0] - 2026-10-18

### Added
- 桌面软件打包:NSIS 安装包 + 便携版 exe(Electron 44 + electron-builder)
- PDF 直接解析(pdfjs-dist 浏览器端,阅读顺序重建,扫描件明确报错)
- M4.1 抽取引擎:校验反馈自修复循环、Follow-the-Format 提示词、多块标题层级归并、jsonrepair 兜底、抽取参数(层级深度/节点上限)与进度显示
- 可视化增强:折线图时间播放、PNG 导出、节点固定对比、上层数值图提示跳转
- 工程级:P0 可靠性(状态持久化、LLM 超时 120s + 可取消、单实例锁)
- P1 工程化:MIT LICENSE、Vitest 单元测试(12 个,核心纯函数)、ESLint + Prettier、CHANGELOG
- 版本标签 v1.0.0 显示于界面

### Fixed
- LLM 抽取 id 重复导致保存校验失败(自动去重 + 保存兜底)
- React StrictMode 双调用导致流式文本交错重复(纯函数 state 更新)
- Windows Defender 锁 electron.exe 导致打包 rename EPERM(electronDist 直指本地)
- SVG 布局宽度漏算 translate(dx) 导致标签溢出

### Changed
- 默认模型改为 deepseek-flash(实测本账号可用);设置弹窗提供 flash/v4-pro 下拉
- 抽取请求启用 json_object 输出模式

## [0.1.0] - 2026-10-17

### Added
- M0:Vite + React + TS + D3 脚手架,分层树(展开/折叠/点选/面包屑)
- M1:内容包 JSON 化 + 导入导出、卡片节点、网络图(力导向)、搜索定位
- M2:LLM 讲解引擎(DeepSeek/OpenAI 兼容/Ollama/mock)、本地流式代理、四段式讲解/下钻/追问
- M3:数值可视化组件库(热力图/矩阵/直方图/折线/散点)+ 底部数值调试台
- M4:文档解析(上传/粘贴 → LLM 抽取 → 预览编辑 → 存为内容包)
